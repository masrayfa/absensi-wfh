import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { useSession, type UserRole } from '@/lib/session';

export function homePathFor(role: UserRole): string {
  return role === 'HRD' ? '/hrd/karyawan' : '/absen';
}

/** Redirects unauthenticated visitors to /login, remembering where they were headed. */
export function RequireAuth() {
  const session = useSession();
  const location = useLocation();

  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}

/** Redirects a signed-in user whose role does not match to their own home. */
export function RequireRole({ role }: { role: UserRole }) {
  const session = useSession();

  if (!session) return <Navigate to="/login" replace />;
  if (session.user.role !== role) return <Navigate to={homePathFor(session.user.role)} replace />;
  return <Outlet />;
}

/** Keeps signed-in users away from /login. */
export function PublicOnly() {
  const session = useSession();

  if (session) return <Navigate to={homePathFor(session.user.role)} replace />;
  return <Outlet />;
}

/** `/` and unknown paths resolve to the role home, or /login when signed out. */
export function RoleHome() {
  const session = useSession();

  if (!session) return <Navigate to="/login" replace />;
  return <Navigate to={homePathFor(session.user.role)} replace />;
}
