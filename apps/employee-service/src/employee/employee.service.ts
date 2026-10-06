import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CreateEmployeeDto,
  UpdateEmployeeDto,
  ListEmployeesQueryDto,
} from '@app/contracts';
import {
  EmployeeRepository,
  EmployeeUpdateData,
} from './employee.repository';

@Injectable()
export class EmployeeService {
  constructor(private readonly employees: EmployeeRepository) {}

  async create(dto: CreateEmployeeDto) {
    await this.assertUnique(dto.employeeNo, dto.email);
    try {
      return await this.employees.create({
        ...dto,
        joinDate: new Date(dto.joinDate),
      });
    } catch (err) {
      // Backstop for a race between the pre-check and the insert.
      if (isUniqueViolation(err)) {
        throw new ConflictException(
          `Employee ${dto.employeeNo}/${dto.email} already exists`,
        );
      }
      throw err;
    }
  }

  list(query: ListEmployeesQueryDto) {
    return this.employees.list(query);
  }

  async getById(id: string) {
    const employee = await this.employees.findById(id);
    if (!employee) throw new NotFoundException(`Employee ${id} not found`);
    return employee;
  }

  async getByEmail(email: string) {
    const employee = await this.employees.findByEmail(email);
    if (!employee) throw new NotFoundException(`Employee ${email} not found`);
    return employee;
  }

  async update(id: string, dto: UpdateEmployeeDto) {
    const current = await this.employees.findById(id);
    if (!current) throw new NotFoundException(`Employee ${id} not found`);

    // email is the join key to the auth User — a rename would orphan the login.
    // Immutable: reject a changed value, ignore an identical one.
    if (dto.email !== undefined && dto.email !== current.email) {
      throw new BadRequestException(
        'Employee email is the cross-service identity key and cannot be changed',
      );
    }

    const { joinDate, ...rest } = dto;
    // `email` was validated immutable above; drop it so it is never written.
    delete rest.email;
    const data: EmployeeUpdateData = {
      ...rest,
      ...(joinDate ? { joinDate: new Date(joinDate) } : {}),
    };

    try {
      return await this.employees.update(id, data);
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException(`Employee ${id} conflicts with an existing row`);
      }
      throw err;
    }
  }

  async deactivate(id: string) {
    const current = await this.employees.findById(id);
    if (!current) throw new NotFoundException(`Employee ${id} not found`);
    return this.employees.deactivate(id);
  }

  /** Pre-flight check so the caller gets the offending field, not just P2002. */
  private async assertUnique(employeeNo: string, email: string): Promise<void> {
    const [byNo, byEmail] = await Promise.all([
      this.employees.findByEmployeeNo(employeeNo),
      this.employees.findByEmail(email),
    ]);
    if (byNo) {
      throw new ConflictException(`employeeNo ${employeeNo} already exists`);
    }
    if (byEmail) {
      throw new ConflictException(`email ${email} already exists`);
    }
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
