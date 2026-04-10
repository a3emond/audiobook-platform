import type { PaginationMeta, UpdateSettingsPayload, UserProfile } from '../../../core/models/api.models';
import { from, map, switchMap, type Observable } from 'rxjs';

import type { AuthService } from '../../../core/services/auth.service';
import type { I18nService } from '../../../core/services/i18n.service';
import type { LibraryService } from '../../../core/services/library.service';
import type { SettingsService } from '../../../core/services/settings.service';
import type { StatsService } from '../../../core/services/stats.service';
import type { HistoryBookRow, ProfilePreferencesValues, ThresholdOption } from './profile-page.types';
import { closestOption, closestThreshold, groupSessionsByBook } from './profile-page.utils';

// Profile data workflows: centralize API composition to keep the page component lean.
export function loadProfilePreferences(
  settingsService: SettingsService,
  jumpOptions: readonly number[],
  thresholdOptions: ReadonlyArray<ThresholdOption>,
): Observable<ProfilePreferencesValues> {
  return settingsService.getMyProfile().pipe(
    switchMap((user) =>
      settingsService.getMine().pipe(
        map((settings) => ({
          displayName: user.profile.displayName ?? '',
          preferredLocale: user.profile.preferredLocale,
          forwardJumpSeconds: closestOption(settings.player.forwardJumpSeconds, jumpOptions),
          backwardJumpSeconds: closestOption(settings.player.backwardJumpSeconds, jumpOptions),
          playbackRate: settings.player.playbackRate,
          resumeRewindEnabled: settings.player.resumeRewind.enabled,
          rewindThresholdSeconds: closestThreshold(
            settings.player.resumeRewind.thresholdSinceLastListenSeconds,
            [...thresholdOptions],
          ),
          rewindSeconds: closestOption(settings.player.resumeRewind.rewindSeconds, jumpOptions),
          showCompleted: settings.library?.showCompleted ?? true,
        })),
      ),
    ),
  );
}

export function saveProfilePreferences(
  settingsService: SettingsService,
  authService: AuthService,
  i18nService: I18nService,
  values: ProfilePreferencesValues,
): Observable<void> {
  const profilePayload: { profile: Partial<UserProfile> } = {
    profile: {
      displayName: values.displayName.trim() || null,
      preferredLocale: values.preferredLocale,
    },
  };

  const settingsPayload: UpdateSettingsPayload = {
    locale: values.preferredLocale,
    player: {
      forwardJumpSeconds: values.forwardJumpSeconds,
      backwardJumpSeconds: values.backwardJumpSeconds,
      playbackRate: values.playbackRate,
      resumeRewind: {
        enabled: values.resumeRewindEnabled,
        thresholdSinceLastListenSeconds: values.rewindThresholdSeconds,
        rewindSeconds: values.rewindSeconds,
      },
    },
    library: {
      showCompleted: values.showCompleted,
    },
  };

  return settingsService.updateMyProfile(profilePayload).pipe(
    switchMap(() => settingsService.updateMine(settingsPayload)),
    switchMap(() => from(authService.reloadCurrentUser())),
    switchMap(() => from(i18nService.setLocale(values.preferredLocale))),
    map(() => void 0),
  );
}

export function changePassword(
  settingsService: SettingsService,
  payload: { currentPassword: string; newPassword: string },
): Observable<void> {
  return settingsService.changePassword(payload).pipe(map(() => void 0));
}

export function changeEmail(
  settingsService: SettingsService,
  authService: AuthService,
  payload: { currentPassword: string; newEmail: string },
): Observable<void> {
  return settingsService.changeEmail(payload).pipe(
    switchMap(() => from(authService.reloadCurrentUser())),
    map(() => void 0),
  );
}

export interface HistoryLoadResult {
  rows: HistoryBookRow[];
  meta: PaginationMeta;
}

export function loadProfileHistory(statsService: StatsService, libraryService: LibraryService): Observable<HistoryLoadResult> {
  return statsService.listSessions({ limit: 100, offset: 0 }).pipe(
    switchMap((sessionsResponse) =>
      libraryService.listBooks({ limit: 300, offset: 0 }).pipe(
        map((booksResponse) => {
          const byId = new Map(booksResponse.books.map((book) => [book.id, book]));
          return {
            rows: groupSessionsByBook(sessionsResponse.sessions, byId),
            meta: {
              total: sessionsResponse.total,
              limit: sessionsResponse.limit,
              offset: sessionsResponse.offset,
              hasMore: sessionsResponse.hasMore,
            },
          };
        }),
      ),
    ),
  );
}