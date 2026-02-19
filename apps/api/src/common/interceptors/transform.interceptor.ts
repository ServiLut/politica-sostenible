import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface Response<T> {
  data: T;
  statusCode: number;
  message?: string;
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<
  T,
  Response<T>
> {
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<Response<T>> {
    const response = context.switchToHttp().getResponse();
    const statusCode = response.statusCode as number;

    return next.handle().pipe(
      map((data: unknown) => {
        const isObject = typeof data === 'object' && data !== null;
        const message =
          isObject && 'message' in data ? String(data.message) : 'Success';
        const responseData =
          isObject && 'data' in data ? (data.data as T) : (data as T);

        return {
          statusCode,
          message,
          data: responseData,
        };
      }),
    );
  }
}
