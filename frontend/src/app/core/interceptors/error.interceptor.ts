import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  return next(req).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse) {
        const message =
          typeof error.error === 'object' && error.error && 'message' in error.error
            ? String((error.error as { message?: unknown }).message)
            : error.message;

        try {
          Object.defineProperty(error, 'message', {
            value: message || 'Request failed',
            configurable: true,
          });
        } catch {
          // Keep original message if property is not writable.
        }

        return throwError(() => error);
      }

      return throwError(() => (error instanceof Error ? error : new Error('Unexpected error')));
    }),
  );
};
