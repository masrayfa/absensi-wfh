import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '@/App';
import { api } from '@/lib/api';
import { clearSession, getSession } from '@/lib/session';

vi.mock('@/lib/api', () => ({ api: { post: vi.fn() } }));

const post = vi.mocked(api.post);

const HRD_SESSION = {
  accessToken: 'token-hrd',
  user: { id: '1', email: 'hrd@dexa.test', role: 'HRD' },
};

const EMPLOYEE_SESSION = {
  accessToken: 'token-employee',
  user: { id: '2', email: 'budi@dexa.test', role: 'EMPLOYEE' },
};

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

async function submitLogin(email: string, password: string) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Email'), email);
  await user.type(screen.getByLabelText('Password'), password);
  await user.click(screen.getByRole('button', { name: 'Masuk' }));
}

beforeEach(() => {
  clearSession();
  post.mockReset();
});

describe('LoginPage', () => {
  it('stores the session and redirects HRD to /hrd/karyawan', async () => {
    post.mockResolvedValueOnce({ data: HRD_SESSION } as never);

    renderAt('/login');
    await submitLogin('hrd@dexa.test', 'Password123!');

    expect(await screen.findByText('Master Karyawan')).toBeInTheDocument();
    expect(getSession()).toEqual(HRD_SESSION);
    expect(JSON.parse(localStorage.getItem('absensi.session') ?? '{}')).toMatchObject({
      accessToken: 'token-hrd',
    });
  });

  it('stores the session and redirects EMPLOYEE to /absen', async () => {
    post.mockResolvedValueOnce({ data: EMPLOYEE_SESSION } as never);

    renderAt('/login');
    await submitLogin('budi@dexa.test', 'Password123!');

    expect(await screen.findByText('Absen WFH')).toBeInTheDocument();
    expect(getSession()).toEqual(EMPLOYEE_SESSION);
  });

  it('shows the inline error and stores nothing on invalid credentials', async () => {
    post.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 401, data: { message: 'Invalid email or password' } },
    });

    renderAt('/login');
    await submitLogin('hrd@dexa.test', 'wrong-password');

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password');
    expect(getSession()).toBeNull();
    expect(localStorage.getItem('absensi.session')).toBeNull();
    expect(screen.queryByText('Master Karyawan')).not.toBeInTheDocument();
  });

  it('redirects an already signed-in user away from /login', async () => {
    post.mockResolvedValueOnce({ data: EMPLOYEE_SESSION } as never);
    renderAt('/login');
    await submitLogin('budi@dexa.test', 'Password123!');
    expect(await screen.findByText('Absen WFH')).toBeInTheDocument();
  });
});
