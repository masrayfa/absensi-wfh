import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { CheckInDto, ListAttendanceQueryDto } from '@app/contracts';
import { wibDateOf } from '@app/common';
import { AppModule } from '../src/app.module';
import { AttendanceService } from '../src/attendance/attendance.service';
import { PrismaService } from '../src/prisma/prisma.service';

/** Unique namespace per run so the suite is re-runnable and cleanup is scoped. */
const PREFIX = `t12-${Date.now()}`;
const EMP = (name: string) => `${PREFIX}-${name}`;
const PHOTO_URL = `/uploads/${PREFIX}.png`;

function checkInDto(
  employeeId: string,
  over: Partial<CheckInDto> = {},
): CheckInDto {
  return {
    employeeId,
    employeeName: 'Test Karyawan',
    userId: `${PREFIX}-user`,
    photoUrl: PHOTO_URL,
    ...over,
  };
}

/** A `@db.Date` value: UTC midnight, matching what the repository writes. */
function dateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

describe('attendance-service (against real attendance_db)', () => {
  let moduleRef: TestingModule;
  let attendance: AttendanceService;
  let prisma: PrismaService;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    await moduleRef.init();
    attendance = moduleRef.get(AttendanceService);
    prisma = moduleRef.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.attendance.deleteMany({
      where: { employeeId: { startsWith: PREFIX } },
    });
    await moduleRef.close();
  });

  it('parallel check-ins for one employee/day create exactly ONE row, all callers get it, photoUrl + WIB date stored', async () => {
    const employeeId = EMP('parallel');

    const results = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        attendance.checkIn(
          checkInDto(employeeId, { userId: `${PREFIX}-user-${i}` }),
        ),
      ),
    );

    const ids = new Set(results.map((r) => r?.id));
    expect(ids.size).toBe(1);

    const row = results[0]!;
    expect(row).toMatchObject({ employeeId, employeeName: 'Test Karyawan' });
    expect(row.photoUrl).toBe(PHOTO_URL);
    expect(wibDateOf(row.date)).toBe(wibDateOf(new Date()));

    expect(await prisma.attendance.count({ where: { employeeId } })).toBe(1);
  });

  it('check-out without a check-in is a conflict', async () => {
    await expect(
      attendance.checkOut({ employeeId: EMP('no-checkin') }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('check-out closes the open record, a second check-out is a conflict', async () => {
    const employeeId = EMP('double-out');
    await attendance.checkIn(checkInDto(employeeId));

    const closed = await attendance.checkOut({ employeeId });
    expect(closed.checkOutAt).toBeInstanceOf(Date);

    await expect(attendance.checkOut({ employeeId })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('check-in without photoUrl (empty or whitespace) is a validation error', async () => {
    const empty = EMP('no-photo-empty');
    const blank = EMP('no-photo-blank');

    await expect(
      attendance.checkIn(checkInDto(empty, { photoUrl: '' })),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      attendance.checkIn(checkInDto(blank, { photoUrl: '   ' })),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(await prisma.attendance.count({ where: { employeeId: empty } })).toBe(0);
    expect(await prisma.attendance.count({ where: { employeeId: blank } })).toBe(0);
  });

  it('list filters by employee and inclusive date range; get by id; get unknown is NotFound', async () => {
    const employeeId = EMP('list');
    const other = EMP('list-other');
    await prisma.attendance.createMany({
      data: [
        { employeeId, employeeName: 'X', userId: 'u', date: dateOnly('2026-02-01'), checkInAt: dateOnly('2026-02-01'), photoUrl: PHOTO_URL },
        { employeeId, employeeName: 'X', userId: 'u', date: dateOnly('2026-02-05'), checkInAt: dateOnly('2026-02-05'), photoUrl: PHOTO_URL },
        { employeeId, employeeName: 'X', userId: 'u', date: dateOnly('2026-02-10'), checkInAt: dateOnly('2026-02-10'), photoUrl: PHOTO_URL },
        { employeeId: other, employeeName: 'Y', userId: 'u', date: dateOnly('2026-02-05'), checkInAt: dateOnly('2026-02-05'), photoUrl: PHOTO_URL },
      ],
    });

    const mine = await attendance.list({ employeeId });
    expect(mine).toHaveLength(3);
    expect(mine.every((r) => r.employeeId === employeeId)).toBe(true);

    const range: ListAttendanceQueryDto = {
      employeeId,
      from: '2026-02-02',
      to: '2026-02-06',
    };
    const ranged = await attendance.list(range);
    expect(ranged.map((r) => r.date.toISOString().slice(0, 10))).toEqual([
      '2026-02-05',
    ]);

    const sameDay = await attendance.list({
      from: '2026-02-05',
      to: '2026-02-05',
    });
    expect(sameDay.map((r) => r.employeeId).sort()).toEqual(
      [employeeId, other].sort(),
    );

    const fetched = await attendance.get(ranged[0]!.id);
    expect(fetched).toMatchObject({ id: ranged[0]!.id, employeeId });

    await expect(
      attendance.get('00000000-0000-4000-8000-000000000000'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
