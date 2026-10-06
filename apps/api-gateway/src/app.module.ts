import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ServeStaticModule } from '@nestjs/serve-static';
import { JwtAuthGuard, RolesGuard, loadConfig } from '@app/common';
import { AuthModule } from './auth/auth.module';
import { EmployeeModule } from './employee/employee.module';
import { HealthModule } from './health/health.module';
import { TcpClientsModule } from './common/tcp-clients.module';

const config = loadConfig();
// ponytail: cwd-relative; if the gateway ever runs from a different cwd, move to a config-provided absolute path.
const uploadRoot = resolve(process.cwd(), config.uploadDir);
mkdirSync(uploadRoot, { recursive: true });

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    JwtModule.register({
      global: true,
      secret: config.jwtSecret,
      signOptions: { expiresIn: '8h' },
    }),
    TcpClientsModule,
    ServeStaticModule.forRoot({ rootPath: uploadRoot, serveRoot: '/uploads' }),
    AuthModule,
    EmployeeModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
