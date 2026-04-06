#!/bin/bash
#
# write-metadata.sh
# Write metadata tags to an audio file
#
# This script updates metadata in the audio file without re-encoding.
# It uses FFmpeg's metadata handling to add/update tags like title, artist, album.
#
# Usage: ./write-metadata.sh <input_file> <metadata_file> <output_file>
#
# Parameters:
#   input_file:   Original audio file (M4B, MP3, etc.)
#   metadata_file: FFmetadata format file with tags and chapters
#   output_file:  Output file with embedded metadata
#
# The output is re-muxed (not re-encoded) so quality is preserved.
#

set -euo pipefail

if [[ $# -ne 3 ]]; then
  echo "Error: Missing arguments" >&2
  echo "Usage: $0 <input_file> <metadata_file> <output_file>" >&2
  exit 1
fi

INPUT_FILE="$1"
METADATA_FILE="$2"
OUTPUT_FILE="$3"

# Check if input files exist
if [[ ! -f "$INPUT_FILE" ]]; then
  echo "Error: Input file not found: $INPUT_FILE" >&2
  exit 1
fi

if [[ ! -f "$METADATA_FILE" ]]; then
  echo "Error: Metadata file not found: $METADATA_FILE" >&2
  exit 1
fi

# Create output directory if needed
OUTPUT_DIR=$(dirname "$OUTPUT_FILE")
if [[ ! -d "$OUTPUT_DIR" ]]; then
  mkdir -p "$OUTPUT_DIR"
fi

# Write metadata and chapters to output file
# -i input_file: Audio input
# -i metadata_file: Metadata input (FFmetadata format)
# -map_metadata 1: Apply metadata from second input
# -map_chapters 1: Apply chapters from second input
# -map 0: Map all streams from first input (audio)
# -c copy: Copy codecs (no re-encoding)
# 
# This creates a new file with the same audio but updated metadata

ffmpeg \
  -i "$INPUT_FILE" \
  -i "$METADATA_FILE" \
  -map_metadata 1 \
  -map_chapters 1 \
  -map 0 \
  -c copy \
  "$OUTPUT_FILE" \
  -y 2>/dev/null || {
    echo "Error: Failed to write metadata to $OUTPUT_FILE" >&2
    exit 1
  }

exit 0
