import { Route, Routes } from 'react-router-dom';

import { AppLayout } from '@/components/app/AppLayout';
import { AbsenPage } from '@/features/attendance/AbsenPage';
import { MonitoringPage } from '@/features/attendance/MonitoringPage';
import { RiwayatPage } from '@/features/attendance/RiwayatPage';
import { LoginPage } from '@/features/auth/LoginPage';
import { PublicOnly, RequireAuth, RequireRole, RoleHome } from '@/features/auth/guards';
import { EmployeesPage } from '@/features/employees/EmployeesPage';

export function App() {
  return (
    <Routes>
      <Route element={<PublicOnly />}>
        <Route path="/login" element={<LoginPage />} />
      </Route>

      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route element={<RequireRole role="EMPLOYEE" />}>
            <Route path="/absen" element={<AbsenPage />} />
            <Route path="/riwayat" element={<RiwayatPage />} />
          </Route>
          <Route element={<RequireRole role="HRD" />}>
            <Route path="/hrd/karyawan" element={<EmployeesPage />} />
            <Route path="/hrd/monitoring" element={<MonitoringPage />} />
          </Route>
        </Route>
      </Route>

      <Route path="/" element={<RoleHome />} />
      <Route path="*" element={<RoleHome />} />
    </Routes>
  );
}
