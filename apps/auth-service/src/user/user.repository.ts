import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * All Prisma access for users lives here. No generated-client type leaks out;
 * callers get inferred row types from the PrismaService delegate.
 */
@Injectable()
export class UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  create(data: { email: string; passwordHash: string }) {
    // role/isActive fall back to the schema defaults (EMPLOYEE / true).
    return this.prisma.user.create({ data });
  }

  /** Idempotent: returns how many rows matched, never throws on a missing email. */
  deactivateByEmail(email: string) {
    return this.prisma.user.updateMany({
      where: { email },
      data: { isActive: false },
    });
  }

  /** Idempotent: returns how many rows matched, never throws on a missing email. */
  deleteByEmail(email: string) {
    return this.prisma.user.deleteMany({ where: { email } });
  }
}
