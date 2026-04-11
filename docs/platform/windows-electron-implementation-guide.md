# Windows Electron Implementation Guide

Purpose:

- Define how to deliver the Windows desktop app using Electron.
- Keep behavior aligned with API/mobile while embracing desktop UX.

Related docs:

- [Native Platform Implementation Guide](./native-platform-implementation-guide.md)
- [Frontend Client Integration Guideline](./frontend-client-integration-guideline.md)
- [Frontend Client Certification Checklist](./frontend-client-certification-checklist.md)

## 1. Scope

Windows app must include:

- Auth/session lifecycle
- Library/series/collections
- Player/progress
- Discussions/realtime
- Profile/settings

Admin in v1:

- Link out to web admin console.

## 2. Electron App Structure

Recommended layers:

1. Main process:

- window lifecycle
- native menus
- protocol handlers
- secure credential bridge

2. Preload bridge:

- constrained IPC API

3. Renderer app:

- UI + feature state
- API/realtime clients

Security requirements:

- contextIsolation=true
- nodeIntegration=false
- strict IPC contract
- explicit navigation allowlist

## 3. API and Session

Routes:

- /api/v1
- /streaming
- /ws

Session rules:

- one refresh retry
- force sign-out on refresh failure
- redact tokens from logs

## 4. Desktop UX Requirements

Layout:

- left navigation + content pane
- resizable two-column behavior
- keyboard shortcuts for player controls

Playback:

- media key support
- tray/taskbar integration optional for v1

## 5. Storage

- Store refresh/session secrets in OS credential vault via native module.
- Keep non-sensitive cached data in app data directory with size cap.

## 6. Build and Release

- Signed installers required for production.
- Auto-update strategy must support rollback.
- Crash logs must redact PII and credentials.

## 7. Technical Links

- ./frontend-client-integration-guideline.md
- ./frontend-client-certification-checklist.md
- ../api/streaming-endpoints.md
- ../api/realtime-events.md
