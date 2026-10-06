import { randomUUID } from 'node:crypto';
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

/**
 * Raster-only allowlist: accepted mimetype -> stored extension. The stored
 * extension is looked up here, never taken from the client filename, so an
 * `.html`/`.svg`/`.js` upload can neither pass the filter nor be stored with
 * its original extension. `image/svg+xml` is deliberately absent: SVG is
 * active content and would be scriptable when served back to a browser.
 */
const PHOTO_EXTENSIONS: Readonly<Record<string, string>> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

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
          cb(null, `${randomUUID()}${PHOTO_EXTENSIONS[file.mimetype] ?? ''}`);
        },
      }),
      limits: { fileSize: MAX_PHOTO_BYTES },
      fileFilter: (_req, file, cb) => {
        if (!PHOTO_EXTENSIONS[file.mimetype]) {
          cb(
            new BadRequestException('photo must be a PNG, JPEG, WebP, or GIF image'),
            false,
          );
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
