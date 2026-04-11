# Client Workspaces

This folder contains native/desktop client implementations for the audiobook platform.

## Platforms

- Apple: `clients/apple` (Swift core + SwiftUI targets for iOS/macOS)
- Android: `clients/android` (Kotlin core + Jetpack Compose app)
- Windows: `clients/windows-electron` (Electron shell)

## Shared Rules

- API base: `/api/v1`
- Streaming base: `/streaming`
- Realtime: `/ws`
- Mobile architecture: MVVM
- Startup health gate: clients should verify `/api/v1/health` before normal feature flow
- Admin in v1: link-out to web admin console

Gateway defaults for native/desktop clients:

- Production default: `https://audiobook.aedev.pro`
- Local closed-circuit gateway: `http://localhost:8100` (Android emulator: `http://10.0.2.2:8100`)

See platform guides in `docs/platform/` for implementation details.
