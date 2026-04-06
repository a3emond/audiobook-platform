# Diagrams Folder Guide

This folder contains versioned diagram sources and optional rendered exports.

## Structure

- [uml](./uml): PlantUML or other UML source files (`.puml`)
- [mermaid](./mermaid): Mermaid source files (`.mmd`)
- [rendered](./rendered): Exported images (`.png`, `.svg`)

## Rules

- Keep source files as the primary artifact.
- Keep rendered images in sync with source when committed.
- Use naming: `<domain>-<subject>-<diagram-type>-v<major>.<ext>`

Examples:

- `jobs-lifecycle-state-v1.puml`
- `api-worker-sequence-v1.mmd`
- `api-worker-component-v1.svg`
