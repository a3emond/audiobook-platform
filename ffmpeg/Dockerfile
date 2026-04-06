# FFmpeg Processing Container
# 
# This image provides FFmpeg and FFprobe for audio processing.
# Used for audiobook metadata extraction, cover art handling, and remuxing.
#
# Build: docker build -t audiobook-ffmpeg:latest .
# Run:   docker run --rm -v /data:/data audiobook-ffmpeg:latest /scripts/probe-duration.sh /data/audiobook.m4b

FROM alpine:3.18

# Install FFmpeg and required dependencies
RUN apk add --no-cache \
    ffmpeg \
    ffprobe \
    bash \
    && rm -rf /var/cache/apk/*

# Create scripts directory
RUN mkdir -p /scripts /data /tmp

# Copy helper scripts
COPY scripts/probe-duration.sh /scripts/
COPY scripts/extract-metadata.sh /scripts/
COPY scripts/extract-cover.sh /scripts/
COPY scripts/write-metadata.sh /scripts/
COPY scripts/write-chapters.sh /scripts/

# Make scripts executable
RUN chmod +x /scripts/*.sh

# Copy templates
COPY templates/ /templates/

# Set working directory
WORKDIR /data

# Export scripts and templates as volumes for easy access
VOLUME ["/data", "/templates", "/scripts"]

# Default command: show help
CMD ["echo", "FFmpeg processing container. Mount volumes and run scripts from /scripts/"]
