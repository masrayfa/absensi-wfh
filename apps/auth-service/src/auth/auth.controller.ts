import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { LoginDto, TCP_PATTERNS } from '@app/contracts';
import { AuthService } from './auth.service';

@Controller()
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @MessagePattern(TCP_PATTERNS.AUTH_LOGIN)
  login(@Payload() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @MessagePattern(TCP_PATTERNS.AUTH_VALIDATE)
  validate(@Payload() dto: { token: string }) {
    return this.auth.validate(dto);
  }

  @MessagePattern(TCP_PATTERNS.AUTH_CREATE_USER)
  createUser(@Payload() dto: { email: string }) {
    return this.auth.createUser(dto);
  }

  @MessagePattern(TCP_PATTERNS.AUTH_DEACTIVATE_USER)
  deactivateUser(@Payload() dto: { email: string }) {
    return this.auth.deactivateUser(dto);
  }
}
