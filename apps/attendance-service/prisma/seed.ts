import { PrismaClient } from '../generated/client';

const prisma = new PrismaClient();

// Snapshot ids fixed to the rows created by the auth/employee seeds (separate
// schemas — the services join by email, not a DB foreign key).
const BUDI_EMPLOYEE_ID = '10000000-0000-4000-8000-000000000002';
const BUDI_USER_ID = '00000000-0000-4000-8000-000000000002';
// Fixed date keeps the seed idempotent forever (a "today" date would add a new
// row on each new day).
const SAMPLE_DATE = new Date('2026-01-05T00:00:00.000Z');

const SAMPLE_ATTENDANCE = {
  employeeId: BUDI_EMPLOYEE_ID,
  employeeName: 'Budi Santoso',
  userId: BUDI_USER_ID,
  date: SAMPLE_DATE,
  checkInAt: new Date('2026-01-05T01:00:00.000Z'),
  checkOutAt: new Date('2026-01-05T10:00:00.000Z'),
  photoUrl: '/uploads/placeholder.png',
  note: 'Seeded sample WFH attendance',
};

async function main(): Promise<void> {
  await prisma.attendance.upsert({
    where: {
      employeeId_date: {
        employeeId: SAMPLE_ATTENDANCE.employeeId,
        date: SAMPLE_ATTENDANCE.date,
      },
    },
    update: SAMPLE_ATTENDANCE,
    create: SAMPLE_ATTENDANCE,
  });
  const count = await prisma.attendance.count();
  console.log(`[seed:attendance] attendances=${count}`);
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
