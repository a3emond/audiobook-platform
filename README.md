# Audiobook Platform

Backend and worker stack for audiobook ingestion, metadata processing, and asynchronous job execution.

## Documentation Index

Use this section as the single source of truth for project documentation. Any new document should be linked here.

- [Documentation Guide](docs/documentation-guide.md)

### Platform

- [Architecture Build Specification](docs/platform/architecture-build-specification.md)
- [API Worker Integration Guide](docs/platform/api-worker-integration.md)
- [API Functionality Coverage Audit](docs/platform/api-functionality-coverage.md)
- [Frontend Client Integration Guideline](docs/platform/frontend-client-integration-guideline.md)
- [Frontend Client Certification Checklist](docs/platform/frontend-client-certification-checklist.md)
- [Web Frontend Technical Reference](docs/platform/web-frontend-technical-reference.md)
- [Native Platform Implementation Guide](docs/platform/native-platform-implementation-guide.md)
- [Platform Migration Checklists](docs/platform/checklists/README.md)

### API

- [Auth API Endpoints (Client Guide)](docs/api/auth-endpoints.md)
- [Auth Implementation Reference](docs/api/auth-implementation-reference.md)
- [Admin API Endpoints](docs/api/admin-endpoints.md)
- [Books API Endpoints](docs/api/books-endpoints.md)
- [Collections API Endpoints](docs/api/collections-endpoints.md)
- [Progress API Endpoints](docs/api/progress-endpoints.md)
- [Series API Endpoints](docs/api/series-endpoints.md)
- [Settings API Endpoints](docs/api/settings-endpoints.md)
- [Stats API Endpoints](docs/api/stats-endpoints.md)
- [Users API Endpoints](docs/api/users-endpoints.md)
- [Streaming API Endpoints](docs/api/streaming-endpoints.md)
- [Jobs API Endpoints](docs/api/jobs-endpoints.md)
- [Discussions API Endpoints](docs/api/discussions-endpoints.md)
- [Realtime Websocket Events](docs/api/realtime-events.md)

### Worker

- [Worker Technical Reference](docs/worker/technical-reference.md)

### FFmpeg

- [FFmpeg Integration Reference](docs/ffmpeg/integration-reference.md)
- [FFmpeg Metadata and Chapters Guide](docs/ffmpeg/metadata-chapters-guide.md)

### Diagrams

- [Diagrams Folder Guide](docs/diagrams/README.md)

## Repo Structure

- api: Express and TypeScript API
- worker: background jobs and processing pipeline
- ffmpeg: shell helpers and FFmpeg container assets
- frontend: Angular frontend
- infra: nginx and infrastructure assets
- docs: project documentation

## Run Locally

1. Create env values in [.env.example](.env.example).
2. Start services with:

```bash
docker compose up --build
```

3. API health check:

```bash
curl http://localhost:8100/api/v1/health
```

## CI/CD

GitHub Actions workflow: [.github/workflows/deploy.yml](.github/workflows/deploy.yml)

- Pull requests to `master` run build checks for `api`, `worker`, and `frontend`.
- Pushes to `master` run the same checks first; deployment only runs if those checks pass.

Required GitHub secrets:

- `SSH_HOST`
- `SSH_PORT`
- `SSH_USER`
- `SSH_PRIVATE_KEY`
- `ENV_FILE` (full multi-line `.env` content written on the server)

## Documentation Maintenance Policy

- Keep all long-form technical docs under [docs](docs).
- Use lowercase kebab-case filenames.
- Keep feature-specific docs under grouped folders: [docs/platform](docs/platform), [docs/api](docs/api), [docs/worker](docs/worker), [docs/ffmpeg](docs/ffmpeg).
- Keep diagrams under [docs/diagrams](docs/diagrams) with source files in [docs/diagrams/uml](docs/diagrams/uml) or [docs/diagrams/mermaid](docs/diagrams/mermaid).
- If a document moves or is renamed, update links in this README in the same change.
- For new endpoints or workflows, update the related detailed doc and add or adjust its entry in this index.
