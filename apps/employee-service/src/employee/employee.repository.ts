import { Injectable } from '@nestjs/common';
import {
  EmployeeStatus,
  ListEmployeesQueryDto,
} from '@app/contracts';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Fields accepted on create. `joinDate` is already a Date (converted by service).
 * `status` is absent by design: the schema default (ACTIVE) is the only state a
 * new employee can be born in; deactivation is a dedicated repository method.
 */
export interface EmployeeCreateData {
  employeeNo: string;
  fullName: string;
  email: string;
  department: string;
  position: string;
  phone?: string;
  joinDate: Date;
}

/** Mutable fields on update. `employeeNo`, `email`, and `status` are not update-able. */
export interface EmployeeUpdateData {
  fullName?: string;
  department?: string;
  position?: string;
  phone?: string;
  joinDate?: Date;
}

/**
 * All Prisma access for employees lives here. No generated-client type leaks
 * out; callers get inferred row types from the PrismaService delegate.
 */
@Injectable()
export class EmployeeRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string) {
    return this.prisma.employee.findUnique({ where: { id } });
  }

  findByEmail(email: string) {
    return this.prisma.employee.findUnique({ where: { email } });
  }

  findByEmployeeNo(employeeNo: string) {
    return this.prisma.employee.findUnique({ where: { employeeNo } });
  }

  create(data: EmployeeCreateData) {
    return this.prisma.employee.create({ data });
  }

  /**
   * Defaults to the ACTIVE list so soft-deactivated employees are excluded
   * unless the caller explicitly asks for `status: 'INACTIVE'`.
   */
  list({ search, status }: ListEmployeesQueryDto) {
    return this.prisma.employee.findMany({
      where: {
        status: status ?? EmployeeStatus.ACTIVE,
        ...(search
          ? {
              OR: [
                { employeeNo: { contains: search } },
                { fullName: { contains: search } },
                { email: { contains: search } },
              ],
            }
          : {}),
      },
      orderBy: { employeeNo: 'asc' },
    });
  }

  update(id: string, data: EmployeeUpdateData) {
    return this.prisma.employee.update({ where: { id }, data });
  }

  /** Soft delete: flips status to INACTIVE, never removes the row. */
  deactivate(id: string) {
    return this.prisma.employee.update({
      where: { id },
      data: { status: EmployeeStatus.INACTIVE },
    });
  }
}
