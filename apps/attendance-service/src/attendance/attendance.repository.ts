import { Injectable } from '@nestjs/common';
import { ListAttendanceQueryDto } from '@app/contracts';
import { PrismaService } from '../prisma/prisma.service';

/** Fields resolved by the service before the insert. `date`/`checkInAt` are Dates. */
export interface AttendanceCreateData {
  employeeId: string;
  employeeName: string;
  userId: string;
  date: Date;
  checkInAt: Date;
  photoUrl: string;
  note?: string;
}

/**
 * A `@db.Date` column carries no time. Normalise any date-ish string to UTC
 * midnight so equality/queries line up with the seed rows.
 */
export function dateOnly(value: string): Date {
  return new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
}

/**
 * All Prisma access for attendance lives here. No generated-client type leaks
 * out; callers get inferred row types from the PrismaService delegate.
 */
@Injectable()
export class AttendanceRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: AttendanceCreateData) {
    return this.prisma.attendance.create({ data });
  }

  findById(id: string) {
    return this.prisma.attendance.findUnique({ where: { id } });
  }

  findByEmployeeAndDate(employeeId: string, date: Date) {
    return this.prisma.attendance.findUnique({
      where: { employeeId_date: { employeeId, date } },
    });
  }

  /**
   * Atomically closes today's open row. The `checkOutAt: null` filter is part
   * of the UPDATE, so concurrent check-outs cannot both win; `null` means there
   * was no open record (never checked in, or already checked out).
   */
  async checkOutOpen(employeeId: string, date: Date, at: Date) {
    const { count } = await this.prisma.attendance.updateMany({
      where: { employeeId, date, checkOutAt: null },
      data: { checkOutAt: at },
    });
    if (count === 0) return null;
    return this.findByEmployeeAndDate(employeeId, date);
  }

  list({ employeeId, from, to }: ListAttendanceQueryDto) {
    return this.prisma.attendance.findMany({
      where: {
        ...(employeeId ? { employeeId } : {}),
        ...(from || to
          ? {
              date: {
                ...(from ? { gte: dateOnly(from) } : {}),
                ...(to ? { lte: dateOnly(to) } : {}),
              },
            }
          : {}),
      },
      orderBy: { date: 'desc' },
    });
  }
}
