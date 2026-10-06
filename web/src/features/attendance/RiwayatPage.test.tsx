import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RiwayatPage } from '@/features/attendance/RiwayatPage';
import type { AttendanceRecord } from '@/features/attendance/queries';
import { API_URL, api } from '@/lib/api';

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...actual,
    api: { get: vi.fn(), post: vi.fn() },
  };
});

const get = vi.mocked(api.get);

/** Closed record: 2026-01-05 08:26–16:30 WIB (01:26–09:30 UTC). */
const CLOSED: AttendanceRecord = {
  id: 'att-budi-1',
  employeeId: 'emp-budi',
  employeeName: 'Budi Santoso',
  userId: 'user-budi',
  date: '2026-01-05T00:00:00.000Z',
  checkInAt: '2026-01-05T01:26:00.000Z',
  checkOutAt: '2026-01-05T09:30:00.000Z',
  photoUrl: '/uploads/photo-1.png',
  note: null,
};

/** Open record: 2026-01-06 09:15 WIB (02:15 UTC), not checked out yet. */
const OPEN: AttendanceRecord = {
  ...CLOSED,
  id: 'att-budi-2',
  date: '2026-01-06T00:00:00.000Z',
  checkInAt: '2026-01-06T02:15:00.000Z',
  checkOutAt: null,
  photoUrl: '/uploads/photo-2.png',
};

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <RiwayatPage />
    </QueryClientProvider>,
  );
}

function changeDate(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

beforeEach(() => {
  get.mockReset();
});

describe('RiwayatPage', () => {
  it('renders one row per record with WIB date/time, status, and the photo thumbnail', async () => {
    get.mockResolvedValue({ data: [OPEN, CLOSED] } as never);
    renderPage();

    expect(await screen.findByText('5 Jan 2026')).toBeInTheDocument();
    expect(screen.getByText('6 Jan 2026')).toBeInTheDocument();
    expect(screen.getByText(/08[.:]26 WIB/)).toBeInTheDocument();
    expect(screen.getByText(/16[.:]30 WIB/)).toBeInTheDocument();
    expect(screen.getByText(/09[.:]15 WIB/)).toBeInTheDocument();

    expect(screen.getByText('Hadir', { selector: '[data-slot="badge"]' })).toBeInTheDocument();
    // "Masuk" is also a column header; target the status badge.
    expect(screen.getByText('Masuk', { selector: '[data-slot="badge"]' })).toBeInTheDocument();

    // header + 2 records
    expect(screen.getAllByRole('row')).toHaveLength(3);
    expect(screen.getByAltText('Foto absen 2026-01-05')).toHaveAttribute(
      'src',
      `${API_URL}/uploads/photo-1.png`,
    );
    expect(screen.getByAltText('Foto absen 2026-01-06')).toHaveAttribute(
      'src',
      `${API_URL}/uploads/photo-2.png`,
    );

    expect(get).toHaveBeenCalledWith('/attendance/me', {
      params: { from: undefined, to: undefined },
    });
  });

  it('refetches with the selected range as from/to query params', async () => {
    get
      .mockResolvedValueOnce({ data: [CLOSED] } as never)
      .mockResolvedValue({ data: [] } as never);
    renderPage();

    await screen.findByText('Hadir');

    changeDate('Dari', '2026-01-05');
    await waitFor(() =>
      expect(get).toHaveBeenLastCalledWith('/attendance/me', {
        params: { from: '2026-01-05', to: undefined },
      }),
    );

    changeDate('Sampai', '2026-01-06');
    await waitFor(() =>
      expect(get).toHaveBeenLastCalledWith('/attendance/me', {
        params: { from: '2026-01-05', to: '2026-01-06' },
      }),
    );
  });

  it('shows the empty state for a range with no records (e.g. a future range)', async () => {
    get.mockResolvedValue({ data: [] } as never);
    renderPage();

    expect(await screen.findByText('Belum ada riwayat absen.')).toBeInTheDocument();

    changeDate('Dari', '2099-01-01');
    changeDate('Sampai', '2099-12-31');

    await waitFor(() =>
      expect(get).toHaveBeenLastCalledWith('/attendance/me', {
        params: { from: '2099-01-01', to: '2099-12-31' },
      }),
    );
    expect(
      await screen.findByText('Tidak ada absen pada rentang tanggal tersebut.'),
    ).toBeInTheDocument();
  });

  it('shows the error state and refetches when Coba lagi is clicked', async () => {
    get.mockRejectedValueOnce(new Error('boom')).mockResolvedValue({ data: [CLOSED] } as never);
    renderPage();

    expect(await screen.findByText('Gagal memuat riwayat absen.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Coba lagi' }));
    expect(await screen.findByText('Hadir')).toBeInTheDocument();
  });
});
