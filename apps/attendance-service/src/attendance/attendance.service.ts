import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CheckInDto,
  CheckOutDto,
  ListAttendanceQueryDto,
} from '@app/contracts';
import { wibDateOf } from '@app/common';
import { AttendanceRepository, dateOnly } from './attendance.repository';

@Injectable()
export class AttendanceService {
  constructor(private readonly attendance: AttendanceRepository) {}

  /**
   * Insert today's WIB attendance. The unique `(employeeId, date)` index is the
   * concurrency primitive: parallel calls race the insert, exactly one wins, and
   * every loser returns that same row (idempotent — re-check-in is not an error).
   */
  async checkIn(dto: CheckInDto) {
    if (!dto.photoUrl || !dto.photoUrl.trim()) {
      throw new BadRequestException('photoUrl is required on check-in');
    }

    const date = dateOnly(wibDateOf(new Date()));
    try {
      return await this.attendance.create({
        employeeId: dto.employeeId,
        employeeName: dto.employeeName,
        userId: dto.userId,
        date,
        checkInAt: new Date(),
        photoUrl: dto.photoUrl,
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        // Someone already checked in for this employee/day — return their row.
        return this.attendance.findByEmployeeAndDate(dto.employeeId, date);
      }
      throw err;
    }
  }

  /** Close today's open record. No open record (never checked in, or already out) → conflict. */
  async checkOut({ employeeId }: CheckOutDto) {
    const date = dateOnly(wibDateOf(new Date()));
    const closed = await this.attendance.checkOutOpen(
      employeeId,
      date,
      new Date(),
    );
    if (!closed) {
      throw new ConflictException(
        'No open attendance for today — check in first or already checked out',
      );
    }
    return closed;
  }

  list(query: ListAttendanceQueryDto) {
    return this.attendance.list(query);
  }

  async get(id: string) {
    const row = await this.attendance.findById(id);
    if (!row) throw new NotFoundException(`Attendance ${id} not found`);
    return row;
  }
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === 'P2002'
  );
}
