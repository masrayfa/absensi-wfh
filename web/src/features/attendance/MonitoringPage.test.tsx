import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MonitoringPage } from '@/features/attendance/MonitoringPage';
import type { AttendanceRecord } from '@/features/attendance/queries';
import type { Employee } from '@/features/employees/queries';
import { API_URL, api } from '@/lib/api';

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...actual,
    api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
  };
});

const get = vi.mocked(api.get);
const post = vi.mocked(api.post);
const patch = vi.mocked(api.patch);
const put = vi.mocked(api.put);
const del = vi.mocked(api.delete);

const BUDI: Employee = {
  id: 'emp-budi',
  employeeNo: 'EMP-002',
  fullName: 'Budi Santoso',
  email: 'budi@dexa.test',
  department: 'Engineering',
  position: 'Engineer',
  phone: '0812000002',
  joinDate: '2024-01-15T00:00:00.000Z',
  status: 'ACTIVE',
};

const SITI: Employee = {
  ...BUDI,
  id: 'emp-siti',
  employeeNo: 'EMP-003',
  fullName: 'Siti Aminah',
  email: 'siti@dexa.test',
};

/** Closed record: 2026-01-05 08:26–16:30 WIB (01:26–09:30 UTC). */
const BUDI_RECORD: AttendanceRecord = {
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
const SITI_RECORD: AttendanceRecord = {
  ...BUDI_RECORD,
  id: 'att-siti-1',
  employeeId: 'emp-siti',
  employeeName: 'Siti Aminah',
  userId: 'user-siti',
  date: '2026-01-06T00:00:00.000Z',
  checkInAt: '2026-01-06T02:15:00.000Z',
  checkOutAt: null,
  photoUrl: '/uploads/photo-2.png',
};

/** Routes by URL: /employees feeds the filter dropdown, /attendance the table. */
function mockApi(records: AttendanceRecord[], { failAttendanceOnce = false } = {}) {
  let attendanceCalls = 0;
  get.mockImplementation(((url: string) => {
    if (url === '/employees') return Promise.resolve({ data: [BUDI, SITI] });
    attendanceCalls += 1;
    if (failAttendanceOnce && attendanceCalls === 1) return Promise.reject(new Error('boom'));
    return Promise.resolve({ data: records });
  }) as never);
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MonitoringPage />
    </QueryClientProvider>,
  );
}

function changeDate(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

beforeEach(() => {
  get.mockReset();
  post.mockReset();
  patch.mockReset();
  put.mockReset();
  del.mockReset();
});

describe('MonitoringPage', () => {
  it('renders HRD rows with WIB data and exposes no edit/delete controls', async () => {
    mockApi([BUDI_RECORD, SITI_RECORD]);
    renderPage();

    expect(await screen.findByText('Budi Santoso')).toBeInTheDocument();
    expect(screen.getByText('Siti Aminah')).toBeInTheDocument();
    expect(screen.getByText('5 Jan 2026')).toBeInTheDocument();
    expect(screen.getByText('6 Jan 2026')).toBeInTheDocument();
    expect(screen.getByText(/08[.:]26 WIB/)).toBeInTheDocument();
    expect(screen.getByText(/16[.:]30 WIB/)).toBeInTheDocument();
    expect(screen.getByText(/09[.:]15 WIB/)).toBeInTheDocument();

    expect(screen.getByText('Hadir', { selector: '[data-slot="badge"]' })).toBeInTheDocument();
    // "Masuk" is also a column header; target the status badge.
    expect(screen.getByText('Masuk', { selector: '[data-slot="badge"]' })).toBeInTheDocument();

    // header + 2 records
    expect(screen.getAllByRole('row')).toHaveLength(3);

    // Thumbnail points at the gateway-relative photo path.
    expect(screen.getByRole('img', { name: 'Foto absen Budi Santoso' })).toHaveAttribute(
      'src',
      `${API_URL}/uploads/photo-1.png`,
    );

    // View-only guarantee: no mutation control, and no mutation request was ever made.
    expect(screen.queryByRole('button', { name: /edit|hapus|delete|ubah|nonaktif/i })).toBeNull();
    expect(post).not.toHaveBeenCalled();
    expect(patch).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();

    expect(get).toHaveBeenCalledWith('/attendance', {
      params: { employeeId: undefined, from: undefined, to: undefined },
    });
  });

  it('refetches with the selected employee id', async () => {
    mockApi([BUDI_RECORD]);
    renderPage();
    await screen.findByText('Budi Santoso');

    const user = userEvent.setup();
    await user.click(screen.getByRole('combobox', { name: 'Filter karyawan' }));
    await user.click(await screen.findByRole('option', { name: 'Budi Santoso' }));

    await waitFor(() =>
      expect(get).toHaveBeenLastCalledWith('/attendance', {
        params: { employeeId: 'emp-budi', from: undefined, to: undefined },
      }),
    );
  });

  it('refetches with the selected date range as from/to params', async () => {
    mockApi([BUDI_RECORD]);
    renderPage();
    await screen.findByText('Budi Santoso');

    changeDate('Dari', '2026-01-05');
    await waitFor(() =>
      expect(get).toHaveBeenLastCalledWith('/attendance', {
        params: { employeeId: undefined, from: '2026-01-05', to: undefined },
      }),
    );

    changeDate('Sampai', '2026-01-06');
    await waitFor(() =>
      expect(get).toHaveBeenLastCalledWith('/attendance', {
        params: { employeeId: undefined, from: '2026-01-05', to: '2026-01-06' },
      }),
    );
  });

  it('opens the photo preview dialog from a thumbnail', async () => {
    mockApi([BUDI_RECORD]);
    renderPage();

    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Lihat foto Budi Santoso' }));

    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByRole('heading', { name: 'Foto absen — Budi Santoso' }),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole('img', { name: 'Foto absen Budi Santoso' })).toHaveAttribute(
      'src',
      `${API_URL}/uploads/photo-1.png`,
    );
    // The preview itself stays read-only too.
    expect(within(dialog).queryByRole('button', { name: /edit|hapus|delete/i })).toBeNull();
  });

  it('shows the empty state when no record matches', async () => {
    mockApi([]);
    renderPage();

    expect(await screen.findByText('Belum ada absen yang masuk.')).toBeInTheDocument();
  });

  it('shows the error state and refetches when Coba lagi is clicked', async () => {
    mockApi([BUDI_RECORD], { failAttendanceOnce: true });
    renderPage();

    expect(await screen.findByText('Gagal memuat data absen.')).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Coba lagi' }));

    expect(await screen.findByText('Budi Santoso')).toBeInTheDocument();
  });
});
