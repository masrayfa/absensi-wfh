import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import {
  CheckInDto,
  CheckOutDto,
  ListAttendanceQueryDto,
  TCP_PATTERNS,
} from '@app/contracts';
import { AttendanceService } from './attendance.service';

@Controller()
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  @MessagePattern(TCP_PATTERNS.ATTENDANCE_CHECK_IN)
  checkIn(@Payload() dto: CheckInDto) {
    return this.attendance.checkIn(dto);
  }

  @MessagePattern(TCP_PATTERNS.ATTENDANCE_CHECK_OUT)
  checkOut(@Payload() dto: CheckOutDto) {
    return this.attendance.checkOut(dto);
  }

  @MessagePattern(TCP_PATTERNS.ATTENDANCE_LIST)
  list(@Payload() query: ListAttendanceQueryDto) {
    return this.attendance.list(query);
  }

  @MessagePattern(TCP_PATTERNS.ATTENDANCE_GET)
  get(@Payload() dto: { id: string }) {
    return this.attendance.get(dto.id);
  }
}
