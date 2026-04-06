# Documentation Guide

This guide defines how project documentation is written, organized, and maintained.

## Goals

- Keep docs easy to find.
- Separate client-facing API docs from implementation internals.
- Keep architecture and integration knowledge current.
- Keep diagrams versioned and source-controlled.

## Documentation Layout

Use this folder structure:

```text
docs/
├── documentation-guide.md
├── platform/
│   ├── architecture-build-specification.md
│   └── api-worker-integration.md
├── api/
│   ├── auth-endpoints.md
│   ├── auth-implementation-reference.md
│   └── jobs-endpoints.md
├── worker/
│   └── technical-reference.md
├── ffmpeg/
│   ├── integration-reference.md
│   └── metadata-chapters-guide.md
└── diagrams/
    ├── uml/
    ├── mermaid/
    └── rendered/
```

## Naming Rules

- Use lowercase kebab-case file names.
- Use names that describe scope and audience.
- Prefer `*-endpoints.md` for client API consumption docs.
- Prefer `*-implementation-reference.md` for internal design/behavior docs.
- Prefer `*-integration.md` or `*-reference.md` for cross-module/system docs.

## Audience Split

For API modules, prefer two docs:

1. Client doc
- Focus on request/response, examples, errors, and integration flows.
- No internal implementation details.

2. Implementation doc
- Focus on runtime model, security behavior, persistence, and internal decision rules.
- Can reference source files and internals.

## Required Sections (Per Doc)

Every new doc should include:

1. Purpose
- What this document covers and who should read it.

2. Scope
- What is included and excluded.

3. Main content
- Endpoints, architecture, operational procedures, or implementation details.

4. Related docs
- Links to neighboring docs to avoid duplication.

5. Change notes
- Optional short section for major updates if the doc is frequently evolving.

## Linking Rules

- Always link from the main index in [README.md](../README.md).
- When moving or renaming a file, update links in the same change.
- Prefer relative links from within docs.
- Do not duplicate the same canonical content in two places.

## UML and Diagram Organization

Diagrams must keep source files under version control.

### Folder Standard

- UML source: [docs/diagrams/uml](./diagrams/uml)
- Mermaid source: [docs/diagrams/mermaid](./diagrams/mermaid)
- Exported images (png/svg): [docs/diagrams/rendered](./diagrams/rendered)

### File Naming

Use this naming pattern:

```text
<domain>-<subject>-<diagram-type>-v<major>.<ext>
```

Examples:

- `auth-login-sequence-v1.puml`
- `jobs-state-machine-v1.puml`
- `worker-ingest-flow-v1.mmd`
- `api-worker-component-v1.svg`

### UML Types Recommended

- Sequence diagrams: request flows and async interactions.
- Component diagrams: service/module boundaries.
- Class diagrams: domain models and relationships.
- State diagrams: job lifecycle and retry transitions.
- Deployment diagrams: runtime topology (api, worker, db, nginx).

### Diagram Source of Truth

- Source files (`.puml`, `.mmd`) are authoritative.
- Rendered outputs (`.png`, `.svg`) are optional artifacts for previews.
- If both exist, update source and rendered files together.

### Diagram Header Convention

At the top of each diagram source file, include:

- title
- owner/team
- linked doc(s)
- last updated date

Example header for PlantUML:

```text
' title: Jobs Lifecycle State Diagram
' owner: platform
' docs: docs/platform/api-worker-integration.md
' updated: 2026-04-06
```

## Review Checklist

Before merging documentation changes:

- File is in the right folder.
- Name follows kebab-case and matches audience.
- README index includes or still points to the correct doc.
- Internal links resolve.
- No duplicated canonical content.
- Diagram sources are committed if diagrams changed.
- Rendered diagram output is updated when needed.

## Maintenance Workflow

When a feature changes:

1. Update the feature implementation.
2. Update its module-level doc.
3. Update integration/platform docs if cross-module behavior changed.
4. Update related diagrams.
5. Verify [README.md](../README.md) index links are still correct.

## Ownership Suggestion

- Platform docs: backend lead or architecture owner.
- API docs: API module owner.
- Worker docs: worker module owner.
- FFmpeg docs: media-processing owner.
- Diagram quality gate: reviewer checks source + rendered consistency.
