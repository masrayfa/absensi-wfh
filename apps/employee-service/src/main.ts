import { NestFactory } from '@nestjs/core';
import {
  MicroserviceOptions,
  Transport,
} from '@nestjs/microservices';
import { loadConfig } from '@app/common';
import { AppModule } from './app.module';
import { RpcHttpExceptionFilter } from './common/rpc-http-exception.filter';

async function bootstrap(): Promise<void> {
  const { employeeTcpPort } = loadConfig();
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    AppModule,
    {
      transport: Transport.TCP,
      options: { host: '0.0.0.0', port: employeeTcpPort },
    },
  );
  app.useGlobalFilters(new RpcHttpExceptionFilter());
  await app.listen();
  console.log(`[employee-service] TCP listening on 0.0.0.0:${employeeTcpPort}`);
}

bootstrap().catch((err: unknown) => {
  console.error('[employee-service] fatal', err);
  process.exit(1);
});
