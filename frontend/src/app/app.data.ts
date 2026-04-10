import { firstValueFrom } from 'rxjs';

import type { Book, Progress } from './core/models/api.models';
import type { AuthService } from './core/services/auth.service';
import type { LibraryService } from './core/services/library.service';
import type { ProgressService } from './core/services/progress.service';
import type { SettingsService } from './core/services/settings.service';
import type { I18nService } from './core/services/i18n.service';
import type { InProgressBookItem } from './app.types';
import { buildInProgressBooks } from './app.utils';

// App data workflows: keep persistence and multi-request orchestration outside the root component.
export async function persistPreferredLocale(
  locale: 'en' | 'fr',
  i18n: I18nService,
  auth: AuthService,
  settings: SettingsService,
): Promise<boolean> {
  await i18n.setLocale(locale);

  if (!auth.isAuthenticated()) {
    return false;
  }

  await Promise.all([
    firstValueFrom(
      settings.updateMyProfile({
        profile: {
          preferredLocale: locale,
        },
      }),
    ),
    firstValueFrom(settings.updateMine({ locale })),
  ]);

  await auth.reloadCurrentUser();
  return true;
}

export function loadInProgressBooks(
  progressService: ProgressService,
  libraryService: LibraryService,
  handlers: {
    onLoaded: (items: InProgressBookItem[]) => void;
    onError: () => void;
  },
): void {
  progressService.listMine(40, 0).subscribe({
    next: (progressResponse) => {
      const progressItems = [...progressResponse.progress]
        .filter((progress) => !progress.completed && progress.positionSeconds > 0)
        .sort((a, b) => {
          const aTime = a.lastListenedAt ? Date.parse(a.lastListenedAt) : 0;
          const bTime = b.lastListenedAt ? Date.parse(b.lastListenedAt) : 0;
          return bTime - aTime;
        });

      if (progressItems.length === 0) {
        handlers.onLoaded([]);
        return;
      }

      libraryService.listBooks({ limit: 200, offset: 0 }).subscribe({
        next: (booksResponse) => {
          handlers.onLoaded(buildInProgressBooks(progressItems, booksResponse.books));
        },
        error: () => {
          handlers.onError();
        },
      });
    },
    error: () => {
      handlers.onError();
    },
  });
}

export type AppProgressItem = Progress;
export type AppBook = Book;