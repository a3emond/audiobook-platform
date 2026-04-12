# Capsule 04 - Library and Language Module

## 1. Module Scope

- Book, series, and collection browsing.
- Language scoped content experience and translations.
- Discussion channels segmented by language context.

## 2. Capability Set

- Localized labels and runtime language switching.
- Language aware book and discussion retrieval.
- Series level completion from per book progress.
- Cross view continuity with history and stats data.

## 3. Architecture Flow Diagram

```mermaid
flowchart LR
    UI[Library Views] --> I18N[I18n Service]
    UI --> BS[Books Service]
    UI --> DS[Discussions Service]
    BS --> APIB[Books API]
    DS --> APID[Discussions API]
    APIB --> DB[(MongoDB)]
    APID --> DB
```

## 4. Sequence Diagram

```mermaid
sequenceDiagram
    participant U as User
    participant UI as Library UI
    participant I18N as I18n Service
    participant API as API

    U->>UI: Change language to FR
    UI->>I18N: set active locale
    UI->>API: fetch books with lang FR
    API-->>UI: localized list and metadata
    UI->>API: fetch discussion thread FR
    API-->>UI: language scoped messages
```

## 5. Class Diagram

```mermaid
classDiagram
    class I18nService {
      setLocale()
      translate()
    }
    class BooksService {
      listBooks()
      getSeries()
    }
    class DiscussionsService {
      listThreads()
      postMessage()
    }
    class SeriesProgressService {
      aggregateCompletion()
    }

    BooksService --> SeriesProgressService
    DiscussionsService --> I18nService
```

## 6. Evidence Files

- `frontend/src/app/core/services/i18n.service.ts`
- `api/src/modules/books`
- `api/src/modules/series`
- `api/src/modules/discussions`
- `api/src/modules/stats`

## 7. Code Proof Snippets

```ts
// frontend/src/app/core/services/i18n.service.ts
setLocale(locale: 'en' | 'fr') {
  this.currentLocale.set(locale);
}
```

```ts
// api/src/modules/discussions/discussions.routes.ts
router.get('/:channelId/messages', requireAuth, discussionsController.listMessages);
```

## 8. GoF Patterns Demonstrated

- Adapter
  - What it does: normalizes translation payloads from different sources (static dictionaries, backend metadata) into one frontend i18n shape.

```ts
// frontend/src/app/core/services/i18n.service.ts
function adaptDictionary(input: unknown): Record<string, string> {
  const source = (input ?? {}) as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(source).map(([key, value]) => [key, String(value ?? '')])
  );
}
```

```mermaid
flowchart LR
    S1[Static JSON] --> AD[Locale Adapter]
    S2[API Labels] --> AD
    AD --> I18N[I18n Service]
    I18N --> UI[Library UI]
```

- Facade
  - What it does: provides one library oriented API surface for UI screens so components avoid orchestrating books, series, and discussions manually.

```ts
// frontend/src/app/features/library/library.facade.ts
async function loadLibraryHome(locale: 'en' | 'fr') {
  const [books, series, threads] = await Promise.all([
    booksService.listBooks(locale),
    booksService.getSeries(locale),
    discussionsService.listThreads(locale),
  ]);
  return { books, series, threads };
}
```

```mermaid
flowchart LR
    VC[Library View Component] --> LF[Library Facade]
    LF --> BS[Books Service]
    LF --> SS[Series Service]
    LF --> DS[Discussions Service]
```

- Observer
  - What it does: broadcasts locale changes so all listening views refresh labels and data in sync.

```ts
// frontend/src/app/core/services/i18n.service.ts
readonly locale$ = this.localeState.asObservable();

setLocale(next: 'en' | 'fr') {
  this.localeState.next(next);
}
```

```mermaid
flowchart LR
    I18N[I18n Service Subject] --> HB[Header]
    I18N --> LV[Library View]
    I18N --> DV[Discussion View]
```

<!-- screenshot: localized library page -->
<!-- screenshot: discussion channel segmented by language -->
