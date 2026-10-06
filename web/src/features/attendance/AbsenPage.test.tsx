import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AbsenPage } from '@/features/attendance/AbsenPage';
import type { AttendanceRecord } from '@/features/attendance/queries';
import { api } from '@/lib/api';

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...actual,
    api: { get: vi.fn(), post: vi.fn() },
  };
});

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const get = vi.mocked(api.get);
const post = vi.mocked(api.post);

/** The record's date must match the page's WIB "today", whatever day the suite runs. */
const TODAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());

const RECORD: AttendanceRecord = {
  id: 'att-budi-today',
  employeeId: 'emp-budi',
  employeeName: 'Budi Santoso',
  userId: 'user-budi',
  date: `${TODAY}T00:00:00.000Z`,
  checkInAt: `${TODAY}T08:26:15.828Z`,
  checkOutAt: null,
  photoUrl: '/uploads/photo.png',
  note: null,
};

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AbsenPage />
    </QueryClientProvider>,
  );
}

function photoFile() {
  return new File(['photo-bytes'], 'absen.png', { type: 'image/png' });
}

beforeEach(() => {
  get.mockReset();
  post.mockReset();
  vi.mocked(toast.success).mockReset();
  vi.mocked(toast.error).mockReset();
});

describe('AbsenPage', () => {
  it('blocks check-in without a photo and sends nothing when the form is submitted empty', async () => {
    get.mockResolvedValue({ data: [] } as never);
    renderPage();

    expect(await screen.findByText('Belum absen')).toBeInTheDocument();
    expect(screen.getByText('Foto wajib diunggah untuk absen masuk.')).toBeInTheDocument();

    const submit = screen.getByRole('button', { name: 'Absen Masuk' });
    expect(submit).toBeDisabled();
    await userEvent.click(submit);
    expect(post).not.toHaveBeenCalled();

    // Guard for the form-level submit path: message shown, still no request.
    fireEvent.submit(screen.getByRole('form', { name: 'Form absen masuk' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Foto wajib diunggah untuk absen masuk.',
    );
    expect(post).not.toHaveBeenCalled();
  });

  it('checks in with a multipart photo, flips the status to "Sudah absen", and shows the server time', async () => {
    get.mockResolvedValueOnce({ data: [] } as never).mockResolvedValue({ data: [RECORD] } as never);
    post.mockResolvedValue({ data: RECORD } as never);
    renderPage();

    await screen.findByText('Belum absen');
    const file = photoFile();
    await userEvent.upload(screen.getByLabelText(/Foto/), file);

    expect(await screen.findByAltText('Pratinjau foto')).toBeInTheDocument();
    const submit = screen.getByRole('button', { name: 'Absen Masuk' });
    expect(submit).toBeEnabled();
    await userEvent.click(submit);

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    const [url, body] = post.mock.calls[0];
    expect(url).toBe('/attendance/check-in');
    expect(body).toBeInstanceOf(FormData);
    expect((body as FormData).get('photo')).toBe(file);

    // Invalidation refetches /attendance/me, which now has today's record.
    expect(await screen.findByText('Sudah absen')).toBeInTheDocument();
    expect(await screen.findByText(/15[.:]26 WIB/)).toBeInTheDocument();
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    expect(toast.success).toHaveBeenCalledWith('Absen masuk tersimpan');
  });

  it('surfaces a toast on network failure and keeps the selected photo', async () => {
    get.mockResolvedValue({ data: [] } as never);
    post.mockRejectedValue({ isAxiosError: true, message: 'Network Error' });
    renderPage();

    await screen.findByText('Belum absen');
    await userEvent.upload(screen.getByLabelText(/Foto/), photoFile());
    await screen.findByAltText('Pratinjau foto');
    await userEvent.click(screen.getByRole('button', { name: 'Absen Masuk' }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Tidak dapat menghubungi server. Coba lagi.'),
    );
    expect(screen.getByAltText('Pratinjau foto')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hapus foto' })).toBeInTheDocument();
    expect(screen.queryByText('Sudah absen')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Absen Masuk' })).toBeEnabled();
  });

  it("checks out today's open record and shows the server check-out time", async () => {
    const closed: AttendanceRecord = { ...RECORD, checkOutAt: `${TODAY}T09:30:00.000Z` };
    get.mockResolvedValueOnce({ data: [RECORD] } as never).mockResolvedValue({
      data: [closed],
    } as never);
    post.mockResolvedValue({ data: closed } as never);
    renderPage();

    await screen.findByText('Sudah absen');
    expect(screen.getByText('Belum absen keluar')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Absen Keluar' }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/attendance/check-out', {}),
    );
    expect(await screen.findByText(/16[.:]30 WIB/)).toBeInTheDocument();
    expect(toast.success).toHaveBeenCalledWith('Absen keluar tersimpan');
  });
});
