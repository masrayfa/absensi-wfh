import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import bcrypt from 'bcryptjs';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';

const HRD = { email: 'hrd@dexa.test', password: 'Password123!' };
const AUTH_FAILED = 'Invalid email or password';
const EIGHT_HOURS_SECONDS = 8 * 60 * 60;

interface JwtClaims {
  sub: string;
  email: string;
  role: string;
  iat: number;
  exp: number;
}

describe('auth-service (against real auth_db)', () => {
  let moduleRef: TestingModule;
  let auth: AuthService;
  let prisma: PrismaService;
  let jwt: JwtService;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    await moduleRef.init();
    auth = moduleRef.get(AuthService);
    prisma = moduleRef.get(PrismaService);
    jwt = moduleRef.get(JwtService);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('logs in the seeded HRD and issues an 8h JWT with sub/email/role', async () => {
    const result = await auth.login(HRD);

    expect(result.user).toEqual({
      id: expect.any(String),
      email: HRD.email,
      role: 'HRD',
    });

    const claims = await jwt.verifyAsync<JwtClaims>(result.accessToken);
    expect(claims.sub).toBe(result.user.id);
    expect(claims.email).toBe(HRD.email);
    expect(claims.role).toBe('HRD');
    expect(claims.exp - claims.iat).toBe(EIGHT_HOURS_SECONDS);
  });

  it('validates a real token and rejects a garbage one', async () => {
    const { accessToken } = await auth.login(HRD);

    await expect(auth.validate({ token: accessToken })).resolves.toEqual({
      id: expect.any(String),
      email: HRD.email,
      role: 'HRD',
    });
    await expect(auth.validate({ token: 'not-a-jwt' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('returns the same uniform error for a wrong password and an unknown email', async () => {
    const wrongPassword = await auth
      .login({ email: HRD.email, password: 'wrong' })
      .catch((err: unknown) => err);
    const unknownEmail = await auth
      .login({ email: 'ghost@dexa.test', password: 'wrong' })
      .catch((err: unknown) => err);

    for (const err of [wrongPassword, unknownEmail]) {
      expect(err).toBeInstanceOf(UnauthorizedException);
      expect((err as UnauthorizedException).message).toBe(AUTH_FAILED);
      expect((err as UnauthorizedException).getStatus()).toBe(401);
    }
  });

  it('creates an EMPLOYEE whose hash verifies Welcome123! at cost 12, then deactivates it', async () => {
    const email = `t06-create-${Date.now()}@dexa.test`;
    try {
      const created = await auth.createUser({ email });
      expect(created).toEqual({
        id: expect.any(String),
        email,
        defaultPassword: 'Welcome123!',
      });

      const row = await prisma.user.findUniqueOrThrow({ where: { email } });
      expect(row.role).toBe('EMPLOYEE');
      expect(row.isActive).toBe(true);
      expect(row.passwordHash).toMatch(/^\$2[aby]\$12\$/);
      expect(await bcrypt.compare('Welcome123!', row.passwordHash)).toBe(true);

      await auth.deactivateUser({ email });
      const after = await prisma.user.findUniqueOrThrow({ where: { email } });
      expect(after.isActive).toBe(false);
    } finally {
      await prisma.user.deleteMany({ where: { email } });
    }
  });

  it('rejects login for a deactivated user', async () => {
    const email = `t06-inactive-${Date.now()}@dexa.test`;
    try {
      await auth.createUser({ email });
      await auth.deactivateUser({ email });

      await expect(
        auth.login({ email, password: 'Welcome123!' }),
      ).rejects.toMatchObject({ message: AUTH_FAILED, status: 401 });
    } finally {
      await prisma.user.deleteMany({ where: { email } });
    }
  });
});
