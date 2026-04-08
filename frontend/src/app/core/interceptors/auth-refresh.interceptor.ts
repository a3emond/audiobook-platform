import {
  HttpContextToken,
  HttpErrorResponse,
  HttpInterceptorFn,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { from, switchMap, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { AuthService } from '../services/auth.service';

const RETRIED_CONTEXT = new HttpContextToken<boolean>(() => false);
let refreshInFlight: Promise<boolean> | null = null;

function shouldSkipRefresh(url: string): boolean {
  return /\/auth\/(login|register|refresh)$/i.test(url);
}

function getRefreshPromise(auth: AuthService): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = auth.refresh().finally(() => {
      refreshInFlight = null;
    });
  }

  return refreshInFlight;
}

export const authRefreshInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return next(req).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse)) {
        return throwError(() => error);
      }

      if (error.status !== 401 || shouldSkipRefresh(req.url) || req.context.get(RETRIED_CONTEXT)) {
        return throwError(() => error);
      }

      return from(getRefreshPromise(auth)).pipe(
        switchMap((refreshed) => {
          if (!refreshed) {
            void router.navigateByUrl('/login');
            return throwError(() => error);
          }

          const token = auth.accessToken();
          const retriedReq = req.clone({
            context: req.context.set(RETRIED_CONTEXT, true),
            setHeaders: token ? { Authorization: `Bearer ${token}` } : {},
          });

          return next(retriedReq);
        }),
      );
    }),
  );
};
