/**
 * Shared infrastructure/service code for filesystem reads/writes/moves used by ingest, streaming, and worker jobs.
 * These files exist to keep media-processing, filesystem, and ingestion concerns
 * out of the HTTP layer so API modules can stay focused on request handling and
 * domain rules.
 */
