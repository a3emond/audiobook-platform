/**
 * Shared infrastructure/service code for wrappers around ffmpeg/ffprobe so media inspection and transforms stay out of controllers.
 * These files exist to keep media-processing, filesystem, and ingestion concerns
 * out of the HTTP layer so API modules can stay focused on request handling and
 * domain rules.
 */
