import { NestFactory } from '@nestjs/core';
import {
  MicroserviceOptions,
  Transport,
} from '@nestjs/microservices';
import { loadConfig } from '@app/common';
import { AppModule } from './app.module';
import { RpcHttpExceptionFilter } from './common/rpc-http-exception.filter';

async function bootstrap(): Promise<void> {
  const { authTcpPort } = loadConfig();
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    AppModule,
    {
      transport: Transport.TCP,
      options: { host: '0.0.0.0', port: authTcpPort },
    },
  );
  app.useGlobalFilters(new RpcHttpExceptionFilter());
  await app.listen();
  console.log(`[auth-service] TCP listening on 0.0.0.0:${authTcpPort}`);
}

bootstrap().catch((err: unknown) => {
  console.error('[auth-service] fatal', err);
  process.exit(1);
});
