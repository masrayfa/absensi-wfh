import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { IS_PUBLIC_KEY, ROLES_KEY, type JwtPayload } from '../decorators';

interface HttpRequestLike {
  headers: Record<string, string | undefined>;
  user?: JwtPayload;
}

/** Verifies the bearer JWT; honors @Public(). Requires JwtModule with the secret. */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<HttpRequestLike>();
    const token = extractBearerToken(request.headers.authorization);
    if (!token) throw new UnauthorizedException('Missing bearer token');

    try {
      request.user = this.jwtService.verify<JwtPayload>(token);
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}

/** Enforces @Roles(); assumes JwtAuthGuard ran first and set request.user. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const { user } = context.switchToHttp().getRequest<HttpRequestLike>();
    if (!user?.role || !required.includes(user.role)) {
      throw new ForbiddenException('Insufficient role');
    }
    return true;
  }
}

function extractBearerToken(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const [scheme, token] = header.split(' ');
  return scheme.toLowerCase() === 'bearer' && token ? token : undefined;
}
