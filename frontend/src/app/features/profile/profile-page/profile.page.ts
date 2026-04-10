import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import type { PaginationMeta } from '../../../core/models/api.models';
import type { UserStatsResponse } from '../../../core/services/stats.service';
import { AuthService } from '../../../core/services/auth.service';
import { I18nService } from '../../../core/services/i18n.service';
import { LibraryService } from '../../../core/services/library.service';
import { SettingsService } from '../../../core/services/settings.service';
import { StatsService } from '../../../core/services/stats.service';
import { JUMP_OPTIONS, THRESHOLD_OPTIONS } from './profile-page.constants';
import {
  changeEmail,
  changePassword,
  loadProfileHistory,
  loadProfilePreferences,
  saveProfilePreferences,
} from './profile-page.data';
import { createProfileSectionObserver, scrollToProfileSection } from './profile-page.dom';
import type { HistoryBookRow, ProfileSection } from './profile-page.types';
import {
  filterHistoryRows,
  formatDuration,
  groupSessionsByBook,
  historyAuthor,
  historyTitle,
} from './profile-page.utils';
import { validateEmailForm, validatePasswordForm } from './profile-page.validators';

@Component({
  selector: 'app-profile-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './profile.page.html',
  styleUrl: './profile.page.css',
})
// Profile page container: delegates data shaping to helpers and keeps UI behavior focused.
export class ProfilePage implements OnInit, AfterViewInit, OnDestroy {
  private readonly authService = inject(AuthService);
  private readonly statsService = inject(StatsService);
  private readonly library = inject(LibraryService);
  private readonly settingsService = inject(SettingsService);
  private readonly i18n = inject(I18nService);

  readonly auth = this.authService;
  readonly stats = signal<UserStatsResponse | null>(null);

  readonly rows = signal<HistoryBookRow[]>([]);
  readonly filteredRows = signal<HistoryBookRow[]>([]);
  readonly meta = signal<PaginationMeta | null>(null);
  readonly historyLoading = signal(false);
  readonly historyError = signal<string | null>(null);

  readonly preferencesLoading = signal(false);
  readonly preferencesSaving = signal(false);
  readonly preferencesError = signal<string | null>(null);
  readonly preferencesSuccess = signal<string | null>(null);

  readonly passwordSaving = signal(false);
  readonly passwordError = signal<string | null>(null);
  readonly passwordSuccess = signal<string | null>(null);

  readonly emailSaving = signal(false);
  readonly emailError = signal<string | null>(null);
  readonly emailSuccess = signal<string | null>(null);
  readonly activeSection = signal<ProfileSection>('account');

  readonly jumpOptions = [...JUMP_OPTIONS];
  readonly thresholdOptions = THRESHOLD_OPTIONS;

  displayName = '';
  preferredLocale: 'fr' | 'en' = 'en';
  forwardJumpSeconds = 30;
  backwardJumpSeconds = 10;
  playbackRate = 1;
  resumeRewindEnabled = true;
  rewindThresholdSeconds = 24 * 60 * 60;
  rewindSeconds = 30;
  showCompleted = true;

  currentPassword = '';
  newPassword = '';
  confirmNewPassword = '';

  emailCurrentPassword = '';
  newEmail = '';
  confirmNewEmail = '';

  query = '';
  private filterTimeout?: ReturnType<typeof setTimeout>;
  private sectionObserver: IntersectionObserver | null = null;

  ngOnInit(): void {
    this.loadPreferences();
    this.loadStats();
    this.loadHistory();
  }

  ngAfterViewInit(): void {
    this.setupSectionObserver();
  }

  ngOnDestroy(): void {
    this.sectionObserver?.disconnect();
    if (this.filterTimeout) {
      clearTimeout(this.filterTimeout);
    }
  }

  savePreferences(): void {
    this.preferencesSaving.set(true);
    this.preferencesError.set(null);
    this.preferencesSuccess.set(null);

    saveProfilePreferences(this.settingsService, this.authService, this.i18n, {
      displayName: this.displayName,
      preferredLocale: this.preferredLocale,
      forwardJumpSeconds: this.forwardJumpSeconds,
      backwardJumpSeconds: this.backwardJumpSeconds,
      playbackRate: this.playbackRate,
      resumeRewindEnabled: this.resumeRewindEnabled,
      rewindThresholdSeconds: this.rewindThresholdSeconds,
      rewindSeconds: this.rewindSeconds,
      showCompleted: this.showCompleted,
    }).subscribe({
      next: () => {
        this.preferencesSuccess.set('Preferences saved');
        this.preferencesSaving.set(false);
      },
      error: (error: unknown) => {
        this.preferencesError.set(error instanceof Error ? error.message : 'Failed to save preferences');
        this.preferencesSaving.set(false);
      },
    });
  }

  submitChangePassword(): void {
    this.passwordError.set(null);
    this.passwordSuccess.set(null);

    const validationError = validatePasswordForm({
      currentPassword: this.currentPassword,
      newPassword: this.newPassword,
      confirmNewPassword: this.confirmNewPassword,
    });
    if (validationError) {
      this.passwordError.set(validationError);
      return;
    }

    this.passwordSaving.set(true);
    changePassword(this.settingsService, {
      currentPassword: this.currentPassword,
      newPassword: this.newPassword,
    }).subscribe({
      next: () => {
        this.passwordSuccess.set('Password updated');
        this.currentPassword = '';
        this.newPassword = '';
        this.confirmNewPassword = '';
        this.passwordSaving.set(false);
      },
      error: (error: unknown) => {
        this.passwordError.set(error instanceof Error ? error.message : 'Unable to update password');
        this.passwordSaving.set(false);
      },
    });
  }

  submitChangeEmail(): void {
    this.emailError.set(null);
    this.emailSuccess.set(null);

    const validationError = validateEmailForm({
      emailCurrentPassword: this.emailCurrentPassword,
      newEmail: this.newEmail,
      confirmNewEmail: this.confirmNewEmail,
    });
    if (validationError) {
      this.emailError.set(validationError);
      return;
    }

    this.emailSaving.set(true);
    changeEmail(this.settingsService, this.authService, {
      currentPassword: this.emailCurrentPassword,
      newEmail: this.newEmail,
    }).subscribe({
      next: () => {
        this.emailSuccess.set('Email updated');
        this.emailCurrentPassword = '';
        this.newEmail = '';
        this.confirmNewEmail = '';
        this.emailSaving.set(false);
      },
      error: (error: unknown) => {
        this.emailError.set(error instanceof Error ? error.message : 'Unable to update email');
        this.emailSaving.set(false);
      },
    });
  }

  onFilterChange(): void {
    if (this.filterTimeout) {
      clearTimeout(this.filterTimeout);
    }
    this.filterTimeout = setTimeout(() => this.applyFilter(), 180);
  }

  clearFilter(): void {
    if (!this.hasActiveFilter()) {
      return;
    }

    this.query = '';
    this.applyFilter();
  }

  scrollToSection(section: ProfileSection): void {
    if (!scrollToProfileSection(section)) {
      return;
    }
    this.activeSection.set(section);
  }

  hasActiveFilter(): boolean {
    return this.query.trim().length > 0;
  }

  displayTitle(item: HistoryBookRow): string {
    return historyTitle(item);
  }

  displayAuthor(item: HistoryBookRow): string {
    return historyAuthor(item);
  }

  formatDuration(totalSeconds: number): string {
    return formatDuration(totalSeconds);
  }

  private loadPreferences(): void {
    this.preferencesLoading.set(true);
    this.preferencesError.set(null);

    loadProfilePreferences(this.settingsService, this.jumpOptions, this.thresholdOptions).subscribe({
      next: (values) => {
        this.displayName = values.displayName;
        this.preferredLocale = values.preferredLocale;
        this.forwardJumpSeconds = values.forwardJumpSeconds;
        this.backwardJumpSeconds = values.backwardJumpSeconds;
        this.playbackRate = values.playbackRate;
        this.resumeRewindEnabled = values.resumeRewindEnabled;
        this.rewindThresholdSeconds = values.rewindThresholdSeconds;
        this.rewindSeconds = values.rewindSeconds;
        this.showCompleted = values.showCompleted;
        this.preferencesLoading.set(false);
      },
      error: (error: unknown) => {
        this.preferencesError.set(error instanceof Error ? error.message : 'Unable to load preferences');
        this.preferencesLoading.set(false);
      },
    });
  }

  private loadStats(): void {
    this.statsService.getMine().subscribe({
      next: (response) => this.stats.set(response),
      error: () => this.stats.set(null),
    });
  }

  private loadHistory(): void {
    this.historyLoading.set(true);
    this.historyError.set(null);

    loadProfileHistory(this.statsService, this.library).subscribe({
      next: (result) => {
        this.rows.set(result.rows);
        this.meta.set(result.meta);
        this.applyFilter();
        this.historyLoading.set(false);
      },
      error: (error: unknown) => {
        this.historyError.set(error instanceof Error ? error.message : 'Unable to load history');
        this.historyLoading.set(false);
      },
    });
  }

  private applyFilter(): void {
    this.filteredRows.set(filterHistoryRows(this.rows(), this.query));
  }

  loadMoreHistory(): void {
    const m = this.meta();
    if (!m?.hasMore || this.historyLoading()) {
      return;
    }

    const nextOffset = m.offset + m.limit;
    this.historyLoading.set(true);

    this.statsService
      .listSessions({ limit: m.limit, offset: nextOffset })
      .subscribe({
        next: (response) => {
          this.library.listBooks({ limit: 300, offset: 0 }).subscribe({
            next: (booksResponse) => {
              const byId = new Map(booksResponse.books.map((book) => [book.id, book]));
              const newRows = groupSessionsByBook(response.sessions, byId);
              this.rows.update((existing) => [...existing, ...newRows]);
              this.meta.set({
                total: response.total,
                limit: response.limit,
                offset: response.offset,
                hasMore: response.hasMore,
              });
              this.applyFilter();
              this.historyLoading.set(false);
            },
            error: (error: unknown) => {
              this.historyError.set(error instanceof Error ? error.message : 'Unable to load books');
              this.historyLoading.set(false);
            },
          });
        },
        error: (error: unknown) => {
          this.historyError.set(error instanceof Error ? error.message : 'Unable to load sessions');
          this.historyLoading.set(false);
        },
      });
  }

  private setupSectionObserver(): void {
    // Keep section chips in sync with what the user currently sees.
    this.sectionObserver = createProfileSectionObserver((section) => this.activeSection.set(section));
  }
}
