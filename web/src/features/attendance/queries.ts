import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';

/** Mirrors the gateway attendance row (web does not import @app/contracts values). */
export interface AttendanceRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  userId: string;
  /** WIB business date at UTC midnight, e.g. `2026-10-06T00:00:00.000Z`. */
  date: string;
  checkInAt: string;
  checkOutAt: string | null;
  photoUrl: string;
  note: string | null;
}

/** Inclusive WIB business-date bounds (`YYYY-MM-DD`) for the history filter. */
export interface AttendanceRange {
  from?: string;
  to?: string;
}

/** Query-key prefix: every range variant starts here, so one invalidate covers them all. */
const myAttendanceKey = ['attendance', 'me'] as const;

/** Shared root for every attendance cache entry (own history + HRD list). */
const attendanceKey = ['attendance'] as const;

/** HRD list filters; every field is optional and applied server-side. */
export interface AttendanceFilter extends AttendanceRange {
  employeeId?: string;
}

/** The caller's own records, newest first (GET /attendance/me?from&to). */
export function useMyAttendance({ from, to }: AttendanceRange = {}) {
  return useQuery({
    queryKey: [...myAttendanceKey, { from, to }],
    queryFn: async () =>
      (
        await api.get<AttendanceRecord[]>('/attendance/me', {
          params: { from: from || undefined, to: to || undefined },
        })
      ).data,
  });
}

/** All submitted records, newest first (HRD-only GET /attendance?employeeId&from&to). */
export function useAttendance({ employeeId, from, to }: AttendanceFilter = {}) {
  return useQuery({
    queryKey: [...attendanceKey, 'list', { employeeId, from, to }],
    queryFn: async () =>
      (
        await api.get<AttendanceRecord[]>('/attendance', {
          params: {
            employeeId: employeeId || undefined,
            from: from || undefined,
            to: to || undefined,
          },
        })
      ).data,
  });
}

function useInvalidateMyAttendance() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: myAttendanceKey });
}

/** Multipart check-in with a required photo; re-check-in returns the same record. */
export function useCheckIn() {
  const invalidate = useInvalidateMyAttendance();
  return useMutation({
    mutationFn: async (photo: File) => {
      const form = new FormData();
      form.append('photo', photo);
      // Axios sets the multipart boundary itself; never set Content-Type here.
      return (await api.post<AttendanceRecord>('/attendance/check-in', form)).data;
    },
    onSuccess: invalidate,
  });
}

export function useCheckOut() {
  const invalidate = useInvalidateMyAttendance();
  return useMutation({
    mutationFn: async () => (await api.post<AttendanceRecord>('/attendance/check-out', {})).data,
    onSuccess: invalidate,
  });
}
