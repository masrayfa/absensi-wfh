import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Public, type JwtPayload } from '@app/common';
import { LoginDto } from '@app/contracts';
import { AuthService, type AuthUser, type LoginResult } from './auth.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Authenticate and receive a JWT' })
  login(@Body() dto: LoginDto): Promise<LoginResult> {
    return this.auth.login(dto);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Return the authenticated user' })
  me(@CurrentUser() user: JwtPayload): AuthUser {
    return this.auth.me(user);
  }
}
