import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  useCreateEmployee,
  useUpdateEmployee,
  type Employee,
} from '@/features/employees/queries';
import { apiErrorMessage } from '@/lib/api';

const employeeSchema = z.object({
  employeeNo: z.string().trim().min(1, 'NIP wajib diisi'),
  fullName: z.string().trim().min(1, 'Nama wajib diisi'),
  email: z.email('Masukkan email yang valid'),
  department: z.string().trim().min(1, 'Departemen wajib diisi'),
  position: z.string().trim().min(1, 'Posisi wajib diisi'),
  phone: z.string(),
  joinDate: z.string().min(1, 'Tanggal masuk wajib diisi'),
});

type EmployeeFormValues = z.infer<typeof employeeSchema>;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function emptyValues(): EmployeeFormValues {
  return {
    employeeNo: '',
    fullName: '',
    email: '',
    department: '',
    position: '',
    phone: '',
    joinDate: todayIso(),
  };
}

function toFormValues(employee: Employee): EmployeeFormValues {
  return {
    employeeNo: employee.employeeNo,
    fullName: employee.fullName,
    email: employee.email,
    department: employee.department,
    position: employee.position,
    phone: employee.phone ?? '',
    joinDate: employee.joinDate.slice(0, 10),
  };
}

interface EmployeeFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present = edit that employee; absent = create a new one. */
  employee?: Employee | null;
}

/**
 * One dialog for create and update: fields shared, `employeeNo` hidden on
 * edit, `email` shown but disabled (it is the cross-service identity key).
 * Stays open on a failed request so the HRD can fix the input.
 */
export function EmployeeFormDialog({ open, onOpenChange, employee }: EmployeeFormDialogProps) {
  const isEdit = Boolean(employee);
  const form = useForm<EmployeeFormValues>({
    resolver: zodResolver(employeeSchema),
    defaultValues: emptyValues(),
  });

  const createEmployee = useCreateEmployee();
  const updateEmployee = useUpdateEmployee(employee?.id ?? '');
  const pending = createEmployee.isPending || updateEmployee.isPending;

  useEffect(() => {
    if (open) form.reset(employee ? toFormValues(employee) : emptyValues());
  }, [open, employee, form]);

  const onSubmit = form.handleSubmit((values) => {
    const payload = {
      fullName: values.fullName.trim(),
      email: values.email.trim(),
      department: values.department.trim(),
      position: values.position.trim(),
      phone: values.phone.trim() || undefined,
      joinDate: values.joinDate,
    };

    if (employee) {
      updateEmployee.mutate(payload, {
        onSuccess: () => {
          toast.success('Karyawan diperbarui');
          onOpenChange(false);
        },
        onError: (error) => toast.error(apiErrorMessage(error, 'Gagal memperbarui karyawan')),
      });
      return;
    }

    createEmployee.mutate(
      { ...payload, employeeNo: values.employeeNo.trim() },
      {
        onSuccess: (created) => {
          toast.success('Karyawan ditambahkan', {
            description: `Password sementara untuk ${created.fullName}: ${created.defaultPassword}`,
            duration: 15000,
          });
          onOpenChange(false);
        },
        onError: (error) => toast.error(apiErrorMessage(error, 'Gagal menambahkan karyawan')),
      },
    );
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Ubah Karyawan' : 'Tambah Karyawan'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Perbarui data karyawan. NIP dan email tidak dapat diubah.'
              : 'Buat akun karyawan baru. Password sementara ditampilkan setelah tersimpan.'}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={onSubmit} className="grid gap-4" noValidate>
            {!isEdit && (
              <FormField
                control={form.control}
                name="employeeNo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>NIP</FormLabel>
                    <FormControl>
                      <Input placeholder="EMP-001" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            <FormField
              control={form.control}
              name="fullName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nama Lengkap</FormLabel>
                  <FormControl>
                    <Input placeholder="Nama karyawan" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input type="email" disabled={isEdit} {...field} />
                  </FormControl>
                  {isEdit ? (
                    <FormDescription>Email adalah kunci login dan tidak dapat diubah.</FormDescription>
                  ) : null}
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="department"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Departemen</FormLabel>
                  <FormControl>
                    <Input placeholder="Contoh: Finance" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="position"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Posisi</FormLabel>
                  <FormControl>
                    <Input placeholder="Contoh: Analyst" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>No. Telepon (opsional)</FormLabel>
                  <FormControl>
                    <Input inputMode="tel" placeholder="08xx" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="joinDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tanggal Masuk</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={pending}
              >
                Batal
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? 'Menyimpan...' : 'Simpan'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
