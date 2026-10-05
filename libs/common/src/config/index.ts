export interface AppConfig {
  readonly jwtSecret: string;
  readonly gatewayPort: number;
  readonly authTcpPort: number;
  readonly employeeTcpPort: number;
  readonly attendanceTcpPort: number;
  readonly webOrigin: string;
  readonly uploadDir: string;
}

const DEFAULT_JWT_SECRET = 'dev-insecure-secret-change-me';

function port(raw: string | undefined, fallback: number): number {
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 && value < 65536 ? value : fallback;
}

/** Reads env vars with sane local-dev defaults. Pure — pass an env object in tests. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    jwtSecret: env.JWT_SECRET ?? DEFAULT_JWT_SECRET,
    gatewayPort: port(env.GATEWAY_PORT, 3000),
    authTcpPort: port(env.AUTH_TCP_PORT, 4001),
    employeeTcpPort: port(env.EMPLOYEE_TCP_PORT, 4002),
    attendanceTcpPort: port(env.ATTENDANCE_TCP_PORT, 4003),
    webOrigin: env.WEB_ORIGIN ?? 'http://localhost:5173',
    uploadDir: env.UPLOAD_DIR ?? 'uploads',
  };
}
