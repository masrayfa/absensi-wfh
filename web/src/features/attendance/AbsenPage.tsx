import { CircleCheckIcon, LogInIcon, LogOutIcon } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';

import { PhotoUpload } from '@/components/app/PhotoUpload';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useCheckIn,
  useCheckOut,
  useMyAttendance,
  type AttendanceRecord,
} from '@/features/attendance/queries';
import { apiErrorMessage } from '@/lib/api';

/** The server stamps the WIB business date; the client filters by the same clock. */
const wibDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' });
const wibTime = new Intl.DateTimeFormat('id-ID', {
  timeZone: 'Asia/Jakarta',
  hour: '2-digit',
  minute: '2-digit',
});
const wibLongDate = new Intl.DateTimeFormat('id-ID', {
  timeZone: 'Asia/Jakarta',
  dateStyle: 'full',
});

function todayWib(): string {
  return wibDate.format(new Date());
}

/** Server timestamps render in WIB so everyone reads the same clock. */
function wibTimeOf(iso: string): string {
  return `${wibTime.format(new Date(iso))} WIB`;
}

function findToday(records: AttendanceRecord[] | undefined): AttendanceRecord | undefined {
  const today = todayWib();
  return records?.find((record) => record.date.slice(0, 10) === today);
}

export function AbsenPage() {
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  // ponytail: snapshot at mount; the header date is decorative, records carry the real timestamps.
  const [now] = useState(() => new Date());

  const attendance = useMyAttendance();
  const checkIn = useCheckIn();
  const checkOut = useCheckOut();
  const today = findToday(attendance.data);

  function selectPhoto(file: File | null) {
    setPhoto(file);
    if (file) setPhotoError(null);
  }

  function submitCheckIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // The submit button is already disabled without a photo; this guards the form path too.
    if (!photo) {
      setPhotoError('Foto wajib diunggah untuk absen masuk.');
      return;
    }
    checkIn.mutate(photo, {
      onSuccess: () => {
        toast.success('Absen masuk tersimpan');
        setPhoto(null);
        setPhotoError(null);
      },
      onError: (error) => toast.error(apiErrorMessage(error, 'Gagal absen masuk')),
    });
  }

  function submitCheckOut() {
    checkOut.mutate(undefined, {
      onSuccess: () => toast.success('Absen keluar tersimpan'),
      onError: (error) => toast.error(apiErrorMessage(error, 'Gagal absen keluar')),
    });
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="grid gap-1">
            <CardTitle className="font-heading text-lg">Absen WFH</CardTitle>
            <CardDescription>{wibLongDate.format(now)} — waktu server (WIB)</CardDescription>
          </div>
          {attendance.data && (
            <Badge variant={today ? 'secondary' : 'outline'}>
              {today ? 'Sudah absen' : 'Belum absen'}
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="grid gap-5">
        {attendance.isLoading ? (
          <div className="grid gap-3">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : attendance.isError ? (
          <p className="text-sm text-muted-foreground">
            Gagal memuat status absen.{' '}
            <Button variant="link" size="sm" className="px-0" onClick={() => attendance.refetch()}>
              Coba lagi
            </Button>
          </p>
        ) : today ? (
          <div className="grid gap-5">
            <dl className="grid gap-2 text-sm">
              <div className="flex items-center gap-2">
                <dt className="text-muted-foreground">Masuk</dt>
                <dd className="font-medium">{wibTimeOf(today.checkInAt)}</dd>
              </div>
              <div className="flex items-center gap-2">
                <dt className="text-muted-foreground">Keluar</dt>
                <dd className={today.checkOutAt ? 'font-medium' : 'text-muted-foreground'}>
                  {today.checkOutAt ? wibTimeOf(today.checkOutAt) : 'Belum absen keluar'}
                </dd>
              </div>
            </dl>
            {today.checkOutAt ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <CircleCheckIcon className="size-4" /> Absen hari ini sudah lengkap.
              </p>
            ) : (
              <Button
                className="justify-self-start"
                onClick={submitCheckOut}
                disabled={checkOut.isPending}
              >
                <LogOutIcon /> {checkOut.isPending ? 'Memproses...' : 'Absen Keluar'}
              </Button>
            )}
          </div>
        ) : (
          <form
            className="grid gap-4"
            aria-label="Form absen masuk"
            onSubmit={submitCheckIn}
            noValidate
          >
            <PhotoUpload value={photo} onChange={selectPhoto} disabled={checkIn.isPending} />
            {photoError ? (
              <p role="alert" className="text-sm font-medium text-destructive">
                {photoError}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">Foto wajib diunggah untuk absen masuk.</p>
            )}
            <Button
              type="submit"
              className="justify-self-start"
              disabled={!photo || checkIn.isPending}
            >
              <LogInIcon /> {checkIn.isPending ? 'Mengunggah...' : 'Absen Masuk'}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
