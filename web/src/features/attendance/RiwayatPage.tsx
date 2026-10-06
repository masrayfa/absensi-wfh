import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useMyAttendance, type AttendanceRecord } from '@/features/attendance/queries';
import { API_URL } from '@/lib/api';

/** Same WIB clock as AbsenPage so every timestamp reads consistently. */
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

const COLUMN_COUNT = 5;

export function RiwayatPage() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const { data: records, isLoading, isError, refetch } = useMyAttendance({
    from: from || undefined,
    to: to || undefined,
  });

  const filtered = Boolean(from || to);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-heading text-lg">Riwayat Absen</CardTitle>
        <CardDescription>Riwayat absen WFH Anda, terbaru lebih dulu.</CardDescription>
      </CardHeader>

      <CardContent className="grid gap-4">
        <div className="flex flex-wrap items-end gap-2">
          <div className="grid gap-1.5">
            <Label htmlFor="riwayat-from">Dari</Label>
            {/* max/min keep the range bounded; the API also treats both ends as inclusive. */}
            <Input
              id="riwayat-from"
              type="date"
              max={to || undefined}
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="riwayat-to">Sampai</Label>
            <Input
              id="riwayat-to"
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
                setFrom('');
                setTo('');
              }}
            >
              Reset
            </Button>
          )}
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tanggal</TableHead>
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
                  Gagal memuat riwayat absen.{' '}
                  <Button variant="link" size="sm" className="px-0" onClick={() => refetch()}>
                    Coba lagi
                  </Button>
                </TableCell>
              </TableRow>
            ) : records && records.length > 0 ? (
              records.map((record) => (
                <TableRow key={record.id}>
                  <TableCell className="font-medium">{wibDateOf(record.date)}</TableCell>
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
                    <img
                      src={photoSrc(record)}
                      alt={`Foto absen ${record.date.slice(0, 10)}`}
                      className="h-10 w-10 rounded-md border object-cover"
                      loading="lazy"
                    />
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={COLUMN_COUNT} className="py-8 text-center text-muted-foreground">
                  {filtered
                    ? 'Tidak ada absen pada rentang tanggal tersebut.'
                    : 'Belum ada riwayat absen.'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
