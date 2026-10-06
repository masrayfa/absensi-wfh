import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { AllExceptionsFilter } from '@app/common';

interface HttpResponseLike {
  status(code: number): { json(body: unknown): void };
}

interface HttpRequestLike {
  url?: string;
}

/**
 * The services signal domain failures as `RpcException({ statusCode, message })`.
 * Over TCP that arrives at the gateway as a plain serialized object (Nest's TCP
 * client throws the deserialized error, not an RpcException instance), so it is
 * matched structurally here; without this it would surface as a 500. Http
 * exceptions and genuine local errors fall through to the shared filter.
 */
@Catch()
export class GatewayExceptionFilter implements ExceptionFilter {
  private readonly fallback = new AllExceptionsFilter();

  catch(exception: unknown, host: ArgumentsHost): void {
    const upstream = toUpstreamError(exception);
    if (!upstream) {
      this.fallback.catch(exception, host);
      return;
    }

    const ctx = host.switchToHttp();
    const response = ctx.getResponse<HttpResponseLike>();
    const request = ctx.getRequest<HttpRequestLike>();

    response.status(upstream.statusCode).json({
      statusCode: upstream.statusCode,
      error: upstream.statusCode === HttpStatus.BAD_GATEWAY ? 'BadGateway' : 'UpstreamError',
      message: upstream.message,
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
}

function toUpstreamError(
  exception: unknown,
): { statusCode: number; message: string | string[] } | null {
  if (exception instanceof HttpException) return null;

  const payload = exception instanceof RpcException ? exception.getError() : exception;
  const record = asRecord(payload);
  if (!record) return null;

  const inner = asRecord(record.error) ?? asRecord(record.response) ?? record;
  const statusCode = statusInRange(inner.statusCode) ?? statusInRange(record.statusCode);
  if (statusCode === undefined) return null;

  return { statusCode, message: readMessage(inner.message ?? record.message) };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

function statusInRange(value: unknown): number | undefined {
  const code = Number(value);
  return Number.isInteger(code) && code >= 400 && code < 600 ? code : undefined;
}

function readMessage(message: unknown): string | string[] {
  if (typeof message === 'string') return message;
  if (Array.isArray(message) && message.every((m) => typeof m === 'string')) return message;
  return 'Upstream service error';
}
