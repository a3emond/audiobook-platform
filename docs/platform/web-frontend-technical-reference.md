# Web Frontend Technical Reference

Purpose:

- Define the current Angular web application as the baseline implementation for all other client platforms.
- Document architecture, module responsibilities, technical contracts, and theming transfer rules.

Scope:

- Included: frontend architecture, routing, state model, API/realtime integration, playback behavior, i18n, design tokens, and admin-web redirection strategy.
- Excluded: backend endpoint internals (see API docs), worker internals, infrastructure provisioning details.

Related docs:

- [Frontend Client Integration Guideline](./frontend-client-integration-guideline.md)
- [Native Platform Implementation Guide](./native-platform-implementation-guide.md)
- [Architecture Build Specification](./architecture-build-specification.md)

## 1. Baseline Principle

This web client is the source baseline for minimum functional parity.

Meaning of parity for Android, iOS, macOS, Windows, and Linux:

- Same core user journeys (auth, library, playback, discussions, profile/settings).
- Same API contract and error behavior.
- Same localization behavior and language defaults.
- Same semantic design system (color roles, typography roles, spacing/radius/elevation roles).

## 2. Frontend Runtime and Build

Current stack:

- **Angular 21** standalone components in `frontend/src/app`
- **TypeScript 5** + **RxJS 7** + **Angular Signals API**
- **CSS** with global design tokens in `frontend/src/styles.css` and feature-scoped styles
- **Standalone** component approach (no module declarations)

Build/runtime model:

- Browser SPA behind reverse proxy
- Relative API and streaming routes expected: `/api/v1`, `/streaming`, `/ws`
- i18n assets in `/i18n/{locale}.json`
- Production build via Angular CLI

Key dependencies:

- `@angular/core` — Framework
- `@angular/router` — Client routing
- `@angular/forms` — Reactive forms
- `rxjs` — Reactive operators
- **No NgRx** — Uses native Signals for state management

## 3. Feature Architecture

The application uses **feature modules** organized under `frontend/src/app/features/`, each containing pages, components, and feature-specific services.

### Core Infrastructure (`app/core/`)

- **services/**: 21+ services managing API communication, state, realtime updates
- **guards/**: Route protection (auth, admin role)
- **models/**: API interface definitions (Book, User, Progress, etc.)
- **interceptors/**: HTTP request/response middleware (token injection, error handling, refresh)
- **pipes/**: Custom Angular pipes

### Feature Modules

| Module          | Pages                                                                                         | Responsibility                                               |
| --------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| **auth**        | LoginPage, RegisterPage, OAuthButtons                                                         | User authentication, login/register flows, OAuth integration |
| **library**     | LibraryPage, SeriesDetailPage, CollectionDetailPage                                           | Book browsing, search, series/collection viewing             |
| **player**      | PlayerPage, PlayerControls, ChapterList                                                       | Audio playback, chapter navigation, progress tracking        |
| **admin**       | AdminShell, AdminOverviewPage, AdminBooksPage, AdminUploadPage, AdminUsersPage, AdminJobsPage | Admin dashboard (book/user/job management)                   |
| **profile**     | ProfilePage                                                                                   | User profile, account settings, localization                 |
| **discussions** | DiscussionsPage, DiscussionsRedirectPage                                                      | Discussion channels, message threads                         |
| **stats**       | StatsPage                                                                                     | Reading statistics, listening history                        |
| **history**     | HistoryPage                                                                                   | Reading history, recently played                             |
| **legal**       | PrivacyPage, TermsPage                                                                        | Legal documents                                              |

### Shared Components (`app/shared/`)

- `CoverTile` — Book cover display component
- `ReadMore` — Text expansion component
- Common UI components used across features

### Code Organization Convention

Every feature follows this structure:

```
feature/
├── feature-page.component.ts   # Main page (orchestrates UI state + services)
├── feature.types.ts             # Local types, view models
├── feature.utils.ts             # Pure helper functions, formatters
├── feature.data.ts              # API data workflows (if needed)
├── feature.service.ts           # Optional feature-specific service
└── components/                  # Child components
    └── component/
        ├── component.component.ts
        ├── component.types.ts
        └── component.utils.ts
```

**Rules**:

- Page files orchestrate state and services
- Type files: local contracts and view models only
- Utils files: pure, deterministic functions
- Data files: data workflows and transformations
- Keep services focused on single responsibility
- Keep state local to pages when possible

## 4. Routing and Navigation Contract

**Root Routes**:

| Route                        | Component                 | Protected  | Type             |
| ---------------------------- | ------------------------- | ---------- | ---------------- |
| `/`                          | redirect → `/library`     | —          | Redirect         |
| `/login`                     | LoginPage                 | No         | Public           |
| `/register`                  | RegisterPage              | No         | Public           |
| `/privacy`                   | PrivacyPage               | No         | Public           |
| `/terms`                     | TermsPage                 | No         | Public           |
| `/library`                   | LibraryPage               | Yes        | Protected        |
| `/series/:seriesName`        | SeriesDetailPage          | Yes        | Protected        |
| `/collections/:collectionId` | CollectionDetailPage      | Yes        | Protected        |
| `/player/:bookId`            | PlayerPage                | Yes        | Protected        |
| `/profile`                   | ProfilePage               | Yes        | Protected        |
| `/discussions/:lang`         | DiscussionsPage           | Yes        | Protected        |
| `/history`                   | HistoryPage               | Yes        | Protected        |
| `/stats`                     | StatsPage                 | Yes        | Protected        |
| `/admin/**`                  | AdminShell + child routes | Admin only | Protected + Role |

**Admin Sub-Routes**:

- `/admin/overview` — Dashboard overview
- `/admin/books` — Book management list
- `/admin/books/:bookId` — Edit book metadata
- `/admin/upload` — Upload new books
- `/admin/users` — User management
- `/admin/jobs` — Job queue & logs

**Navigation Stability Rules** (required for cross-platform parity):

- Route names and structure must remain stable for deep-linking
- Query parameter contracts must be documented
- Locale switching should not break current route
- Admin routes must be guarded server-side (API role checks)

## 5. Data and State Management

**Architecture**: The app uses **Angular 21 Signals** (not NgRx) for reactive state management.

### State Slices

**Auth State** (AuthService):

```typescript
private readonly accessTokenState = signal<string | null>(null);
private readonly userState = signal<User | null>(null);
private readonly refreshTokenState = signal<string | null>(null);

readonly user = this.userState.asReadonly();
readonly isAuthenticated = computed(() => !!this.accessTokenState());
readonly isAdmin = computed(() => this.userState()?.role === 'admin');
```

**Library State** (LibraryService):

- Active book list with filters
- Series/collection metadata
- Search query state

**Playback State** (PlayerService):

- Current book and chapter
- Playback position (seconds)
- Play/pause status
- Media session metadata

**Discussions State** (DiscussionService):

- Active channel selection
- Message list and pagination
- Pending message state

**Settings State** (SettingsService):

- User preferences (locale, player settings)
- Library display preferences

**Realtime State** (RealtimeService):

- WebSocket connection status
- Last event timestamp

### Signal API Patterns

```typescript
// Signals for mutable state
const count = signal(0);
count.set(count() + 1);          // Update value
count.update(v => v + 1);        // Transform value

// Computed for derived state
const isEven = computed(() => count() % 2 === 0);

// Effects for side effects
effect(() => {
  console.log('count changed:', count());
});

// Read-only signals for public API
readonly user = this.userState.asReadonly();
```

### Key Services (21+ total)

**Authentication & State**:

- `AuthService` — User auth, tokens, login/logout/OAuth
- `ConfigService` — App configuration

**Library & Content**:

- `LibraryService` — Books, series, collections, search
- `LibraryProgressService` — Track reading progress
- `CompletedBooksService` — Completed books state

**Playback**:

- `PlayerService` — Audio playback control, chapter management
- `ProgressService` — Emits progress changes

**User Data**:

- `SettingsService` — User preferences
- `StatsService` — Reading statistics

**Admin**:

- `AdminService` — Book/user/job management operations
- `AdminUploadQueueService` — Manage book uploads

**Real-time**:

- `RealtimeService` — WebSocket connection and events
- `DiscussionService` — Discussion channels and messaging

**Infrastructure**:

- `ApiService` — HTTP wrapper with auth injection
- `I18nService` — Internationalization (EN/FR)

**Utilities**:

- Various `.utils` services for domain-specific logic

### State Rules

- **Separation of Concerns**: API response types ≠ UI view models
- **Local State**: Ephemeral UI state (dropdowns, modals) stays in component
- **Shared State**: Cross-feature state lives in services with Signals
- **Async Data**: Use RxJS `Observable` for HTTP and streams
- **Reactivity**: Use `effect()` for watchers, `computed()` for selectors

## 6. Route Guards and HTTP Interceptors

### Route Guards

**authGuard** — Protects routes requiring authentication

- Checks if user is logged in
- Redirects to `/login` if not authenticated
- Applied to all protected routes

**adminGuard** — Protects admin-only routes

- Checks if user has `admin` role
- Redirects to `/library` if not admin
- Applied to `/admin/**` routes

### HTTP Interceptors

**authInterceptor** — Adds bearer token to all requests

- Injects `Authorization: Bearer {accessToken}` header
- Skips auth/public endpoints

**authRefreshInterceptor** — Handles token expiration

- Intercepts `401` responses
- Calls `/api/v1/auth/refresh` with refresh token
- Retries original request with new access token
- Redirects to login if refresh fails

**errorInterceptor** — Centralizes error handling

- Catches all HTTP errors
- Displays user-friendly error messages
- Logs errors for debugging

### Guard Location

- [core/guards/auth.guard.ts](../../frontend/src/app/core/guards/auth.guard.ts)

---

## 7. API and Realtime Integration

HTTP base routes:

- `/api/v1`
- `/streaming`

Realtime endpoint:

- `/ws`

## 7. API and Realtime Integration

### HTTP Routes

**Base API**: `/api/v1`

- Auth, books, progress, users, settings, collections, series, discussions, stats

**Streaming**: `/streaming`

- Audio file streaming with HTTP Range support
- Resume info endpoint

**Health Check**: `/api/v1/health`

### Request Pattern

All authenticated requests include:

```
Authorization: Bearer <accessToken>
Content-Type: application/json
```

### Response Handling

**Success** (2xx):

```typescript
{
  // Standard API response shape
}
```

**Error** (4xx, 5xx):

```typescript
{
  "message": "error_code",
  "details"?: {}
}
```

Error Interceptor maps to user-facing messages (displays via toast/snackbar).

### WebSocket Realtime (`/ws`)

**Connection**:

- Established after user authenticates
- Carries bearer token in initial frame
- Reconnects with exponential backoff if dropped

**Event Structure**:

```typescript
{
  type: 'book.new' | 'job.completed' | 'discussion.message',
  data: {}
}
```

**Listeners**:

- New book published
- Background job completion
- Realtime discussion messages

---

## 8. Playback and Progress Technical Behavior

## 8. Playback and Progress Technical Behavior

### Playback Flow

**Starting Playback**:

1. Query resume state from `/api/v1/streaming/books/:bookId/resume`
2. Get audio stream path and starting position
3. Load audio element with `<audio src="/streaming/books/:bookId/audio">`
4. Seek to resume position
5. Play audio

**During Playback**:

- Listen to audio `timeupdate` events
- Emit progress via `ProgressService.progressChanged$` subject
- Update chapter display based on current time vs chapter boundaries
- Support pause, seek, chapter navigation

**Progress Saving**:

- Save progress debounced at `500ms` intervals
- Save on pause
- Save on book close
- Use `PUT /api/v1/progress/:bookId` with position
- Endpoint is idempotent (safe to retry)

### Chapter Navigation

Chapters come from Book metadata:

```typescript
chapters: [
  { index: 0, title: "Prologue", start: 0, end: 1800 },
  { index: 1, title: "Chapter 1", start: 1800, end: 3600 },
];
```

Navigator:

- Shows chapter list with durations
- Allows seeking to chapter start
- Displays current chapter while playing

### Media Session Integration

Updates browser/OS with playback metadata:

- Book title, author
- Chapter info
- Cover art
- Play/pause/next/previous controls

Location: [player-media-session.utils.ts](../../frontend/src/app/shared/utils/)

### Completion Tracking

Marked complete if:

- User explicitly marks as complete
- OR position exceeds 95% of duration

Completion state:

- `POST /api/v1/progress/:bookId/complete` — Mark as complete
- `DELETE /api/v1/progress/:bookId/complete` — Unmark as complete

### Cross-Platform Parity Target

- Chapter navigation behavior must match across all platforms
- Completion threshold (95%) is consistent
- Resume-rewind settings must be respected
- Sleep timer (if available) works the same way

---

## 9. Localization and Language Strategy

## 9. Localization and Language Strategy

### Supported Languages

- English (`en`) — Default
- French (`fr`)

### i18n Files

Located in `public/i18n/`:

- `en.json` — English translations
- `fr.json` — French translations

### Locale Behavior

**On App Load**:

1. Check browser `localStorage` for saved locale preference
2. If not saved, detect from browser language
3. Default to English if unsupported language
4. Load corresponding JSON file dynamically

**User Setting**:

- Accessible in Profile page
- Changes persisted to `localStorage`
- API sync: `PATCH /api/v1/users/me` with `profile.preferredLocale`

**Catalog Filtering**:

- Books filtered by language match locale
- Discussions scoped to locale-specific channels (e.g., `/api/v1/discussions/en/general`)

### Translation Pattern

```typescript
// In templates
{
  {
    "key" | translate;
  }
}

// In code
this.i18nService.localizedText("key");
```

---

## 10. Design System and Theming

The global token contract is defined in `frontend/src/styles.css`.

Token classes:

- Color roles:
  - `--color-bg`
  - `--color-surface`
  - `--color-surface-soft`
  - `--color-surface-strong`
  - `--color-surface-contrast`
  - `--color-border`
  - `--color-text`
  - `--color-text-muted`
  - `--color-primary`
  - `--color-primary-dark`
  - `--color-accent`
  - `--color-accent-hover`
  - `--color-danger`
  - `--color-success`
  - compatibility aliases: `--color-background`, `--color-on-primary`, `--color-focus-ring`
- Shape and depth:
  - `--radius-sm`, `--radius`, `--radius-lg`
  - `--shadow-sm`, `--shadow`, `--shadow-lg`
- Layout:
  - `--topbar-h`

Portability requirement:

- Native clients must map semantic roles, not raw hex values.
- Platform visuals can be adapted to native idioms, but token semantics must remain stable.

Recommended platform token mapping approach:

1. Define shared semantic token names in a platform-agnostic design specification.
2. Implement native aliases per platform (Android XML/Compose, iOS/macOS color assets, desktop theme resources).
3. Validate key states: default, hover/focus/pressed (where relevant), disabled, error/success.

## 11. Admin Functionality and Redirection

### Admin Web Implementation

Admin dashboard is **web-first** with full feature parity in Angular:

- Book management (upload, metadata, cover)
- User management (roles, sessions)
- Job queue monitoring
- Worker settings configuration

**Routes**:

- `/admin/overview` — Dashboard
- `/admin/books` — Book list and management
- `/admin/upload` — Bulk audiobook upload
- `/admin/users` — User administration
- `/admin/jobs` — Job queue monitoring

**Access Control**:

- Protected by `adminGuard` route guard
- Still validated server-side on API endpoints (`/api/v1/admin/*`)

### For Native/Non-Admin Clients

Recommended approach:

1. **Option A**: Link to external admin URL

   ```
   https://audiobook.aedev.pro/admin/overview/
   ```

   - Works for authenticated users
   - Keep session tokens secure (no query params)
   - Use in-app browser or system browser

2. **Option B**: Implement limited admin subset
   - Not required for minimum MVP
   - Can be added later
   - Must maintain same API contracts

---

## 12. Testing and Regression Expectations

The global design token contract is defined in [styles.css](../../frontend/src/styles.css).

### CSS Custom Properties

**Color Tokens**:

```css
--color-bg              /* Primary background */
--color-surface         /* Card/panel background */
--color-surface-soft    /* Subtle background */
--color-surface-strong  /* Highlighted background */
--color-surface-contrast /* High contrast surface */
--color-border          /* Border dividers */
--color-text            /* Primary text */
--color-text-muted      /* Secondary text */
--color-primary         /* Accent color for buttons */
--color-primary-dark    /* Darker accent variant */
--color-accent          /* Highlight color */
--color-accent-hover    /* Hover state */
--color-danger          /* Error/destructive color */
--color-success         /* Success/positive color */
```

**Shape & Depth**:

```css
--radius-sm             /* Small border radius */
--radius                /* Default border radius */
--radius-lg             /* Large border radius */
--shadow-sm             /* Small elevation shadow */
--shadow                /* Default shadow */
--shadow-lg             /* Large shadow */
```

**Layout**:

```css
--topbar-h              /* Top navigation bar height */
```

### Platform Token Mapping

For cross-platform implementations:

1. **Semantic tokens** define purpose, not colors
2. Each platform maps to native components:
   - Android: Material Design 3 colors, Compose conventions
   - iOS/macOS: SwiftUI appearance modifiers
   - Desktop: Native theme system
3. Validate all states: default, hover, focus, pressed, disabled, error

### Ensuring Accessibility

- Color contrast must meet WCAG AA minimum (4.5:1 for text)
- Interactive elements must be easily distinguishable
- Keyboard navigation must work throughout app

---

## 11. Admin Functionality and Redirection

## 12. Testing and Regression Expectations

### Core User Journeys

**Auth Flow**:

- [ ] Register with email/password (check token storage)
- [ ] Login with email/password (check token refresh)
- [ ] OAuth login (Google/Apple) if supported
- [ ] Logout (check token cleanup)
- [ ] Token refresh on 401 (automatic retry)

**Library**:

- [ ] Browse books (check pagination)
- [ ] Search/filter by title, author, genre
- [ ] Locale switch (preserve current page)
- [ ] View series/collection details
- [ ] Add/remove books from collections

**Playback**:

- [ ] Start playing book (check resume position)
- [ ] Pause and seek
- [ ] Chapter navigation (previous/next)
- [ ] Progress saves on pause and close
- [ ] Mark book complete/incomplete
- [ ] Media session metadata updates

**Discussions**:

- [ ] Load discussion channels
- [ ] Send message (check realtime update)
- [ ] Receive new messages via WebSocket
- [ ] Locale filter channels

**Admin** (if applicable):

- [ ] Role-gated access (non-admin redirected)
- [ ] Upload audiobook (check job creation)
- [ ] Edit book metadata
- [ ] Manage users (roles, sessions)
- [ ] Monitor job queue

**Theme & Accessibility**:

- [ ] Theme tokens apply correctly
- [ ] Color contrast adequate (WCAG AA)
- [ ] Keyboard navigation works
- [ ] Focus indicators visible
- [ ] Locale switching affects all text

### Build & Performance

- [ ] Production build succeeds
- [ ] No console errors or warnings
- [ ] Bundled size is reasonable
- [ ] Page load metrics acceptable
- [ ] Lazy-loaded feature modules work

---

## 13. Development Conventions

### TypeScript and Typing

- Use strict `tsconfig` settings
- Type all public APIs
- Avoid `any` type (use `unknown` if necessary and narrow)
- Use interfaces for object contracts, types for unions/tuples

### Component Structure

```typescript
import { Component, signal, computed, input } from '@angular/core';

@Component({
  selector: 'app-my-component',
  standalone: true,
  imports: [CommonModule],
  template: `...`
})
export class MyComponent {
  // Inputs
  readonly bookId = input.required<string>();

  // Internal state signals
  private readonly loadingState = signal(false);

  // Computed/derived state
  readonly isLoading = this.loadingState.asReadonly();

  constructor(private bookService: BookService) {}

  // Methods
  onLoad(): void { ... }
}
```

### Service Pattern

```typescript
@Injectable({ providedIn: "root" })
export class MyService {
  // Shared state signals
  private readonly dataState = signal<Data[]>([]);
  readonly data = this.dataState.asReadonly();

  // Observable streams
  readonly dataChanged$ = new Subject<Data[]>();

  constructor(private api: ApiService) {}

  // Public methods
  async loadData(): Promise<void> {
    const data = await this.api.get("/endpoint");
    this.dataState.set(data);
    this.dataChanged$.next(data);
  }
}
```

---

## 14. Change Log

**2026-04-11**:

- Added Angular 21 Signals architecture details
- Documented all 8 feature modules and 21+ core services
- Updated routing with complete route table
- Added guards and interceptor documentation
- Enhanced API/realtime integration details
- Expanded playback and progress behavior section
- Added development conventions and component/service patterns

**2026-04-10**:

- Added explicit baseline policy naming web as minimum functionality source
- Added token portability contract and semantic token inventory
- Added formal admin link-out strategy for non-web platforms

---

## Related Documentation

- [Frontend Client Integration Guideline](./frontend-client-integration-guideline.md)
- [Native Platform Implementation Guide](./native-platform-implementation-guide.md)
- [Architecture Build Specification](./architecture-build-specification.md)
- [API Endpoints Documentation](../api/)
