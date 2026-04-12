/**
 * Shared infrastructure/service code for audiobook import orchestration from uploaded files into persisted catalog records and queued jobs.
 * These files exist to keep media-processing, filesystem, and ingestion concerns
 * out of the HTTP layer so API modules can stay focused on request handling and
 * domain rules.
 */
