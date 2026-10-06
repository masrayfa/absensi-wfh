import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '@app/common';
import {
  CreateEmployeeDto,
  ListEmployeesQueryDto,
  Role,
  UpdateEmployeeDto,
} from '@app/contracts';
import { EmployeeService } from './employee.service';

/** Master karyawan routes; every one is HRD-only (RolesGuard). */
@ApiTags('employees')
@ApiBearerAuth()
@Roles(Role.HRD)
@Controller('employees')
export class EmployeeController {
  constructor(private readonly employees: EmployeeService) {}

  @Get()
  @ApiOperation({ summary: 'List employees (HRD only)' })
  list(@Query() query: ListEmployeesQueryDto) {
    return this.employees.list(query);
  }

  @Post()
  @ApiOperation({
    summary: 'Create an employee and their login; returns the one-time password',
  })
  create(@Body() dto: CreateEmployeeDto) {
    return this.employees.create(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an employee by id (HRD only)' })
  getById(@Param('id') id: string) {
    return this.employees.getById(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an employee (HRD only)' })
  update(@Param('id') id: string, @Body() dto: UpdateEmployeeDto) {
    return this.employees.update(id, dto);
  }

  @Patch(':id/deactivate')
  @ApiOperation({ summary: 'Deactivate an employee and their login (HRD only)' })
  deactivate(@Param('id') id: string) {
    return this.employees.deactivate(id);
  }
}
