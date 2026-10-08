import { ClientProxy } from '@nestjs/microservices';
import { EmployeeStatus, TCP_PATTERNS } from '@app/contracts';
import { of, throwError } from 'rxjs';
import { EmployeeService, type Employee } from '../src/employee/employee.service';

interface Sent {
  pattern: string;
  data: unknown;
}

const EMPLOYEE: Employee = {
  id: 'emp-1',
  employeeNo: 'EMP-001',
  fullName: 'Budi',
  email: 'budi@dexa.test',
  department: 'Ops',
  position: 'Staff',
  phone: null,
  joinDate: new Date('2025-01-01'),
  status: EmployeeStatus.ACTIVE,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
};

const INACTIVE_EMPLOYEE: Employee = { ...EMPLOYEE, status: EmployeeStatus.INACTIVE };

/** Minimal ClientProxy stand-in: records (pattern, data), returns `result` or fails on `failOn`. */
function recordingClient(result: unknown, sent: Sent[], failOn?: string): ClientProxy {
  return {
    send: (pattern: string, data: unknown) => {
      sent.push({ pattern, data });
      return failOn === pattern
        ? throwError(() => new Error('auth-service down'))
        : of(result);
    },
  } as unknown as ClientProxy;
}

describe('EmployeeService.deactivate', () => {
  it('disables the login before deactivating the employee row', async () => {
    const sent: Sent[] = [];
    const service = new EmployeeService(
      recordingClient(EMPLOYEE, sent),
      recordingClient({ email: EMPLOYEE.email, isActive: false }, sent),
    );

    await service.deactivate(EMPLOYEE.id);

    // Order matters: an active login must never survive the call.
    expect(sent.map((call) => call.pattern)).toEqual([
      TCP_PATTERNS.EMPLOYEE_GET_BY_ID,
      TCP_PATTERNS.AUTH_DEACTIVATE_USER,
      TCP_PATTERNS.EMPLOYEE_DEACTIVATE,
    ]);
    expect(sent[1]!.data).toEqual({ email: EMPLOYEE.email });
  });

  it('propagates an auth failure without touching the employee row', async () => {
    const sent: Sent[] = [];
    const service = new EmployeeService(
      recordingClient(EMPLOYEE, sent),
      recordingClient(null, sent, TCP_PATTERNS.AUTH_DEACTIVATE_USER),
    );

    await expect(service.deactivate(EMPLOYEE.id)).rejects.toThrow('auth-service down');

    expect(sent.map((call) => call.pattern)).not.toContain(
      TCP_PATTERNS.EMPLOYEE_DEACTIVATE,
    );
  });
});

describe('EmployeeService.remove', () => {
  it('deletes the login before hard-deleting an INACTIVE employee row', async () => {
    const sent: Sent[] = [];
    const service = new EmployeeService(
      recordingClient(INACTIVE_EMPLOYEE, sent),
      recordingClient({ email: INACTIVE_EMPLOYEE.email, deleted: 1 }, sent),
    );

    const removed = await service.remove(INACTIVE_EMPLOYEE.id);

    expect(removed).toEqual(INACTIVE_EMPLOYEE);
    // Order matters: an active login must never survive the call.
    expect(sent.map((call) => call.pattern)).toEqual([
      TCP_PATTERNS.EMPLOYEE_GET_BY_ID,
      TCP_PATTERNS.AUTH_DELETE_USER,
      TCP_PATTERNS.EMPLOYEE_HARD_DELETE,
    ]);
    expect(sent[1]!.data).toEqual({ email: INACTIVE_EMPLOYEE.email });
  });

  it('rejects an ACTIVE employee without deleting anything', async () => {
    const sent: Sent[] = [];
    const service = new EmployeeService(
      recordingClient(EMPLOYEE, sent),
      recordingClient(null, sent),
    );

    await expect(service.remove(EMPLOYEE.id)).rejects.toThrow(
      'Deactivate the employee before deleting',
    );

    const patterns = sent.map((call) => call.pattern);
    expect(patterns).not.toContain(TCP_PATTERNS.AUTH_DELETE_USER);
    expect(patterns).not.toContain(TCP_PATTERNS.EMPLOYEE_HARD_DELETE);
  });

  it('propagates an auth failure without hard-deleting the employee row', async () => {
    const sent: Sent[] = [];
    const service = new EmployeeService(
      recordingClient(INACTIVE_EMPLOYEE, sent),
      recordingClient(null, sent, TCP_PATTERNS.AUTH_DELETE_USER),
    );

    await expect(service.remove(INACTIVE_EMPLOYEE.id)).rejects.toThrow(
      'auth-service down',
    );

    expect(sent.map((call) => call.pattern)).not.toContain(
      TCP_PATTERNS.EMPLOYEE_HARD_DELETE,
    );
  });
});
