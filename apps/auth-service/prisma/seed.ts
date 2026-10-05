import { PrismaClient, Role } from '../generated/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

/** Seeded password for every demo account (documented in .omo/evidence/t05-prisma.txt). */
const SEED_PASSWORD = 'Password123!';

// Fixed ids so the attendance seed can reference Budi's auth user by id.
const SEED_USERS = [
  { id: '00000000-0000-4000-8000-000000000001', email: 'hrd@dexa.test', role: Role.HRD },
  { id: '00000000-0000-4000-8000-000000000002', email: 'budi@dexa.test', role: Role.EMPLOYEE },
  { id: '00000000-0000-4000-8000-000000000003', email: 'siti@dexa.test', role: Role.EMPLOYEE },
  { id: '00000000-0000-4000-8000-000000000004', email: 'andi@dexa.test', role: Role.EMPLOYEE },
];

async function main(): Promise<void> {
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 12);
  for (const user of SEED_USERS) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: { passwordHash, role: user.role, isActive: true },
      create: { ...user, passwordHash, isActive: true },
    });
  }
  const count = await prisma.user.count();
  console.log(`[seed:auth] users=${count} password=${SEED_PASSWORD}`);
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
