import { PencilIcon, PlusIcon, SearchIcon, Trash2Icon, UserRoundXIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EmployeeFormDialog } from '@/features/employees/EmployeeFormDialog';
import {
  useDeactivateEmployee,
  useDeleteEmployee,
  useEmployees,
  type Employee,
  type EmployeeStatus,
} from '@/features/employees/queries';
import { apiErrorMessage } from '@/lib/api';

/** ponytail: inline debounce; extract when a second search box needs it. */
function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

export function EmployeesPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<EmployeeStatus>('ACTIVE');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [deactivating, setDeactivating] = useState<Employee | null>(null);
  const [deleting, setDeleting] = useState<Employee | null>(null);

  const debouncedSearch = useDebouncedValue(search.trim());
  const { data: employees, isLoading, isError, refetch } = useEmployees(debouncedSearch, status);
  const deactivate = useDeactivateEmployee();
  const deleteEmployee = useDeleteEmployee();

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(employee: Employee) {
    setEditing(employee);
    setFormOpen(true);
  }

  function confirmDeactivate() {
    if (!deactivating) return;
    deactivate.mutate(deactivating.id, {
      onSuccess: (updated) => {
        toast.success(`${updated.fullName} dinonaktifkan`);
        setDeactivating(null);
      },
      onError: (error) =>
        toast.error(apiErrorMessage(error, 'Gagal menonaktifkan karyawan')),
    });
  }

  function confirmDelete() {
    if (!deleting) return;
    deleteEmployee.mutate(deleting.id, {
      onSuccess: (deleted) => {
        toast.success(`${deleted.fullName} dihapus`);
        setDeleting(null);
      },
      onError: (error) => toast.error(apiErrorMessage(error, 'Gagal menghapus karyawan')),
    });
  }

  const emptyMessage =
    debouncedSearch || status === 'INACTIVE'
      ? 'Tidak ada karyawan yang cocok dengan filter.'
      : 'Belum ada karyawan.';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-heading text-lg">Master Karyawan</CardTitle>
        <CardDescription>Tambah, ubah, dan nonaktifkan data karyawan.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-56 flex-1">
            <SearchIcon className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Cari NIP, nama, atau email"
              aria-label="Cari karyawan"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <Select value={status} onValueChange={(value) => setStatus(value as EmployeeStatus)}>
            <SelectTrigger aria-label="Filter status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ACTIVE">Aktif</SelectItem>
              <SelectItem value="INACTIVE">Nonaktif</SelectItem>
            </SelectContent>
          </Select>
          <Button className="ml-auto" onClick={openCreate}>
            <PlusIcon /> Tambah Karyawan
          </Button>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>NIP</TableHead>
              <TableHead>Nama</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Departemen</TableHead>
              <TableHead>Posisi</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 3 }, (_, row) => (
                <TableRow key={row}>
                  {Array.from({ length: 7 }, (_, cell) => (
                    <TableCell key={cell}>
                      <Skeleton className="h-4 w-16" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : isError ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                  Gagal memuat data karyawan.{' '}
                  <Button variant="link" size="sm" className="px-0" onClick={() => refetch()}>
                    Coba lagi
                  </Button>
                </TableCell>
              </TableRow>
            ) : employees && employees.length > 0 ? (
              employees.map((employee) => (
                <TableRow key={employee.id}>
                  <TableCell className="font-medium">{employee.employeeNo}</TableCell>
                  <TableCell>{employee.fullName}</TableCell>
                  <TableCell className="text-muted-foreground">{employee.email}</TableCell>
                  <TableCell>{employee.department}</TableCell>
                  <TableCell>{employee.position}</TableCell>
                  <TableCell>
                    <Badge variant={employee.status === 'ACTIVE' ? 'secondary' : 'destructive'}>
                      {employee.status === 'ACTIVE' ? 'Aktif' : 'Nonaktif'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Edit ${employee.fullName}`}
                        onClick={() => openEdit(employee)}
                      >
                        <PencilIcon /> Edit
                      </Button>
                      {employee.status === 'ACTIVE' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          aria-label={`Nonaktifkan ${employee.fullName}`}
                          onClick={() => setDeactivating(employee)}
                        >
                          <UserRoundXIcon /> Nonaktifkan
                        </Button>
                      )}
                      {employee.status === 'INACTIVE' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          aria-label={`Hapus ${employee.fullName}`}
                          onClick={() => setDeleting(employee)}
                        >
                          <Trash2Icon /> Hapus
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                  {emptyMessage}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>

      <EmployeeFormDialog open={formOpen} onOpenChange={setFormOpen} employee={editing} />

      <Dialog
        open={Boolean(deactivating)}
        onOpenChange={(open) => {
          if (!open) setDeactivating(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Nonaktifkan karyawan?</DialogTitle>
            <DialogDescription>
              {deactivating?.fullName} tidak akan bisa login dan tidak tampil di daftar aktif.
              Data karyawan tetap tersimpan.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeactivating(null)}
              disabled={deactivate.isPending}
            >
              Batal
            </Button>
            <Button variant="destructive" onClick={confirmDeactivate} disabled={deactivate.isPending}>
              {deactivate.isPending ? 'Memproses...' : 'Ya, nonaktifkan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Hapus karyawan permanen?</DialogTitle>
            <DialogDescription>
              {deleting?.fullName} beserta akun login-nya akan dihapus permanen. Data karyawan
              dan login tidak bisa dikembalikan.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)} disabled={deleteEmployee.isPending}>
              Batal
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleteEmployee.isPending}>
              {deleteEmployee.isPending ? 'Menghapus...' : 'Ya, hapus'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
