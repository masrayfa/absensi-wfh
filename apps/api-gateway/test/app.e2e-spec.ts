import 'reflect-metadata';
import {
  INestApplication,
  INestMicroservice,
  ValidationPipe,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Transport } from '@nestjs/microservices';
import { loadConfig, wibDateOf } from '@app/common';
import request from 'supertest';
import { AppModule as AttendanceAppModule } from '../../attendance-service/src/app.module';
import { RpcHttpExceptionFilter as AttendanceRpcFilter } from '../../attendance-service/src/common/rpc-http-exception.filter';
import { AppModule as AuthAppModule } from '../../auth-service/src/app.module';
import { RpcHttpExceptionFilter as AuthRpcFilter } from '../../auth-service/src/common/rpc-http-exception.filter';
import { AppModule as EmployeeAppModule } from '../../employee-service/src/app.module';
import { RpcHttpExceptionFilter as EmployeeRpcFilter } from '../../employee-service/src/common/rpc-http-exception.filter';
import { AppModule as GatewayAppModule } from '../src/app.module';
import { GatewayExceptionFilter } from '../src/common/gateway-exception.filter';

const PASSWORD = 'Password123!';
const DEFAULT_PASSWORD = 'Welcome123!';

/** Real (tiny) PNG so multer stores a real image file. */
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

interface LoginResponse {
  accessToken: string;
  user: { id: string; email: string; role: string };
}

interface EmployeeRow {
  id: string;
  employeeNo: string;
  fullName: string;
  email: string;
  department: string;
  status: string;
}

interface AttendanceRow {
  id: string;
  employeeId: string;
  employeeName: string;
  date: string;
  photoUrl: string;
}

/**
 * End-to-end over the REAL gateway + REAL TCP services, with each service on
 * its own isolated test schema (`*_test`, provisioned by tools/backend-test.cjs).
 * All four apps boot in-process (TCP services first, then the HTTP gateway);
 * Supertest drives the gateway on an ephemeral port, so the dev ports
 * (3000/4001-4003) are never bound.
 */
describe('api-gateway e2e (real gateway -> real TCP services -> isolated MySQL test schemas)', () => {
  let gateway: INestApplication;
  let authSvc: INestMicroservice;
  let employeeSvc: INestMicroservice;
  let attendanceSvc: INestMicroservice;
  let api: ReturnType<typeof request>;
  let hrdToken: string;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  let seq = 0;
  const unique = (tag: string) => `t17-${tag}-${Date.now()}-${(seq += 1)}`;

  async function login(email: string, password = PASSWORD): Promise<LoginResponse> {
    const res = await api.post('/auth/login').send({ email, password }).expect(200);
    return res.body as LoginResponse;
  }

  function employeePayload(employeeNo: string, email: string) {
    return {
      employeeNo,
      fullName: 'T17 Karyawan',
      email,
      department: 'QA',
      position: 'Test Engineer',
      phone: '081200000017',
      joinDate: '2025-02-01',
    };
  }

  beforeAll(async () => {
    const config = loadConfig();

    authSvc = await NestFactory.createMicroservice(AuthAppModule, {
      transport: Transport.TCP,
      options: { host: '127.0.0.1', port: config.authTcpPort },
      logger: false,
    });
    authSvc.useGlobalFilters(new AuthRpcFilter());
    await authSvc.listen();

    employeeSvc = await NestFactory.createMicroservice(EmployeeAppModule, {
      transport: Transport.TCP,
      options: { host: '127.0.0.1', port: config.employeeTcpPort },
      logger: false,
    });
    employeeSvc.useGlobalFilters(new EmployeeRpcFilter());
    await employeeSvc.listen();

    attendanceSvc = await NestFactory.createMicroservice(AttendanceAppModule, {
      transport: Transport.TCP,
      options: { host: '127.0.0.1', port: config.attendanceTcpPort },
      logger: false,
    });
    attendanceSvc.useGlobalFilters(new AttendanceRpcFilter());
    await attendanceSvc.listen();

    gateway = await NestFactory.create(GatewayAppModule, { logger: false });
    gateway.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    gateway.useGlobalFilters(new GatewayExceptionFilter());
    await gateway.init();
    api = request(gateway.getHttpServer());

    hrdToken = (await login('hrd@dexa.test')).accessToken;
  });

  afterAll(async () => {
    await gateway?.close();
    await authSvc?.close();
    await employeeSvc?.close();
    await attendanceSvc?.close();
  });

  describe('login', () => {
    it('POST /auth/login with the seeded HRD returns 200 and a JWT accepted by /auth/me', async () => {
      const res = await api
        .post('/auth/login')
        .send({ email: 'hrd@dexa.test', password: PASSWORD })
        .expect(200);
      const body = res.body as LoginResponse;

      expect(body.accessToken).toEqual(expect.any(String));
      expect(body.user).toMatchObject({ email: 'hrd@dexa.test', role: 'HRD' });

      const me = await api.get('/auth/me').set(auth(body.accessToken)).expect(200);
      expect(me.body).toMatchObject({ email: 'hrd@dexa.test', role: 'HRD' });
    });

    it('POST /auth/login with a wrong password returns 401', async () => {
      await api
        .post('/auth/login')
        .send({ email: 'hrd@dexa.test', password: 'wrong' })
        .expect(401);
    });
  });

  describe('employee master (HRD)', () => {
    it('create -> list -> update an employee over HTTP', async () => {
      const tag = unique('crud');
      const employeeNo = `T17-${tag}`;
      const email = `${tag}@dexa.test`;

      const created = await api
        .post('/employees')
        .set(auth(hrdToken))
        .send(employeePayload(employeeNo, email))
        .expect(201);
      const employee = created.body as EmployeeRow & { defaultPassword: string };

      expect(employee).toMatchObject({ employeeNo, email, fullName: 'T17 Karyawan', status: 'ACTIVE' });
      expect(employee.defaultPassword).toBe(DEFAULT_PASSWORD);

      const listed = await api
        .get('/employees')
        .query({ search: employeeNo })
        .set(auth(hrdToken))
        .expect(200);
      expect((listed.body as EmployeeRow[]).map((row) => row.id)).toContain(employee.id);

      const updated = await api
        .patch(`/employees/${employee.id}`)
        .set(auth(hrdToken))
        .send({ fullName: 'T17 Updated', department: 'Engineering' })
        .expect(200);
      expect(updated.body).toMatchObject({
        id: employee.id,
        fullName: 'T17 Updated',
        department: 'Engineering',
      });
    });

    it('deactivated-employee login is rejected with 401', async () => {
      const tag = unique('deactivate');
      const email = `${tag}@dexa.test`;

      const created = await api
        .post('/employees')
        .set(auth(hrdToken))
        .send(employeePayload(`T17-${tag}`, email))
        .expect(201);
      const employee = created.body as EmployeeRow;

      await api.post('/auth/login').send({ email, password: DEFAULT_PASSWORD }).expect(200);

      await api
        .patch(`/employees/${employee.id}/deactivate`)
        .set(auth(hrdToken))
        .expect(200);

      await api.post('/auth/login').send({ email, password: DEFAULT_PASSWORD }).expect(401);
    });
  });

  describe('attendance', () => {
    let budiToken: string;
    let budiEmployeeId: string;
    let checkedIn: AttendanceRow;

    beforeAll(async () => {
      budiToken = (await login('budi@dexa.test')).accessToken;
      const listed = await api
        .get('/employees')
        .query({ search: 'budi@dexa.test' })
        .set(auth(hrdToken))
        .expect(200);
      budiEmployeeId = (listed.body as EmployeeRow[])[0]!.id;
    });

    it('multipart check-in stores the photo; same-day re-check-in returns the SAME record', async () => {
      const first = await api
        .post('/attendance/check-in')
        .set(auth(budiToken))
        .attach('photo', PNG_1X1, { filename: 'checkin.png', contentType: 'image/png' })
        .expect(201);
      checkedIn = first.body as AttendanceRow;

      expect(checkedIn.employeeId).toBe(budiEmployeeId);
      expect(checkedIn.photoUrl).toMatch(/^\/uploads\/[0-9a-f-]+\.png$/);
      expect(checkedIn.date.slice(0, 10)).toBe(wibDateOf(new Date()));

      const second = await api
        .post('/attendance/check-in')
        .set(auth(budiToken))
        .attach('photo', PNG_1X1, { filename: 'checkin-again.png', contentType: 'image/png' })
        .expect(201);
      expect((second.body as AttendanceRow).id).toBe(checkedIn.id);

      // The stored photo is served over the gateway's /uploads static route.
      await api.get(checkedIn.photoUrl).expect(200);
    });

    it('check-in without a photo is rejected with 400', async () => {
      await api.post('/attendance/check-in').set(auth(budiToken)).expect(400);
    });

    it('HRD GET /attendance lists the record; EMPLOYEE GET /attendance is 403', async () => {
      const listed = await api
        .get('/attendance')
        .query({ employeeId: budiEmployeeId })
        .set(auth(hrdToken))
        .expect(200);
      expect((listed.body as AttendanceRow[]).map((row) => row.id)).toContain(checkedIn.id);

      await api.get('/attendance').set(auth(budiToken)).expect(403);
    });
  });
});
