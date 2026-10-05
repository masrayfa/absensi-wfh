import { EmployeeStatus, PrismaClient } from '../generated/client';

const prisma = new PrismaClient();

const SEED_EMPLOYEES = [
  {
    id: '10000000-0000-4000-8000-000000000002',
    employeeNo: 'EMP-001',
    fullName: 'Budi Santoso',
    email: 'budi@dexa.test',
    department: 'Engineering',
    position: 'Backend Engineer',
    phone: '081200000001',
    joinDate: new Date('2024-01-15T00:00:00.000Z'),
    status: EmployeeStatus.ACTIVE,
  },
  {
    id: '10000000-0000-4000-8000-000000000003',
    employeeNo: 'EMP-002',
    fullName: 'Siti Aminah',
    email: 'siti@dexa.test',
    department: 'People',
    position: 'HR Generalist',
    phone: '081200000002',
    joinDate: new Date('2024-03-01T00:00:00.000Z'),
    status: EmployeeStatus.ACTIVE,
  },
  {
    id: '10000000-0000-4000-8000-000000000004',
    employeeNo: 'EMP-003',
    fullName: 'Andi Wijaya',
    email: 'andi@dexa.test',
    department: 'Finance',
    position: 'Accountant',
    phone: '081200000003',
    joinDate: new Date('2024-06-10T00:00:00.000Z'),
    status: EmployeeStatus.ACTIVE,
  },
];

async function main(): Promise<void> {
  for (const employee of SEED_EMPLOYEES) {
    // id only on create; update must not touch the primary key.
    const { id, ...rest } = employee;
    await prisma.employee.upsert({
      where: { employeeNo: employee.employeeNo },
      update: rest,
      create: { id, ...rest },
    });
  }
  const count = await prisma.employee.count();
  console.log(`[seed:employee] employees=${count}`);
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
