# Frontend Client Certification Checklist

Use this checklist to certify a client implementation for release readiness across web, mobile, and desktop platforms.

Related reference:
- docs/platform/frontend-client-integration-guideline.md

## Release Metadata

- Client name:
- Platform:
- Version:
- Build number:
- Release date:
- Owner:
- QA lead:

## 1. API and Contract Compliance

- [ ] API base paths are correct: /api/v1, /streaming, /ws.
- [ ] All protected HTTP requests send Authorization: Bearer <accessToken>.
- [ ] Error handling supports 401, 403, 404, 429, and 5xx with expected UX behavior.
- [ ] No endpoint path hardcoded to an environment-specific hostname in production build.
- [ ] Response parsing tolerates additive fields without failures.

## 2. Authentication and Session Security

- [ ] Login flow works: email and password.
- [ ] Registration flow works.
- [ ] OAuth flow works for configured providers (Google or Apple).
- [ ] Token refresh flow is implemented and retries only once per failed protected request.
- [ ] Refresh failure forces clean logout and session reset.
- [ ] Logout revokes session server-side and clears local auth state.
- [ ] Tokens are stored in platform-appropriate secure storage.
- [ ] No secrets, tokens, or idToken values are logged.

## 3. Localization and Language Behavior

- [ ] Locale files load successfully from /i18n/en.json and /i18n/fr.json.
- [ ] Default locale selection works at first launch.
- [ ] Locale preference persists locally across app restarts.
- [ ] Locale preference syncs to user profile or settings when authenticated.
- [ ] No untranslated keys are rendered in UI.
- [ ] No hardcoded user-facing strings remain outside localization catalogs.
- [ ] Locale switching refreshes language-aware library and series content.

## 4. Core Experience Parity

- [ ] Library listing works with search and filters.
- [ ] Series listing and series detail views work.
- [ ] Collections list and collection detail workflows work.
- [ ] Discussions channel views and message sending work.
- [ ] Playback resume endpoint is used before playback start.
- [ ] Audio streaming endpoint supports range playback correctly.
- [ ] Progress save and completion status behavior is correct.
- [ ] Role-based navigation behavior is correct for user and admin roles.

## 5. Realtime Behavior

- [ ] Client connects to /ws using ws or wss based on environment.
- [ ] WebSocket reconnect behavior is implemented.
- [ ] system.connected event is handled.
- [ ] catalog.book.added event is handled.
- [ ] discussion.message.created event is handled where applicable.
- [ ] Event handling avoids duplicate visual updates.
- [ ] Connection loss produces user-appropriate fallback behavior.

## 6. UX and Design Consistency

- [ ] Navigation structure matches product contract.
- [ ] Locale toggle is discoverable and functional.
- [ ] Loading, empty, and error states are present for networked screens.
- [ ] Destructive actions require explicit confirmation.
- [ ] Typography, spacing, color, and radius follow shared design tokens.
- [ ] Accessibility contrast meets WCAG AA.
- [ ] Keyboard and screen reader behavior is acceptable for platform norms.

## 7. Performance and Reliability

- [ ] App launch or first interactive experience meets target performance.
- [ ] Library first render meets target performance for warm API path.
- [ ] No memory leak observed in long session test.
- [ ] Cover and list caching strategy is implemented.
- [ ] Request timeouts are defined.
- [ ] Retry policy applies only to idempotent reads.

## 8. Logging, Diagnostics, and Privacy

- [ ] Request logging captures method, path, status, and duration without secrets.
- [ ] Auth refresh attempts are logged without exposing tokens.
- [ ] WebSocket connect, disconnect, and error lifecycle is observable.
- [ ] Locale load and switch diagnostics are observable.
- [ ] PII and credential data are redacted in client diagnostics.

## 9. Test Coverage Gate

- [ ] Auth tests pass.
- [ ] Refresh and forced logout tests pass.
- [ ] Locale switch and dictionary coverage tests pass.
- [ ] Realtime event handling tests pass.
- [ ] Playback resume and progress tests pass.
- [ ] Regression smoke tests pass on supported form factors.

## 10. Platform-Specific Signoff

### Web

- [ ] Reverse-proxy deployment works for /api/v1, /streaming, /ws, and /i18n.
- [ ] Browser compatibility matrix validated.

### Android

- [ ] Secure storage and media session behaviors validated.
- [ ] Background and interruption audio handling validated.

### iOS and macOS

- [ ] Keychain storage validated.
- [ ] Audio interruption and lock-screen controls validated.

### Windows

- [ ] Secure credentials storage validated.
- [ ] Media key integration validated.

### Linux

- [ ] Secret Service storage validated.
- [ ] Distribution packaging and runtime dependencies validated.

## 11. Final Approval

- [ ] Security review approved.
- [ ] QA signoff approved.
- [ ] Product signoff approved.
- [ ] Observability dashboards and logs verified for release.
- [ ] Rollback plan documented.

Decision:
- [ ] Approved for release
- [ ] Blocked

Blocking issues:
- 
- 

Approver names and timestamps:
- 
