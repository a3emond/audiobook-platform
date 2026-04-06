# FFmpeg Integration — Complete Reference

## Quick Start

All FFmpeg scripts are production-ready and executable from the command line:

```bash
# Make scripts executable (already done)
chmod +x ffmpeg/scripts/*.sh

# Test a script
./ffmpeg/scripts/probe-duration.sh /path/to/audiobook.m4b
# Output: ffprobe JSON with duration and format

# Or use Docker
docker build -t audiobook-ffmpeg ffmpeg/
docker run --rm -v /data:/data audiobook-ffmpeg \
  /scripts/probe-duration.sh /data/audiobook.m4b
```

---

## Scripts Overview

| Script | Purpose | Input | Output | Status |
|--------|---------|-------|--------|--------|
| **probe-duration.sh** | Get file duration | Audio file | JSON (ffprobe) | ✅ |
| **extract-metadata.sh** | Read metadata/chapters | Audio file | FFmetadata text | ✅ |
| **extract-cover.sh** | Save cover image | Audio file | JPEG/PNG | ✅ |
| **write-metadata.sh** | Embed tags/chapters | Audio + metadata | Audio file | ✅ |
| **write-chapters.sh** | Embed chapters | Audio + metadata | Audio file | ✅ |

---

## Integration with Worker

The Worker service uses FFmpeg directly via `exec()` (does not call scripts). The scripts provide:

1. **Documentation** - Show exactly what FFmpeg operations do
2. **Testability** - Run standalone to debug or test
3. **Reference** - Shell script examples of FFmpeg commands
4. **Flexibility** - Easy to adapt for other use cases

### Current Flow (Worker → FFmpeg)

```
Worker (Node.js)
  ├─ FFmpegService.probeFile()
  │  └─ exec("ffprobe -print_format json ...")
  │
  ├─ FFmpegService.extractMetadata()
  │  └─ exec("ffmpeg -i input -f ffmetadata output")
  │
  ├─ FFmpegService.extractCover()
  │  └─ exec("ffmpeg -i input -an -vcodec copy output")
  │
  └─ FFmpegService.remuxWithMetadata()
     └─ exec("ffmpeg -i input -i metadata -map_metadata 1 ...")
```

Scripts show the equivalent commands in shell form.

---

## FFMetadata Format

The key data format used by all scripts:

```
;FFMETADATA1
title=Book Title
artist=Author Name
album=Series Name
[CHAPTER]
TIMEBASE=1/1000
START=0
END=120000
title=Chapter 1
[CHAPTER]
TIMEBASE=1/1000
START=120000
END=300000
title=Chapter 2
```

See `ffmpeg/templates/ffmetadata.template.txt` for complete example.

**Important**: TIMEBASE divisor is 1/1000 (milliseconds), so:
- 120000 = 120 seconds = 2 minutes
- 3600000 = 3600 seconds = 1 hour

---

## File Structure

```
ffmpeg/
├── Dockerfile                    # Alpine Linux + FFmpeg + scripts
├── README.md                     # Complete reference guide
├── scripts/
│   ├── probe-duration.sh        # Extract file info as JSON
│   ├── extract-metadata.sh      # Export FFMetadata format
│   ├── extract-cover.sh         # Save cover image
│   ├── write-metadata.sh        # Embed metadata + chapters
│   └── write-chapters.sh        # Embed chapters only
└── templates/
    └── ffmetadata.template.txt  # Example metadata structure
```

---

## Usage Examples

### Probe File Duration

```bash
./ffmpeg/scripts/probe-duration.sh /data/great-gatsby.m4b

# Output (ffprobe JSON):
# {
#   "format": {
#     "duration": "86400.5",
#     "format_name": "m4a",
#     ...
#   }
# }
```

### Extract Metadata

```bash
./ffmpeg/scripts/extract-metadata.sh \
  /data/great-gatsby.m4b \
  /tmp/metadata.txt

cat /tmp/metadata.txt
# ;FFMETADATA1
# title=The Great Gatsby
# artist=F. Scott Fitzgerald
# [CHAPTER]
# ...
```

### Extract Cover

```bash
./ffmpeg/scripts/extract-cover.sh \
  /data/great-gatsby.m4b \
  /data/audiobooks/123/cover.jpg

file /data/audiobooks/123/cover.jpg
# JPEG image data
```

### Embed Metadata

```bash
# 1. Export current metadata
./ffmpeg/scripts/extract-metadata.sh input.m4b /tmp/meta.txt

# 2. Edit metadata file
sed -i 's/title=.*/title=New Title/' /tmp/meta.txt

# 3. Create new file with updated metadata
./ffmpeg/scripts/write-metadata.sh \
  input.m4b \
  /tmp/meta.txt \
  output.m4b

# 4. Verify changes
ffprobe -v quiet -print_format json -show_format output.m4b | jq '.format.tags'
```

---

## Docker Build & Run

### Build Image

```bash
cd ffmpeg
docker build -t audiobook-ffmpeg:latest .

# Verify image
docker images | grep audiobook-ffmpeg
```

### Run Scripts in Container

```bash
# Probe via Docker
docker run --rm \
  -v /data/audiobooks:/data \
  audiobook-ffmpeg:latest \
  /scripts/probe-duration.sh /data/test.m4b

# Extract metadata
docker run --rm \
  -v /data/audiobooks:/data \
  -v /tmp:/tmp \
  audiobook-ffmpeg:latest \
  /scripts/extract-metadata.sh /data/test.m4b /tmp/metadata.txt

# Extract cover
docker run --rm \
  -v /data/audiobooks:/data \
  -v /tmp:/tmp \
  audiobook-ffmpeg:latest \
  /scripts/extract-cover.sh /data/test.m4b /tmp/cover.jpg
```

### Docker Compose Integration

If you want to include FFmpeg service for standalone use:

```yaml
services:
  ffmpeg:
    build: ./ffmpeg
    volumes:
      - audiobooks:/data
      - /tmp:/tmp
    entrypoint: /bin/bash
    # Run individual commands like:
    # docker-compose exec ffmpeg /scripts/probe-duration.sh /data/test.m4b
```

---

## Technical Details

### What Each Script Does

**probe-duration.sh**
- Calls `ffprobe` with JSON output
- Returns format name and duration
- ~100ms for typical audiobook
- Errors: file not found, ffprobe failure

**extract-metadata.sh**
- Calls `ffmpeg` with `-f ffmetadata` output
- Exports all metadata tags and chapters
- Creates output directory if needed
- ~500ms to 1 second for typical audiobook
- Errors: file not found, ffmpeg failure

**extract-cover.sh**
- Checks for video stream (cover image)
- Extracts first video stream to PNG/JPEG
- Converts PNG to JPEG if requested
- ~1-2 seconds for typical audiobook
- Errors: no cover found, extraction failure
- Note: Cleans up temporary PNG if converting to JPEG

**write-metadata.sh**
- Accepts audio file + metadata file
- Maps both metadata tags and chapters
- Uses `-c copy` (no re-encoding/quality loss)
- Re-muxes audio with new metadata
- ~5-30 seconds for typical audiobook (depends on file size)
- Errors: file not found, ffmpeg failure

**write-chapters.sh**
- Like write-metadata.sh but chapters only
- Preserves existing metadata from input
- Useful for chapter-only updates
- Same performance as write-metadata.sh
- Warns if metadata file has no chapters

---

## Performance Notes

All FFmpeg operations are **streaming** (not loading into memory):

| Operation | Time | Memory |
|-----------|------|--------|
| Probe | ~100ms | Low |
| Extract Metadata | ~500ms-1s | Low |
| Extract Cover | ~1-2s | Medium |
| Write Metadata | ~5-30s | Low |
| Write Chapters | ~5-30s | Low |

Time varies based on:
- File size (1GB vs 10GB audiobooks)
- Disk speed (HDD vs SSD)
- CPU (FFmpeg is mostly I/O bound)
- Concurrent operations (shared disk I/O)

---

## Debugging & Troubleshooting

### Script Not Executable

```bash
# Make executable
chmod +x ffmpeg/scripts/*.sh

# Verify
ls -la ffmpeg/scripts/
# Should show: -rwxr-xr-x for all .sh files
```

### FFmpeg Operations in Raw Shell

Debug script failures:

```bash
# Direct ffprobe call
ffprobe -v quiet -print_format json -show_format /data/test.m4b

# Direct ffmpeg metadata extraction
ffmpeg -i /data/test.m4b -f ffmetadata /tmp/meta.txt -y

# Direct cover extraction
ffmpeg -i /data/test.m4b -an -vcodec copy /tmp/cover.jpg -y

# Direct metadata write
ffmpeg -i input.m4b -i metadata.txt -map_metadata 1 -map_chapters 1 -map 0 -c copy output.m4b -y
```

### Check File Capabilities

```bash
# Check if file has metadata
ffprobe -v quiet -show_format /data/test.m4b | grep "^tag"

# Check if file has chapters
ffprobe -v quiet -show_chapters /data/test.m4b

# Check if file has cover image
ffprobe -v quiet -select_streams v:0 -show_entries stream=codec_type /data/test.m4b
# Should show: codec_type=video
```

### Common Issues

**"No embedded image found"**
- File truly doesn't have cover art
- Try another audiobook for testing

**"Failed to extract metadata"**
- File might be corrupted
- Try: `ffmpeg -i /data/test.m4b -f ffmetadata -`
- If ffmpeg hangs, file is probably corrupted

**Scripts timeout**
- Increase timeout: `timeout 600 ./script.sh ...` (10 min)
- Very large files might exceed 5 min default

**Cover extraction very slow**
- Might be decoding image unnecessarily
- Use `-vcodec copy` if possible (see script)

---

## Script Verification Checklist

- ✅ All scripts are executable (`-rwxr-xr-x`)
- ✅ Scripts use `set -euo pipefail` for safety
- ✅ Scripts create output directories as needed
- ✅ Exit codes: 0 (success), 1 (error)
- ✅ Error messages to stderr
- ✅ Temp files cleaned up on error
- ✅ Input file validation before processing
- ✅ Output format matches expected format
- ✅ Works with Alpine Linux (Docker and Linux systems)
- ✅ FFmetadata format validated against FFmpeg spec

---

## References

### Related Documentation
- [Worker Technical Documentation](../worker/technical-reference.md)
- [FFmpeg Documentation](https://ffmpeg.org/)
- [FFprobe Reference](https://ffmpeg.org/ffprobe.html)
- [FFMetadata Specification](https://www.ffmpeg.org/ffmpeg-protocols.html#metadata)

### Files
- Scripts: `ffmpeg/scripts/*.sh`
- Template: `ffmpeg/templates/ffmetadata.template.txt`
- Container: `ffmpeg/Dockerfile`
- Guide: `ffmpeg/README.md`

### Related Code
- Worker FFmpeg integration: `worker/src/services/ffmpeg.service.ts`
- Ingest job: `worker/src/jobs/ingest.job.ts`
- Metadata service: `worker/src/services/metadata.service.ts`

---

## Next Steps

### Enhance the FFmpeg Layer

1. **Add script to audio format conversion** (MP3 → M4B, etc.)
   - Audiobook standardization
   - Codec normalization

2. **Add script for bitrate/quality adjustment**
   - Reduce file size
   - Normalize audio levels

3. **Add error recovery scripts**
   - Repair corrupted metadata
   - Fix invalid chapter timestamps

### Integrate with CI/CD

1. **Add validation to build pipeline**
   - Dockerfile syntax check
   - Script linting (shellcheck)
   - Integration tests with real audiobooks

2. **Create test suite**
   - Unit tests for scripts
   - Integration tests with Worker

### Performance Optimization

1. **Parallel processing**
   - Process multiple files concurrently
   - Share FFmpeg resources

2. **Caching**
   - Cache probe results
   - Avoid re-extracting metadata

3. **Streaming processing**
   - Process chapters while reading file
   - Reduce I/O passes
