import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EmployeeStatus, CreateEmployeeDto } from '@app/contracts';
import { AppModule } from '../src/app.module';
import { EmployeeService } from '../src/employee/employee.service';
import { PrismaService } from '../src/prisma/prisma.service';

/** A fresh employee number/email per run so the suite is re-runnable. */
function uniqueSuffix(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

function newEmployee(employeeNo: string, email: string): CreateEmployeeDto {
  return {
    employeeNo,
    fullName: 'Test Karyawan',
    email,
    department: 'QA',
    position: 'Tester',
    phone: '081299999999',
    joinDate: '2025-01-15',
  };
}

describe('employee-service (against real employee_db)', () => {
  let moduleRef: TestingModule;
  let employees: EmployeeService;
  let prisma: PrismaService;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    await moduleRef.init();
    employees = moduleRef.get(EmployeeService);
    prisma = moduleRef.get(PrismaService);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('create -> list -> getById/getByEmail -> update -> deactivate', async () => {
    const suffix = uniqueSuffix();
    const employeeNo = `T09-${suffix}`;
    const email = `t09-${suffix}@dexa.test`;
    try {
      const created = await employees.create(newEmployee(employeeNo, email));
      expect(created).toMatchObject({
        id: expect.any(String),
        employeeNo,
        email,
        fullName: 'Test Karyawan',
        status: EmployeeStatus.ACTIVE,
      });

      const listed = await employees.list({ search: employeeNo });
      expect(listed.map((e) => e.id)).toContain(created.id);

      await expect(employees.getById(created.id)).resolves.toMatchObject({ id: created.id });
      await expect(employees.getByEmail(email)).resolves.toMatchObject({ id: created.id });

      const updated = await employees.update(created.id, {
        fullName: 'Updated Karyawan',
        department: 'Engineering',
      });
      expect(updated).toMatchObject({
        id: created.id,
        fullName: 'Updated Karyawan',
        department: 'Engineering',
        email,
      });

      const deactivated = await employees.deactivate(created.id);
      expect(deactivated.status).toBe(EmployeeStatus.INACTIVE);
    } finally {
      await prisma.employee.deleteMany({ where: { email } });
    }
  });

  it('rejects a duplicate employeeNo with ConflictException', async () => {
    const suffix = uniqueSuffix();
    // EMP-001 belongs to the seeded Budi.
    await expect(
      employees.create(newEmployee('EMP-001', `t09-${suffix}@dexa.test`)),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects a duplicate email with ConflictException', async () => {
    const suffix = uniqueSuffix();
    await expect(
      employees.create(newEmployee(`T09-${suffix}`, 'budi@dexa.test')),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('excludes a deactivated employee from the default list but returns it for INACTIVE', async () => {
    const suffix = uniqueSuffix();
    const employeeNo = `T09-${suffix}`;
    const email = `t09-${suffix}@dexa.test`;
    try {
      const created = await employees.create(newEmployee(employeeNo, email));
      await employees.deactivate(created.id);

      const activeList = await employees.list({ search: employeeNo });
      expect(activeList.map((e) => e.id)).not.toContain(created.id);

      const inactiveList = await employees.list({
        search: employeeNo,
        status: EmployeeStatus.INACTIVE,
      });
      expect(inactiveList.map((e) => e.id)).toContain(created.id);
    } finally {
      await prisma.employee.deleteMany({ where: { email } });
    }
  });

  it('rejects an update that tries to change the immutable email', async () => {
    const suffix = uniqueSuffix();
    const email = `t09-${suffix}@dexa.test`;
    try {
      const created = await employees.create(
        newEmployee(`T09-${suffix}`, email),
      );
      await expect(
        employees.update(created.id, { email: `changed-${suffix}@dexa.test` }),
      ).rejects.toBeInstanceOf(BadRequestException);

      // Unchanged email is a harmless no-op.
      await expect(
        employees.update(created.id, { email, fullName: 'Same Email' }),
      ).resolves.toMatchObject({ email, fullName: 'Same Email' });
    } finally {
      await prisma.employee.deleteMany({ where: { email } });
    }
  });

  it('returns NotFoundException for unknown id and email', async () => {
    await expect(employees.getById('00000000-0000-4000-8000-000000000000')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(employees.getByEmail('ghost@dexa.test')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
