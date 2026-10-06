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

const myAttendanceKey = ['attendance', 'me'] as const;

/** The caller's own records, newest first (GET /attendance/me). */
export function useMyAttendance() {
  return useQuery({
    queryKey: myAttendanceKey,
    queryFn: async () => (await api.get<AttendanceRecord[]>('/attendance/me')).data,
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
