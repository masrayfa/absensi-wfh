import { Global, Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { loadConfig } from '@app/common';
import { CLIENT_ATTENDANCE, CLIENT_AUTH, CLIENT_EMPLOYEE } from './clients';

const config = loadConfig();

/**
 * Registers the three TCP clients once and re-exports them globally, so every
 * feature module can inject a ClientProxy by token without re-registering
 * (and without opening duplicate connections).
 */
@Global()
@Module({
  imports: [
    ClientsModule.register([
      {
        name: CLIENT_AUTH,
        transport: Transport.TCP,
        options: { host: config.authTcpHost, port: config.authTcpPort },
      },
      {
        name: CLIENT_EMPLOYEE,
        transport: Transport.TCP,
        options: { host: config.employeeTcpHost, port: config.employeeTcpPort },
      },
      {
        name: CLIENT_ATTENDANCE,
        transport: Transport.TCP,
        options: { host: config.attendanceTcpHost, port: config.attendanceTcpPort },
      },
    ]),
  ],
  exports: [ClientsModule],
})
export class TcpClientsModule {}
