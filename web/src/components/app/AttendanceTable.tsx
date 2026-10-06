import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { AttendanceRecord } from '@/features/attendance/queries';
import { API_URL } from '@/lib/api';

/** Same WIB clock as AbsenPage/RiwayatPage so every timestamp reads consistently. */
const wibDate = new Intl.DateTimeFormat('id-ID', {
  timeZone: 'Asia/Jakarta',
  dateStyle: 'medium',
});
const wibTime = new Intl.DateTimeFormat('id-ID', {
  timeZone: 'Asia/Jakarta',
  hour: '2-digit',
  minute: '2-digit',
});

function wibTimeOf(iso: string): string {
  return `${wibTime.format(new Date(iso))} WIB`;
}

/** `date` is the WIB business date at UTC midnight, e.g. `2026-01-05T00:00:00.000Z`. */
function wibDateOf(iso: string): string {
  return wibDate.format(new Date(iso));
}

/** `photoUrl` is a gateway-relative path (`/uploads/<file>`). */
function photoSrc(record: AttendanceRecord): string {
  return `${API_URL}${record.photoUrl}`;
}

const COLUMN_COUNT = 6;

export interface AttendanceTableProps {
  records: AttendanceRecord[] | undefined;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  onPhotoClick: (record: AttendanceRecord) => void;
  emptyMessage?: string;
}

/**
 * Read-only attendance table. It exposes no row actions by design: HRD may view
 * submitted absen but the brief forbids any edit/delete path.
 */
export function AttendanceTable({
  records,
  isLoading,
  isError,
  onRetry,
  onPhotoClick,
  emptyMessage = 'Belum ada data absen.',
}: AttendanceTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Tanggal</TableHead>
          <TableHead>Karyawan</TableHead>
          <TableHead>Masuk</TableHead>
          <TableHead>Keluar</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Foto</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {isLoading ? (
          Array.from({ length: 3 }, (_, row) => (
            <TableRow key={row}>
              {Array.from({ length: COLUMN_COUNT }, (_, cell) => (
                <TableCell key={cell}>
                  <Skeleton className="h-4 w-16" />
                </TableCell>
              ))}
            </TableRow>
          ))
        ) : isError ? (
          <TableRow>
            <TableCell colSpan={COLUMN_COUNT} className="py-8 text-center text-muted-foreground">
              Gagal memuat data absen.{' '}
              <Button variant="link" size="sm" className="px-0" onClick={onRetry}>
                Coba lagi
              </Button>
            </TableCell>
          </TableRow>
        ) : records && records.length > 0 ? (
          records.map((record) => (
            <TableRow key={record.id}>
              <TableCell className="font-medium">{wibDateOf(record.date)}</TableCell>
              <TableCell>{record.employeeName}</TableCell>
              <TableCell>{wibTimeOf(record.checkInAt)}</TableCell>
              <TableCell className={record.checkOutAt ? '' : 'text-muted-foreground'}>
                {record.checkOutAt ? wibTimeOf(record.checkOutAt) : '—'}
              </TableCell>
              <TableCell>
                <Badge variant={record.checkOutAt ? 'secondary' : 'outline'}>
                  {record.checkOutAt ? 'Hadir' : 'Masuk'}
                </Badge>
              </TableCell>
              <TableCell>
                <button
                  type="button"
                  className="block rounded-md border transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  aria-label={`Lihat foto ${record.employeeName}`}
                  onClick={() => onPhotoClick(record)}
                >
                  <img
                    src={photoSrc(record)}
                    alt={`Foto absen ${record.employeeName}`}
                    className="h-10 w-10 rounded-md object-cover"
                    loading="lazy"
                  />
                </button>
              </TableCell>
            </TableRow>
          ))
        ) : (
          <TableRow>
            <TableCell colSpan={COLUMN_COUNT} className="py-8 text-center text-muted-foreground">
              {emptyMessage}
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
