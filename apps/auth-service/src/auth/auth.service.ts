import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { LoginDto } from '@app/contracts';
import bcrypt from 'bcryptjs';
import { UserRepository } from '../user/user.repository';

/** Cost factor mandated by the plan for stored password hashes. */
const BCRYPT_COST = 12;

/** Plaintext handed to HRD exactly once by create_user; never persisted. */
const DEFAULT_PASSWORD = 'Welcome123!';

/**
 * Same message for unknown email, inactive user, and wrong password, so the
 * caller cannot enumerate accounts.
 */
const AUTH_FAILED = 'Invalid email or password';

export interface AuthUser {
  id: string;
  email: string;
  role: string;
}

export interface LoginResult {
  accessToken: string;
  user: AuthUser;
}

export interface CreateUserResult {
  id: string;
  email: string;
  defaultPassword: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UserRepository,
    private readonly jwt: JwtService,
  ) {}

  async login({ email, password }: LoginDto): Promise<LoginResult> {
    const user = await this.users.findByEmail(email);
    if (!user || !user.isActive) throw new UnauthorizedException(AUTH_FAILED);

    const matches = await bcrypt.compare(password, user.passwordHash);
    if (!matches) throw new UnauthorizedException(AUTH_FAILED);

    const payload = { sub: user.id, email: user.email, role: user.role };
    return {
      accessToken: await this.jwt.signAsync(payload),
      user: { id: user.id, email: user.email, role: user.role },
    };
  }

  async validate({ token }: { token: string }): Promise<AuthUser> {
    let claims: { email?: string };
    try {
      claims = await this.jwt.verifyAsync<{ email?: string }>(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    const user = claims.email
      ? await this.users.findByEmail(claims.email)
      : null;
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    return { id: user.id, email: user.email, role: user.role };
  }

  async createUser({ email }: { email: string }): Promise<CreateUserResult> {
    const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, BCRYPT_COST);
    try {
      const user = await this.users.create({ email, passwordHash });
      return {
        id: user.id,
        email: user.email,
        defaultPassword: DEFAULT_PASSWORD,
      };
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException(`User ${email} already exists`);
      }
      throw err;
    }
  }

  async deactivateUser({ email }: { email: string }): Promise<{ email: string; isActive: false }> {
    await this.users.deactivateByEmail(email);
    return { email, isActive: false };
  }

  async deleteUser({ email }: { email: string }): Promise<{ email: string; deleted: number }> {
    const { count } = await this.users.deleteByEmail(email);
    return { email, deleted: count };
  }
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === 'P2002'
  );
}
