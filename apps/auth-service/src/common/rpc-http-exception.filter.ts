import { ArgumentsHost, Catch, HttpException } from '@nestjs/common';
import { BaseRpcExceptionFilter, RpcException } from '@nestjs/microservices';
import { Observable, throwError } from 'rxjs';

interface HttpExceptionBody {
  message?: string | string[];
}

/**
 * Services throw HttpExceptions (UnauthorizedException, ConflictException, ...)
 * for domain errors. Over TCP Nest would otherwise flatten every one of them to
 * "Internal server error" and log an ERROR; this filter forwards the status and
 * message so the gateway can map them back to real HTTP responses.
 */
@Catch()
export class RpcHttpExceptionFilter extends BaseRpcExceptionFilter {
  override catch(exception: unknown, host: ArgumentsHost): Observable<unknown> {
    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      const message =
        typeof body === 'string'
          ? body
          : ((body as HttpExceptionBody).message ?? exception.message);
      return throwError(
        () => new RpcException({ statusCode: exception.getStatus(), message }),
      );
    }
    return super.catch(exception, host);
  }
}
