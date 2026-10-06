import { useState } from 'react';

import { AttendanceTable } from '@/components/app/AttendanceTable';
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
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAttendance, type AttendanceRecord } from '@/features/attendance/queries';
import { useEmployees } from '@/features/employees/queries';
import { API_URL } from '@/lib/api';

const wibDate = new Intl.DateTimeFormat('id-ID', {
  timeZone: 'Asia/Jakarta',
  dateStyle: 'full',
});

/** HRD monitoring: view-only list with employee/date filters and a photo preview. */
export function MonitoringPage() {
  const [employeeId, setEmployeeId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [preview, setPreview] = useState<AttendanceRecord | null>(null);

  // Only active employees appear in the filter; search is not needed here.
  const employees = useEmployees('', 'ACTIVE');
  const { data: records, isLoading, isError, refetch } = useAttendance({
    employeeId: employeeId || undefined,
    from: from || undefined,
    to: to || undefined,
  });

  const filtered = Boolean(employeeId || from || to);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-heading text-lg">Monitoring Absen</CardTitle>
        <CardDescription>Data absen WFH seluruh karyawan — hanya lihat.</CardDescription>
      </CardHeader>

      <CardContent className="grid gap-4">
        <div className="flex flex-wrap items-end gap-2">
          <div className="grid gap-1.5">
            <Label htmlFor="monitoring-employee">Karyawan</Label>
            <Select
              value={employeeId || 'all'}
              onValueChange={(value) => setEmployeeId(value === 'all' ? '' : value)}
            >
              <SelectTrigger
                id="monitoring-employee"
                aria-label="Filter karyawan"
                className="min-w-44"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua karyawan</SelectItem>
                {employees.data?.map((employee) => (
                  <SelectItem key={employee.id} value={employee.id}>
                    {employee.fullName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="monitoring-from">Dari</Label>
            {/* max/min keep the range bounded; the API treats both ends as inclusive. */}
            <Input
              id="monitoring-from"
              type="date"
              max={to || undefined}
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="monitoring-to">Sampai</Label>
            <Input
              id="monitoring-to"
              type="date"
              min={from || undefined}
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />
          </div>
          {filtered && (
            <Button
              variant="ghost"
              onClick={() => {
                setEmployeeId('');
                setFrom('');
                setTo('');
              }}
            >
              Reset
            </Button>
          )}
        </div>

        <AttendanceTable
          records={records}
          isLoading={isLoading}
          isError={isError}
          onRetry={() => refetch()}
          onPhotoClick={setPreview}
          emptyMessage={
            filtered ? 'Tidak ada absen yang cocok dengan filter.' : 'Belum ada absen yang masuk.'
          }
        />
      </CardContent>

      <Dialog
        open={Boolean(preview)}
        onOpenChange={(open) => {
          if (!open) setPreview(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Foto absen — {preview?.employeeName}</DialogTitle>
            <DialogDescription>
              {preview ? wibDate.format(new Date(preview.date)) : 'Pratinjau foto absen.'}
            </DialogDescription>
          </DialogHeader>
          {preview && (
            <img
              src={`${API_URL}${preview.photoUrl}`}
              alt={`Foto absen ${preview.employeeName}`}
              className="max-h-[60vh] w-full rounded-md border object-contain"
            />
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
