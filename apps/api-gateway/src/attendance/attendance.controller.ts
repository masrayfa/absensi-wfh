import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { diskStorage } from 'multer';
import { CurrentUser, Roles } from '@app/common';
import { ListAttendanceQueryDto, Role } from '@app/contracts';
import { uploadRoot } from '../common/uploads';
import { AttendanceService } from './attendance.service';

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

@ApiTags('attendance')
@ApiBearerAuth()
@Controller('attendance')
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  @Post('check-in')
  @Roles(Role.EMPLOYEE)
  @UseInterceptors(
    FileInterceptor('photo', {
      storage: diskStorage({
        destination: uploadRoot,
        filename: (_req, file, cb) => {
          const ext = extname(file.originalname).toLowerCase();
          cb(null, `${randomUUID()}${/^\.[a-z0-9]+$/.test(ext) ? ext : ''}`);
        },
      }),
      limits: { fileSize: MAX_PHOTO_BYTES },
      fileFilter: (_req, file, cb) => {
        if (!file.mimetype.startsWith('image/')) {
          cb(new BadRequestException('photo must be an image'), false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['photo'],
      properties: { photo: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOperation({
    summary: 'Check in for today (WIB) with a required photo; same-day re-check-in is idempotent',
  })
  checkIn(
    @CurrentUser('email') email: string,
    @CurrentUser('sub') userId: string,
    @UploadedFile() photo: Express.Multer.File | undefined,
  ) {
    if (!photo) throw new BadRequestException('photo is required');
    return this.attendance.checkIn(email, userId, `/uploads/${photo.filename}`);
  }

  @Post('check-out')
  @Roles(Role.EMPLOYEE)
  @ApiOperation({ summary: "Close today's open attendance (EMPLOYEE)" })
  checkOut(@CurrentUser('email') email: string) {
    return this.attendance.checkOut(email);
  }

  @Get('me')
  @Roles(Role.EMPLOYEE)
  @ApiOperation({ summary: "The caller's own attendance, newest first (EMPLOYEE)" })
  listMine(
    @CurrentUser('email') email: string,
    @Query() query: ListAttendanceQueryDto,
  ) {
    return this.attendance.listMine(email, query);
  }

  @Get()
  @Roles(Role.HRD)
  @ApiOperation({
    summary: 'List all attendance, filter by employeeId/from/to, read-only (HRD)',
  })
  list(@Query() query: ListAttendanceQueryDto) {
    return this.attendance.list(query);
  }

  @Get(':id')
  @Roles(Role.HRD)
  @ApiOperation({ summary: 'Get one attendance record (HRD)' })
  getById(@Param('id') id: string) {
    return this.attendance.get(id);
  }
}
