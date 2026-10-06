import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import type { JwtPayload } from '@app/common';
import { LoginDto, TCP_PATTERNS } from '@app/contracts';
import { firstValueFrom } from 'rxjs';
import { CLIENT_AUTH } from '../common/clients';

export interface AuthUser {
  id: string;
  email: string;
  role: string;
}

export interface LoginResult {
  accessToken: string;
  user: AuthUser;
}

/** Orchestrates auth-service over TCP; the gateway owns no database. */
@Injectable()
export class AuthService {
  constructor(@Inject(CLIENT_AUTH) private readonly authClient: ClientProxy) {}

  login(dto: LoginDto): Promise<LoginResult> {
    return firstValueFrom(this.authClient.send<LoginResult>(TCP_PATTERNS.AUTH_LOGIN, dto));
  }

  me(user: JwtPayload): AuthUser {
    return { id: user.sub, email: user.email, role: user.role };
  }
}
