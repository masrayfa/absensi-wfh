import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import {
  CreateEmployeeDto,
  ListEmployeesQueryDto,
  TCP_PATTERNS,
  UpdateEmployeeDto,
} from '@app/contracts';
import { firstValueFrom } from 'rxjs';
import { CLIENT_AUTH, CLIENT_EMPLOYEE } from '../common/clients';

/** Employee row as returned by employee-service over TCP. */
export interface Employee {
  id: string;
  employeeNo: string;
  fullName: string;
  email: string;
  department: string;
  position: string;
  phone: string | null;
  joinDate: Date;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Create result: the employee plus the one-time plaintext password from auth. */
export interface CreatedEmployee extends Employee {
  defaultPassword: string;
}

/**
 * Orchestrates employee-service and auth-service over TCP; the gateway owns no
 * database. Employee creation spans both services, so the orchestrator
 * compensates a half-created employee if the login cannot be created.
 */
@Injectable()
export class EmployeeService {
  constructor(
    @Inject(CLIENT_EMPLOYEE) private readonly employees: ClientProxy,
    @Inject(CLIENT_AUTH) private readonly auth: ClientProxy,
  ) {}

  list(query: ListEmployeesQueryDto): Promise<Employee[]> {
    return firstValueFrom(
      this.employees.send<Employee[]>(TCP_PATTERNS.EMPLOYEE_LIST, query),
    );
  }

  getById(id: string): Promise<Employee> {
    return firstValueFrom(
      this.employees.send<Employee>(TCP_PATTERNS.EMPLOYEE_GET_BY_ID, { id }),
    );
  }

  async create(dto: CreateEmployeeDto): Promise<CreatedEmployee> {
    const employee = await firstValueFrom(
      this.employees.send<Employee>(TCP_PATTERNS.EMPLOYEE_CREATE, dto),
    );

    try {
      const user = await firstValueFrom(
        this.auth.send<{ defaultPassword: string }>(TCP_PATTERNS.AUTH_CREATE_USER, {
          email: dto.email,
        }),
      );
      return { ...employee, defaultPassword: user.defaultPassword };
    } catch (err) {
      // No orphan login-less employee: roll the created row back to INACTIVE
      // before surfacing the auth error. email is unique, so a retry of the
      // same request would otherwise hit the employee conflict first.
      await this.compensateCreate(employee.id);
      throw err;
    }
  }

  update(id: string, dto: UpdateEmployeeDto): Promise<Employee> {
    return firstValueFrom(
      this.employees.send<Employee>(TCP_PATTERNS.EMPLOYEE_UPDATE, { id, dto }),
    );
  }

  /**
   * Disables the login FIRST, then flips the employee row. If auth fails, the
   * employee row is untouched (nothing lost, safe retry); if the row update
   * fails after auth succeeded, the account is already locked out — the one
   * failure mode that must never happen is an active login left behind.
   * Errors propagate; unlike compensateCreate this is not best-effort.
   */
  async deactivate(id: string): Promise<Employee> {
    const employee = await firstValueFrom(
      this.employees.send<Employee>(TCP_PATTERNS.EMPLOYEE_GET_BY_ID, { id }),
    );
    await firstValueFrom(
      this.auth.send(TCP_PATTERNS.AUTH_DEACTIVATE_USER, { email: employee.email }),
    );
    return firstValueFrom(
      this.employees.send<Employee>(TCP_PATTERNS.EMPLOYEE_DEACTIVATE, { id }),
    );
  }

  /** Best-effort rollback; a failed rollback must not mask the original error. */
  private async compensateCreate(id: string): Promise<void> {
    try {
      await firstValueFrom(
        this.employees.send(TCP_PATTERNS.EMPLOYEE_DEACTIVATE, { id }),
      );
    } catch {
      // Swallow: the original auth error is the one the caller needs.
    }
  }
}
