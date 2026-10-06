import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import {
  CreateEmployeeDto,
  ListEmployeesQueryDto,
  TCP_PATTERNS,
  UpdateEmployeeDto,
} from '@app/contracts';
import { EmployeeService } from './employee.service';

@Controller()
export class EmployeeController {
  constructor(private readonly employees: EmployeeService) {}

  @MessagePattern(TCP_PATTERNS.EMPLOYEE_CREATE)
  create(@Payload() dto: CreateEmployeeDto) {
    return this.employees.create(dto);
  }

  @MessagePattern(TCP_PATTERNS.EMPLOYEE_LIST)
  list(@Payload() query: ListEmployeesQueryDto) {
    return this.employees.list(query);
  }

  @MessagePattern(TCP_PATTERNS.EMPLOYEE_GET_BY_ID)
  getById(@Payload() dto: { id: string }) {
    return this.employees.getById(dto.id);
  }

  @MessagePattern(TCP_PATTERNS.EMPLOYEE_GET_BY_EMAIL)
  getByEmail(@Payload() dto: { email: string }) {
    return this.employees.getByEmail(dto.email);
  }

  @MessagePattern(TCP_PATTERNS.EMPLOYEE_UPDATE)
  update(@Payload() dto: { id: string; dto: UpdateEmployeeDto }) {
    return this.employees.update(dto.id, dto.dto);
  }

  @MessagePattern(TCP_PATTERNS.EMPLOYEE_DEACTIVATE)
  deactivate(@Payload() dto: { id: string }) {
    return this.employees.deactivate(dto.id);
  }
}
