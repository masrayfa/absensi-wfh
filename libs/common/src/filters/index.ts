import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';

interface HttpRequestLike {
  url?: string;
}

interface HttpResponseLike {
  status(code: number): { json(body: unknown): void };
}

/** One JSON error shape for every gateway failure: { statusCode, error, message, path, timestamp }. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<HttpResponseLike>();
    const request = ctx.getRequest<HttpRequestLike>();
    const isHttp = exception instanceof HttpException;
    const statusCode = isHttp ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const message = isHttp ? httpMessage(exception) : 'Internal server error';

    if (!isHttp) {
      this.logger.error(
        exception instanceof Error ? (exception.stack ?? exception.message) : String(exception),
      );
    }

    response.status(statusCode).json({
      statusCode,
      error: isHttp ? exception.name : 'InternalServerError',
      message,
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
}

function httpMessage(exception: HttpException): string | string[] {
  const body = exception.getResponse();
  if (typeof body === 'string') return body;
  if ('message' in body) {
    const message: unknown = body.message;
    if (typeof message === 'string') return message;
    if (Array.isArray(message) && message.every((m) => typeof m === 'string')) return message;
  }
  return exception.message;
}
