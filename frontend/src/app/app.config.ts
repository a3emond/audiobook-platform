import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, inject, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withInMemoryScrolling, withNavigationErrorHandler, withViewTransitions } from '@angular/router';

import { routes } from './app.routes';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { authRefreshInterceptor } from './core/interceptors/auth-refresh.interceptor';
import { errorInterceptor } from './core/interceptors/error.interceptor';
import { AuthService } from './core/services/auth.service';
import { I18nService } from './core/services/i18n.service';
import { reloadOnStaleChunk } from './core/utils/stale-chunk';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withInterceptors([authInterceptor, authRefreshInterceptor, errorInterceptor])),
    provideRouter(
      routes,
      withViewTransitions(),
      withInMemoryScrolling({ scrollPositionRestoration: 'enabled' }),
      withNavigationErrorHandler((error) => reloadOnStaleChunk(error.error, error.url)),
    ),
    provideAppInitializer(() => inject(AuthService).init()),
    provideAppInitializer(() => inject(I18nService).init()),
  ],
};
