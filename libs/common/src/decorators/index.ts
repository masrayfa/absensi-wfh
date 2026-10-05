import { createParamDecorator, SetMetadata } from '@nestjs/common';
import type { CustomDecorator } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
export const ROLES_KEY = 'roles';

/** Marks a route as unauthenticated; JwtAuthGuard skips it. */
export const Public = (): CustomDecorator<string> => SetMetadata(IS_PUBLIC_KEY, true);

/** Restricts a route/controller to the given roles; RolesGuard enforces it. */
export const Roles = (...roles: string[]): CustomDecorator<string> => SetMetadata(ROLES_KEY, roles);

/** Claims the services put in the JWT (auth-service signs, gateway verifies). */
export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  iat?: number;
  exp?: number;
}

/** Injects the verified JWT payload, or one field of it: `@CurrentUser('email')`. */
export const CurrentUser = createParamDecorator<
  keyof JwtPayload | undefined,
  JwtPayload | string | number | undefined
>((data, ctx) => {
  const request = ctx.switchToHttp().getRequest<{ user?: JwtPayload }>();
  const user = request.user;
  if (!user) return undefined;
  return data ? user[data] : user;
});
