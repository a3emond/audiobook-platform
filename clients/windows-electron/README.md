# Windows Electron Workspace

Electron desktop shell for Windows delivery.

## Structure

- `src/main`: Electron main process
- `src/preload`: secure preload bridge
- `src/renderer`: renderer app entry

## Security Baseline

- `contextIsolation: true`
- `nodeIntegration: false`
- strict IPC contract
