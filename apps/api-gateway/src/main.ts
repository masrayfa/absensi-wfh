import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { loadConfig } from '@app/common';
import { AppModule } from './app.module';
import { GatewayExceptionFilter } from './common/gateway-exception.filter';

async function bootstrap(): Promise<void> {
  const config = loadConfig();
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: false }),
  );
  app.useGlobalFilters(new GatewayExceptionFilter());
  app.enableCors({ origin: config.webOrigin, credentials: true });

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Absensi WFH API')
      .setDescription('Gateway for auth, employee, and attendance services.')
      .setVersion('1.0')
      .addBearerAuth()
      .build(),
  );
  SwaggerModule.setup('docs', app, document);

  await app.listen(config.gatewayPort);
  console.log(
    `[api-gateway] HTTP listening on http://localhost:${config.gatewayPort} (docs at /docs)`,
  );
}

bootstrap().catch((err: unknown) => {
  console.error('[api-gateway] fatal', err);
  process.exit(1);
});
