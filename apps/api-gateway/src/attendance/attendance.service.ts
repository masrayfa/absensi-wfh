import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ListAttendanceQueryDto, TCP_PATTERNS } from '@app/contracts';
import { firstValueFrom } from 'rxjs';
import { CLIENT_ATTENDANCE, CLIENT_EMPLOYEE } from '../common/clients';
import type { Employee } from '../employee/employee.service';

/** Attendance row as returned by attendance-service over TCP. */
export interface AttendanceRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  userId: string;
  date: string;
  checkInAt: string;
  checkOutAt: string | null;
  photoUrl: string;
  note: string | null;
}

/**
 * Orchestrates attendance-service and employee-service over TCP; the gateway
 * owns no database. Employee-scoped routes resolve the caller from the JWT
 * email, so a client can never act on another employee's record.
 */
@Injectable()
export class AttendanceService {
  constructor(
    @Inject(CLIENT_ATTENDANCE) private readonly attendance: ClientProxy,
    @Inject(CLIENT_EMPLOYEE) private readonly employees: ClientProxy,
  ) {}

  async checkIn(
    email: string,
    userId: string,
    photoUrl: string,
  ): Promise<AttendanceRecord> {
    const employee = await this.currentEmployee(email);
    return firstValueFrom(
      this.attendance.send<AttendanceRecord>(TCP_PATTERNS.ATTENDANCE_CHECK_IN, {
        employeeId: employee.id,
        employeeName: employee.fullName,
        userId,
        photoUrl,
      }),
    );
  }

  async checkOut(email: string): Promise<AttendanceRecord> {
    const employee = await this.currentEmployee(email);
    return firstValueFrom(
      this.attendance.send<AttendanceRecord>(TCP_PATTERNS.ATTENDANCE_CHECK_OUT, {
        employeeId: employee.id,
      }),
    );
  }

  async listMine(
    email: string,
    query: ListAttendanceQueryDto,
  ): Promise<AttendanceRecord[]> {
    const employee = await this.currentEmployee(email);
    return this.list({ ...query, employeeId: employee.id });
  }

  list(query: ListAttendanceQueryDto): Promise<AttendanceRecord[]> {
    return firstValueFrom(
      this.attendance.send<AttendanceRecord[]>(TCP_PATTERNS.ATTENDANCE_LIST, query),
    );
  }

  get(id: string): Promise<AttendanceRecord> {
    return firstValueFrom(
      this.attendance.send<AttendanceRecord>(TCP_PATTERNS.ATTENDANCE_GET, { id }),
    );
  }

  /** The JWT email maps to exactly one employee; employee-service 404s if absent. */
  private currentEmployee(email: string): Promise<Employee> {
    return firstValueFrom(
      this.employees.send<Employee>(TCP_PATTERNS.EMPLOYEE_GET_BY_EMAIL, { email }),
    );
  }
}
