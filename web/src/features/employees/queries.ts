import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';

/** Mirrors the gateway Employee row (web does not import @app/contracts values). */
export interface Employee {
  id: string;
  employeeNo: string;
  fullName: string;
  email: string;
  department: string;
  position: string;
  phone: string | null;
  joinDate: string;
  status: 'ACTIVE' | 'INACTIVE';
}

export type EmployeeStatus = Employee['status'];

export interface CreatedEmployee extends Employee {
  /** Returned once by POST /employees; shown to HRD so the new hire can log in. */
  defaultPassword: string;
}

export interface EmployeeInput {
  employeeNo: string;
  fullName: string;
  email: string;
  department: string;
  position: string;
  phone?: string;
  joinDate: string;
}

/** UpdateEmployeeDto shape; employeeNo is absent because it is immutable. */
export type EmployeeUpdateInput = Omit<EmployeeInput, 'employeeNo'>;

const employeesKey = ['employees'] as const;

export function useEmployees(search: string, status: EmployeeStatus) {
  return useQuery({
    queryKey: [...employeesKey, { search, status }],
    queryFn: async () =>
      (
        await api.get<Employee[]>('/employees', {
          params: { search: search || undefined, status },
        })
      ).data,
  });
}

function useInvalidateEmployees() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: employeesKey });
}

export function useCreateEmployee() {
  const invalidate = useInvalidateEmployees();
  return useMutation({
    mutationFn: async (input: EmployeeInput) =>
      (await api.post<CreatedEmployee>('/employees', input)).data,
    onSuccess: invalidate,
  });
}

export function useUpdateEmployee(id: string) {
  const invalidate = useInvalidateEmployees();
  return useMutation({
    mutationFn: async (input: EmployeeUpdateInput) =>
      (await api.patch<Employee>(`/employees/${id}`, input)).data,
    onSuccess: invalidate,
  });
}

export function useDeactivateEmployee() {
  const invalidate = useInvalidateEmployees();
  return useMutation({
    mutationFn: async (id: string) =>
      (await api.patch<Employee>(`/employees/${id}/deactivate`, {})).data,
    onSuccess: invalidate,
  });
}
