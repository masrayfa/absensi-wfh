import { NavLink, Outlet, useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { clearSession, useSession } from '@/lib/session';
import { cn } from '@/lib/utils';

const EMPLOYEE_LINKS = [
  { to: '/absen', label: 'Absen' },
  { to: '/riwayat', label: 'Riwayat' },
];

const HRD_LINKS = [
  { to: '/hrd/karyawan', label: 'Karyawan' },
  { to: '/hrd/monitoring', label: 'Monitoring' },
];

export function AppLayout() {
  const session = useSession();
  const navigate = useNavigate();

  if (!session) return null;

  const links = session.user.role === 'HRD' ? HRD_LINKS : EMPLOYEE_LINKS;

  return (
    <div className="min-h-svh bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-6 px-4">
          <span className="font-heading font-semibold">Absensi WFH</span>
          <nav className="flex items-center gap-1">
            {links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) =>
                  cn(
                    'rounded-md px-3 py-1.5 text-sm transition-colors',
                    isActive
                      ? 'bg-muted font-medium text-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  )
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-sm text-muted-foreground sm:inline">
              {session.user.email}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                clearSession();
                navigate('/login', { replace: true });
              }}
            >
              Keluar
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
