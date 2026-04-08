import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import type { Book, ListeningSession, PaginationMeta } from '../../core/models/api.models';
import type { UserStatsResponse } from '../../core/services/stats.service';
import { AuthService } from '../../core/services/auth.service';
import { I18nService } from '../../core/services/i18n.service';
import { LibraryService } from '../../core/services/library.service';
import { SettingsService } from '../../core/services/settings.service';
import { StatsService } from '../../core/services/stats.service';

interface HistoryBookRow {
  bookId: string;
  book: Book | null;
  sessions: number;
  totalListenedSeconds: number;
  averageSessionSeconds: number;
  lastListenedAt: string | null;
}

interface ThresholdOption {
  label: string;
  seconds: number;
}

@Component({
  selector: 'app-profile-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <section class="profile-page page-shell">
      <header class="hero">
        <h1 class="hero-title">Profile</h1>
        <p class="hero-subtitle">Account details, listening stats, and activity in one place.</p>
      </header>

      <nav class="section-nav card" aria-label="Profile sections">
        <button type="button" [class.active]="activeSection() === 'account'" (click)="scrollToSection('account')">Account</button>
        <button type="button" [class.active]="activeSection() === 'security'" (click)="scrollToSection('security')">Security</button>
        <button type="button" [class.active]="activeSection() === 'stats'" (click)="scrollToSection('stats')">Stats</button>
        <button type="button" [class.active]="activeSection() === 'history'" (click)="scrollToSection('history')">History</button>
      </nav>

      <section id="account" class="card account" *ngIf="auth.user() as user">
        <h2>Account & Preferences</h2>
        <p class="meta">Signed in as {{ user.email }} ({{ user.role }})</p>

        <p *ngIf="preferencesError()" class="text-error">{{ preferencesError() }}</p>
        <p *ngIf="preferencesSuccess()" class="text-success">{{ preferencesSuccess() }}</p>

        <form class="account-grid" (ngSubmit)="savePreferences()">
          <label>
            Display Name
            <input name="displayName" [(ngModel)]="displayName" />
          </label>

          <label>
            Preferred Locale
            <select name="preferredLocale" [(ngModel)]="preferredLocale">
              <option value="en">English</option>
              <option value="fr">Francais</option>
            </select>
          </label>

          <label>
            Forward Jump
            <select name="forwardJumpSeconds" [(ngModel)]="forwardJumpSeconds">
              <option *ngFor="let value of jumpOptions" [ngValue]="value">{{ value }} seconds</option>
            </select>
          </label>

          <label>
            Backward Jump
            <select name="backwardJumpSeconds" [(ngModel)]="backwardJumpSeconds">
              <option *ngFor="let value of jumpOptions" [ngValue]="value">{{ value }} seconds</option>
            </select>
          </label>

          <label>
            Playback Rate
            <input name="rate" type="number" step="0.05" min="0.5" max="3" [(ngModel)]="playbackRate" />
          </label>

          <label>
            Resume Rewind Threshold
            <select name="rewindThresholdSeconds" [(ngModel)]="rewindThresholdSeconds">
              <option *ngFor="let option of thresholdOptions" [ngValue]="option.seconds">{{ option.label }}</option>
            </select>
          </label>

          <label>
            Resume Rewind Amount
            <select name="rewindSeconds" [(ngModel)]="rewindSeconds">
              <option *ngFor="let value of jumpOptions" [ngValue]="value">{{ value }} seconds</option>
            </select>
          </label>

          <label class="checkbox-row">
            <input name="rewindEnabled" type="checkbox" [(ngModel)]="resumeRewindEnabled" />
            <span>Resume Rewind Enabled</span>
          </label>

          <label class="checkbox-row">
            <input name="showCompleted" type="checkbox" [(ngModel)]="showCompleted" />
            <span>Show completed books in library</span>
          </label>

          <button class="btn" type="submit" [disabled]="preferencesSaving() || preferencesLoading()">
            {{ preferencesSaving() ? 'Saving...' : 'Save Preferences' }}
          </button>
        </form>
      </section>

      <section id="security" class="card security" *ngIf="auth.user()">
        <h2>Security</h2>

        <div class="security-grid">
          <form class="security-form" (ngSubmit)="submitChangePassword()">
            <h3>Change Password</h3>
            <p *ngIf="passwordError()" class="text-error">{{ passwordError() }}</p>
            <p *ngIf="passwordSuccess()" class="text-success">{{ passwordSuccess() }}</p>

            <label>
              Current Password
              <input type="password" name="currentPassword" [(ngModel)]="currentPassword" required />
            </label>

            <label>
              New Password
              <input type="password" name="newPassword" [(ngModel)]="newPassword" required />
            </label>

            <label>
              Confirm New Password
              <input type="password" name="confirmNewPassword" [(ngModel)]="confirmNewPassword" required />
            </label>

            <button class="btn" type="submit" [disabled]="passwordSaving()">{{ passwordSaving() ? 'Updating...' : 'Update Password' }}</button>
          </form>

          <form class="security-form" (ngSubmit)="submitChangeEmail()">
            <h3>Change Email</h3>
            <p *ngIf="emailError()" class="text-error">{{ emailError() }}</p>
            <p *ngIf="emailSuccess()" class="text-success">{{ emailSuccess() }}</p>

            <label>
              Current Password
              <input type="password" name="emailCurrentPassword" [(ngModel)]="emailCurrentPassword" required />
            </label>

            <label>
              New Email
              <input type="email" name="newEmail" [(ngModel)]="newEmail" required />
            </label>

            <label>
              Confirm New Email
              <input type="email" name="confirmNewEmail" [(ngModel)]="confirmNewEmail" required />
            </label>

            <button class="btn" type="submit" [disabled]="emailSaving()">{{ emailSaving() ? 'Updating...' : 'Update Email' }}</button>
          </form>
        </div>
      </section>

      <section id="stats" class="stats-block">
        <h2>Listening Stats</h2>

        @if (!stats()) {
          <p class="text-muted">Loading stats...</p>
        } @else {
          <div class="stats-grid">
            <article class="card stat">
              <h3>Lifetime listening</h3>
              <p>{{ formatDuration(stats()?.lifetime?.totalListeningSeconds ?? 0) }}</p>
            </article>

            <article class="card stat">
              <h3>Total sessions</h3>
              <p>{{ stats()?.lifetime?.totalSessions ?? 0 }}</p>
            </article>

            <article class="card stat">
              <h3>Books completed</h3>
              <p>{{ stats()?.lifetime?.distinctBooksCompleted ?? 0 }}</p>
            </article>

            <article class="card stat">
              <h3>Last 7 days</h3>
              <p>{{ formatDuration(stats()?.rolling?.last7DaysListeningSeconds ?? 0) }}</p>
            </article>
          </div>
        }
      </section>

      <section id="history" class="history-block">
        <div class="section-head">
          <h2>Listening History</h2>
          <a class="btn btn-secondary" [routerLink]="['/collections', 'auto:listened']">Open Activity Collection</a>
        </div>

        <section class="filters card">
          <label>
            <span>Filter</span>
            <input
              name="query"
              [(ngModel)]="query"
              (ngModelChange)="onFilterChange()"
              placeholder="Filter by title, author, or book id"
            />
          </label>
          <button type="button" class="btn btn-secondary" (click)="clearFilter()" [disabled]="!hasActiveFilter()">Clear</button>
        </section>

        <p *ngIf="historyLoading()" class="text-muted">Loading sessions...</p>
        <p *ngIf="historyError()" class="text-error">{{ historyError() }}</p>

        <section class="table-wrap card" *ngIf="!historyLoading() && filteredRows().length > 0">
          <table class="history-table">
            <thead>
              <tr>
                <th>Book</th>
                <th>Author</th>
                <th>Sessions</th>
                <th>Total listened</th>
                <th>Avg session</th>
                <th>Last listened</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let row of filteredRows()">
                <td>{{ displayTitle(row) }}</td>
                <td>{{ displayAuthor(row) }}</td>
                <td>{{ row.sessions }}</td>
                <td>{{ formatDuration(row.totalListenedSeconds) }}</td>
                <td>{{ formatDuration(row.averageSessionSeconds) }}</td>
                <td>{{ row.lastListenedAt ? (row.lastListenedAt | date: 'medium') : 'N/A' }}</td>
                <td><a class="resume" [routerLink]="['/player', row.bookId]">Open</a></td>
              </tr>
            </tbody>
          </table>
        </section>

        <section *ngIf="!historyLoading() && !historyError() && filteredRows().length === 0" class="empty card">
          <h3>{{ rows().length === 0 ? 'No listening history yet' : 'No books matched this filter' }}</h3>
          <p class="text-muted">
            {{ rows().length === 0 ? 'Play a book to build your listening history here.' : 'Try a broader query or clear the filter.' }}
          </p>
        </section>

        <footer *ngIf="meta() as m" class="meta-footer">
          <span>Total {{ m.total }}</span>
          <span>Limit {{ m.limit }}</span>
          <span>Offset {{ m.offset }}</span>
          <span>Has more {{ m.hasMore }}</span>
        </footer>
      </section>
    </section>
  `,
  styles: [
    `
      .profile-page {
        display: grid;
        gap: 1rem;
      }

      .hero {
        display: grid;
        gap: 0.35rem;
      }

      .section-nav {
        display: flex;
        gap: 0.5rem;
        flex-wrap: wrap;
        position: sticky;
        top: 0.7rem;
        z-index: 4;
      }

      .section-nav button {
        border: 1px solid var(--color-border);
        border-radius: 999px;
        padding: 0.35rem 0.7rem;
        color: var(--color-text-muted);
        font-size: 0.82rem;
        background: #171717;
        line-height: 1.2;
      }

      .section-nav button:hover {
        border-color: #5a5a5a;
        color: #ffe6be;
      }

      .section-nav button.active {
        color: #fff1d4;
        border-color: #c7862f;
        background: linear-gradient(120deg, #4f3518, #2e2314);
      }

      #account,
      #security,
      #stats,
      #history {
        scroll-margin-top: 8.5rem;
      }

      .account {
        display: grid;
        gap: 0.85rem;
      }

      .account h2 {
        margin: 0;
      }

      .account-grid,
      .security-form {
        display: grid;
        gap: 0.65rem;
      }

      .account-grid {
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      }

      .account-grid button {
        grid-column: 1 / -1;
      }

      .security-grid {
        display: grid;
        gap: 0.8rem;
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      }

      .security h2,
      .security h3 {
        margin: 0;
      }

      .checkbox-row {
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }

      .checkbox-row input {
        width: auto;
      }

      .meta {
        margin: 0;
        color: var(--color-text-muted);
        font-size: 0.9rem;
      }

      .stats-block,
      .history-block {
        display: grid;
        gap: 0.75rem;
      }

      .stats-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
        gap: 0.7rem;
      }

      .stat h3 {
        margin: 0 0 0.35rem;
        color: var(--color-text-muted);
        font-size: 0.82rem;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }

      .stat p {
        margin: 0;
        font-size: 1.25rem;
        font-weight: 700;
        color: #ffe6be;
      }

      .section-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.6rem;
      }

      .filters {
        display: flex;
        align-items: end;
        gap: 0.6rem;
      }

      .filters label {
        flex: 1;
      }

      .table-wrap {
        overflow: auto;
        padding: 0;
      }

      .history-table {
        width: 100%;
        border-collapse: collapse;
        min-width: 720px;
      }

      .history-table thead th {
        text-align: left;
        font-size: 0.78rem;
        color: var(--color-text-muted);
        font-weight: 700;
        padding: 0.6rem 0.75rem;
        border-bottom: 1px solid var(--color-border);
        background: #1a1a1a;
        position: sticky;
        top: 0;
        z-index: 1;
      }

      .history-table tbody td {
        padding: 0.7rem 0.75rem;
        border-bottom: 1px solid var(--color-border);
        font-size: 0.86rem;
        color: var(--color-text);
        vertical-align: middle;
      }

      .history-table tbody tr:hover {
        background: #1c1c1c;
      }

      .resume {
        padding: 0.36rem 0.62rem;
        border-radius: 999px;
        background: #1a1a1a;
        color: #ffe6be;
        border: 1px solid #3a3a3a;
        text-decoration: none;
        font-size: 0.78rem;
        font-weight: 700;
      }

      .empty {
        display: grid;
        gap: 0.45rem;
        padding: 1rem;
        border: 1px dashed #3b3b3b;
        background: linear-gradient(165deg, #151515, #111111);
      }

      .empty h3 {
        margin: 0;
      }

      .meta-footer {
        display: flex;
        gap: 1rem;
        flex-wrap: wrap;
        color: var(--color-text-muted);
        font-size: 0.86rem;
      }

      @media (max-width: 860px) {
        .section-head,
        .filters {
          flex-direction: column;
          align-items: stretch;
        }
      }
    `,
  ],
})
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
  readonly activeSection = signal<'account' | 'security' | 'stats' | 'history'>('account');

  readonly jumpOptions = [5, 10, 15, 20, 25, 30];
  readonly thresholdOptions: ThresholdOption[] = [
    { label: '30 minutes', seconds: 30 * 60 },
    { label: '1 hour', seconds: 60 * 60 },
    { label: '2 hours', seconds: 2 * 60 * 60 },
    { label: '4 hours', seconds: 4 * 60 * 60 },
    { label: '8 hours', seconds: 8 * 60 * 60 },
    { label: '12 hours', seconds: 12 * 60 * 60 },
    { label: '24 hours', seconds: 24 * 60 * 60 },
    { label: '48 hours', seconds: 48 * 60 * 60 },
    { label: '72 hours', seconds: 72 * 60 * 60 },
    { label: '1 week', seconds: 7 * 24 * 60 * 60 },
  ];

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
  private sectionObserver?: IntersectionObserver;

  ngOnInit(): void {
    this.loadPreferences();
    this.loadStats();
    this.loadHistory();
  }

  ngAfterViewInit(): void {
    this.setupSectionObserver();
  }

  ngOnDestroy(): void {
    if (this.sectionObserver) {
      this.sectionObserver.disconnect();
    }

    if (this.filterTimeout) {
      clearTimeout(this.filterTimeout);
    }
  }

  savePreferences(): void {
    this.preferencesSaving.set(true);
    this.preferencesError.set(null);
    this.preferencesSuccess.set(null);

    this.settingsService
      .updateMyProfile({
        profile: {
          displayName: this.displayName.trim() || null,
          preferredLocale: this.preferredLocale,
        },
      })
      .subscribe({
        next: () => {
          this.settingsService
            .updateMine({
              locale: this.preferredLocale,
              player: {
                forwardJumpSeconds: this.forwardJumpSeconds,
                backwardJumpSeconds: this.backwardJumpSeconds,
                playbackRate: this.playbackRate,
                resumeRewind: {
                  enabled: this.resumeRewindEnabled,
                  thresholdSinceLastListenSeconds: this.rewindThresholdSeconds,
                  rewindSeconds: this.rewindSeconds,
                },
              },
              library: {
                showCompleted: this.showCompleted,
              },
            })
            .subscribe({
              next: async () => {
                await this.authService.reloadCurrentUser();
                await this.i18n.setLocale(this.preferredLocale);
                this.preferencesSuccess.set('Preferences saved');
                this.preferencesSaving.set(false);
              },
              error: (error: unknown) => {
                this.preferencesError.set(
                  error instanceof Error ? error.message : 'Failed to save preferences',
                );
                this.preferencesSaving.set(false);
              },
            });
        },
        error: (error: unknown) => {
          this.preferencesError.set(
            error instanceof Error ? error.message : 'Failed to save profile',
          );
          this.preferencesSaving.set(false);
        },
      });
  }

  submitChangePassword(): void {
    this.passwordError.set(null);
    this.passwordSuccess.set(null);

    if (!this.currentPassword || !this.newPassword || !this.confirmNewPassword) {
      this.passwordError.set('Please complete all password fields');
      return;
    }

    if (this.newPassword !== this.confirmNewPassword) {
      this.passwordError.set('New password confirmation does not match');
      return;
    }

    this.passwordSaving.set(true);
    this.settingsService
      .changePassword({
        currentPassword: this.currentPassword,
        newPassword: this.newPassword,
      })
      .subscribe({
        next: () => {
          this.passwordSuccess.set('Password updated');
          this.currentPassword = '';
          this.newPassword = '';
          this.confirmNewPassword = '';
          this.passwordSaving.set(false);
        },
        error: (error: unknown) => {
          this.passwordError.set(
            error instanceof Error ? error.message : 'Unable to update password',
          );
          this.passwordSaving.set(false);
        },
      });
  }

  submitChangeEmail(): void {
    this.emailError.set(null);
    this.emailSuccess.set(null);

    if (!this.emailCurrentPassword || !this.newEmail || !this.confirmNewEmail) {
      this.emailError.set('Please complete all email fields');
      return;
    }

    if (this.newEmail !== this.confirmNewEmail) {
      this.emailError.set('Email confirmation does not match');
      return;
    }

    this.emailSaving.set(true);
    this.settingsService
      .changeEmail({
        currentPassword: this.emailCurrentPassword,
        newEmail: this.newEmail,
      })
      .subscribe({
        next: async () => {
          await this.authService.reloadCurrentUser();
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

  private loadPreferences(): void {
    this.preferencesLoading.set(true);
    this.preferencesError.set(null);

    this.settingsService.getMyProfile().subscribe({
      next: (profile) => {
        this.displayName = profile.profile.displayName ?? '';
        this.preferredLocale = profile.profile.preferredLocale;

        this.settingsService.getMine().subscribe({
          next: (settings) => {
            this.forwardJumpSeconds = this.closestOption(settings.player.forwardJumpSeconds, this.jumpOptions);
            this.backwardJumpSeconds = this.closestOption(settings.player.backwardJumpSeconds, this.jumpOptions);
            this.playbackRate = settings.player.playbackRate;
            this.resumeRewindEnabled = settings.player.resumeRewind.enabled;
            this.rewindThresholdSeconds = this.closestThreshold(
              settings.player.resumeRewind.thresholdSinceLastListenSeconds,
            );
            this.rewindSeconds = this.closestOption(
              settings.player.resumeRewind.rewindSeconds,
              this.jumpOptions,
            );
            this.showCompleted = settings.library?.showCompleted ?? true;
            this.preferencesLoading.set(false);
          },
          error: (error: unknown) => {
            this.preferencesError.set(
              error instanceof Error ? error.message : 'Unable to load preferences',
            );
            this.preferencesLoading.set(false);
          },
        });
      },
      error: (error: unknown) => {
        this.preferencesError.set(error instanceof Error ? error.message : 'Unable to load profile');
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

    this.statsService.listSessions({ limit: 100, offset: 0 }).subscribe({
      next: (response) => {
        this.library.listBooks({ limit: 300, offset: 0 }).subscribe({
          next: (booksResponse) => {
            const byId = new Map(booksResponse.books.map((book) => [book.id, book]));
            this.rows.set(this.groupByBook(response.sessions, byId));
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

  scrollToSection(section: 'account' | 'security' | 'stats' | 'history'): void {
    const element = document.getElementById(section);
    if (!element) {
      return;
    }

    this.activeSection.set(section);
    element.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  hasActiveFilter(): boolean {
    return this.query.trim().length > 0;
  }

  private applyFilter(): void {
    const query = this.query.trim().toLowerCase();
    if (!query) {
      this.filteredRows.set(this.rows());
      return;
    }

    this.filteredRows.set(
      this.rows().filter((item) => {
        const title = item.book?.title ?? '';
        const author = item.book?.author ?? '';
        const haystack = `${title} ${author} ${item.bookId}`.toLowerCase();
        return haystack.includes(query);
      }),
    );
  }

  displayTitle(item: HistoryBookRow): string {
    return item.book?.title ?? `Book ${item.bookId.slice(0, 8)}`;
  }

  displayAuthor(item: HistoryBookRow): string {
    return item.book?.author ?? 'Unknown author';
  }

  formatDuration(totalSeconds: number): string {
    const value = Math.max(0, Math.floor(totalSeconds));
    const days = Math.floor(value / 86400);
    const hours = Math.floor((value % 86400) / 3600);
    const minutes = Math.floor((value % 3600) / 60);
    const seconds = value % 60;

    return `${String(days).padStart(2, '0')}d ${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`;
  }

  private groupByBook(sessions: ListeningSession[], booksById: Map<string, Book>): HistoryBookRow[] {
    const grouped = new Map<string, ListeningSession[]>();

    for (const session of sessions) {
      const bucket = grouped.get(session.bookId);
      if (bucket) {
        bucket.push(session);
      } else {
        grouped.set(session.bookId, [session]);
      }
    }

    const rows: HistoryBookRow[] = [];
    for (const [bookId, bookSessions] of grouped.entries()) {
      const totalListenedSeconds = bookSessions.reduce((sum, s) => sum + (s.listenedSeconds || 0), 0);
      const sessionsCount = bookSessions.length;
      const averageSessionSeconds = sessionsCount > 0 ? Math.floor(totalListenedSeconds / sessionsCount) : 0;
      const lastListenedAt = bookSessions
        .map((s) => s.endedAt)
        .filter((date): date is string => !!date)
        .sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null;

      rows.push({
        bookId,
        book: booksById.get(bookId) ?? null,
        sessions: sessionsCount,
        totalListenedSeconds,
        averageSessionSeconds,
        lastListenedAt,
      });
    }

    return rows.sort((a, b) => {
      const aTime = a.lastListenedAt ? Date.parse(a.lastListenedAt) : 0;
      const bTime = b.lastListenedAt ? Date.parse(b.lastListenedAt) : 0;
      return bTime - aTime;
    });
  }

  private closestOption(value: number, options: number[]): number {
    return options.reduce((best, current) => {
      return Math.abs(current - value) < Math.abs(best - value) ? current : best;
    }, options[0]);
  }

  private closestThreshold(value: number): number {
    const thresholds = this.thresholdOptions.map((option) => option.seconds);
    return this.closestOption(value, thresholds);
  }

  private setupSectionObserver(): void {
    const sectionIds = ['account', 'security', 'stats', 'history'] as const;
    const elements = sectionIds
      .map((id) => document.getElementById(id))
      .filter((element): element is HTMLElement => !!element);

    if (elements.length === 0) {
      return;
    }

    this.sectionObserver = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);

        if (visible.length === 0) {
          return;
        }

        const section = visible[0].target.id as 'account' | 'security' | 'stats' | 'history';
        this.activeSection.set(section);
      },
      {
        root: null,
        rootMargin: '-20% 0px -60% 0px',
        threshold: [0.15, 0.4, 0.7],
      },
    );

    for (const element of elements) {
      this.sectionObserver.observe(element);
    }
  }
}
