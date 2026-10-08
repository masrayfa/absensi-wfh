import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { EmployeesPage } from '@/features/employees/EmployeesPage';
import type { Employee } from '@/features/employees/queries';
import { api } from '@/lib/api';

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...actual,
    api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  };
});

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const get = vi.mocked(api.get);
const post = vi.mocked(api.post);
const patch = vi.mocked(api.patch);
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

const RINA: Employee = {
  id: 'emp-rina',
  employeeNo: 'EMP-900',
  fullName: 'Rina Baru',
  email: 'rina.baru@dexa.test',
  department: 'Finance',
  position: 'Analyst',
  phone: null,
  joinDate: '2024-02-01T00:00:00.000Z',
  status: 'ACTIVE',
};

const SITI: Employee = {
  id: 'emp-siti',
  employeeNo: 'EMP-003',
  fullName: 'Siti Aminah',
  email: 'siti@dexa.test',
  department: 'Finance',
  position: 'Staff',
  phone: '0812000003',
  joinDate: '2024-01-20T00:00:00.000Z',
  status: 'INACTIVE',
};

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <EmployeesPage />
    </QueryClientProvider>,
  );
}

async function openCreateDialog() {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: /Tambah Karyawan/ }));
  await screen.findByRole('dialog');
  return user;
}

async function fillCreateForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('NIP'), 'EMP-900');
  await user.type(screen.getByLabelText('Nama Lengkap'), 'Rina Baru');
  await user.type(screen.getByLabelText('Email'), 'rina.baru@dexa.test');
  await user.type(screen.getByLabelText('Departemen'), 'Finance');
  await user.type(screen.getByLabelText('Posisi'), 'Analyst');
}

beforeEach(() => {
  get.mockReset();
  post.mockReset();
  patch.mockReset();
  del.mockReset();
  vi.mocked(toast.success).mockReset();
  vi.mocked(toast.error).mockReset();
});

describe('EmployeesPage', () => {
  it('shows inline zod errors and sends nothing when the create form is submitted empty', async () => {
    get.mockResolvedValue({ data: [] } as never);
    renderPage();

    const user = await openCreateDialog();
    await user.click(screen.getByRole('button', { name: 'Simpan' }));

    expect(await screen.findByText('NIP wajib diisi')).toBeInTheDocument();
    expect(screen.getByText('Nama wajib diisi')).toBeInTheDocument();
    expect(screen.getByText('Masukkan email yang valid')).toBeInTheDocument();
    expect(screen.getByText('Departemen wajib diisi')).toBeInTheDocument();
    expect(screen.getByText('Posisi wajib diisi')).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('creates an employee, shows the one-time password, and refreshes the list', async () => {
    get.mockResolvedValueOnce({ data: [] } as never).mockResolvedValue({ data: [RINA] } as never);
    post.mockResolvedValue({ data: { ...RINA, defaultPassword: 'Welcome123!' } } as never);
    renderPage();

    const user = await openCreateDialog();
    await fillCreateForm(user);
    await user.click(screen.getByRole('button', { name: 'Simpan' }));

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post).toHaveBeenCalledWith(
      '/employees',
      expect.objectContaining({
        employeeNo: 'EMP-900',
        fullName: 'Rina Baru',
        email: 'rina.baru@dexa.test',
        department: 'Finance',
        position: 'Analyst',
      }),
    );

    // Invalidation refetches the list, which now contains the created row.
    expect(await screen.findByText('Rina Baru')).toBeInTheDocument();
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    expect(toast.success).toHaveBeenCalledWith(
      'Karyawan ditambahkan',
      expect.objectContaining({ description: expect.stringContaining('Welcome123!') }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('updates an employee through the edit dialog and refreshes the list', async () => {
    const updated: Employee = { ...BUDI, department: 'Product', position: 'Staff' };
    get.mockResolvedValueOnce({ data: [BUDI] } as never).mockResolvedValue({ data: [updated] } as never);
    patch.mockResolvedValue({ data: updated } as never);
    renderPage();

    const user = userEvent.setup();
    await screen.findByText('Budi Santoso');
    await user.click(screen.getByRole('button', { name: 'Edit Budi Santoso' }));

    // Edit mode: employeeNo is hidden (immutable), email is prefilled but disabled.
    await screen.findByRole('dialog');
    expect(screen.getByText('Ubah Karyawan')).toBeInTheDocument();
    expect(screen.queryByLabelText('NIP')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveValue('budi@dexa.test');
    expect(screen.getByLabelText('Email')).toBeDisabled();

    await user.clear(screen.getByLabelText('Departemen'));
    await user.type(screen.getByLabelText('Departemen'), 'Product');
    await user.clear(screen.getByLabelText('Posisi'));
    await user.type(screen.getByLabelText('Posisi'), 'Staff');
    await user.click(screen.getByRole('button', { name: 'Simpan' }));

    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith(
        '/employees/emp-budi',
        expect.objectContaining({
          fullName: 'Budi Santoso',
          email: 'budi@dexa.test',
          department: 'Product',
          position: 'Staff',
          joinDate: '2024-01-15',
        }),
      ),
    );
    expect(patch.mock.calls[0][1]).not.toHaveProperty('employeeNo');

    // Invalidation refetches the list, which now carries the updated fields.
    expect(await screen.findByText('Product')).toBeInTheDocument();
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    expect(toast.success).toHaveBeenCalledWith('Karyawan diperbarui');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('keeps the dialog open and surfaces a conflict toast on a duplicate NIP', async () => {
    get.mockResolvedValue({ data: [] } as never);
    post.mockRejectedValue({
      isAxiosError: true,
      response: { status: 409, data: { message: 'employeeNo EMP-900 already exists' } },
    });
    renderPage();

    const user = await openCreateDialog();
    await fillCreateForm(user);
    await user.click(screen.getByRole('button', { name: 'Simpan' }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('employeeNo EMP-900 already exists'),
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText('NIP')).toHaveValue('EMP-900');
  });

  it('deactivates an employee from the row action and refreshes the list', async () => {
    get.mockResolvedValueOnce({ data: [BUDI] } as never).mockResolvedValue({ data: [] } as never);
    patch.mockResolvedValue({ data: { ...BUDI, status: 'INACTIVE' } } as never);
    renderPage();

    const user = userEvent.setup();
    await screen.findByText('Budi Santoso');
    await user.click(screen.getByRole('button', { name: 'Nonaktifkan Budi Santoso' }));
    await user.click(await screen.findByRole('button', { name: 'Ya, nonaktifkan' }));

    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith('/employees/emp-budi/deactivate', {}),
    );
    await waitFor(() => expect(screen.queryByText('Budi Santoso')).not.toBeInTheDocument());
    expect(toast.success).toHaveBeenCalledWith('Budi Santoso dinonaktifkan');
  });

  it('hard-deletes an INACTIVE employee after confirm and refreshes the list', async () => {
    get.mockResolvedValueOnce({ data: [SITI] } as never).mockResolvedValue({ data: [] } as never);
    del.mockResolvedValue({ data: SITI } as never);
    renderPage();

    const user = userEvent.setup();
    await screen.findByText('Siti Aminah');
    await user.click(screen.getByRole('button', { name: 'Hapus Siti Aminah' }));

    expect(await screen.findByText('Hapus karyawan permanen?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ya, hapus' }));

    await waitFor(() => expect(del).toHaveBeenCalledWith('/employees/emp-siti'));
    expect(toast.success).toHaveBeenCalledWith('Siti Aminah dihapus');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    expect(screen.queryByText('Siti Aminah')).not.toBeInTheDocument();
  });

  it('never offers hard delete for an ACTIVE employee', async () => {
    get.mockResolvedValue({ data: [BUDI] } as never);
    renderPage();

    await screen.findByText('Budi Santoso');
    expect(screen.queryByRole('button', { name: 'Hapus Budi Santoso' })).not.toBeInTheDocument();
    expect(del).not.toHaveBeenCalled();
  });
});
