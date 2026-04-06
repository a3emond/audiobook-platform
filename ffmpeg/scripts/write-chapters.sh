#!/bin/bash
#
# write-chapters.sh
# Write chapter information to an audio file
#
# This is a specialized script that focuses on writing chapter data.
# It takes a metadata file with chapter information and embeds it in the audio.
#
# Usage: ./write-chapters.sh <input_file> <metadata_file> <output_file>
#
# Parameters:
#   input_file:   Original audio file (M4B, MP3, etc.)
#   metadata_file: FFmetadata format file with [CHAPTER] sections
#   output_file:  Output file with embedded chapters
#
# The output is re-muxed (not re-encoded) so quality and duration are preserved.
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

# Validate that metadata file has chapter data
if ! grep -q "^\[CHAPTER\]" "$METADATA_FILE"; then
  echo "Warning: Metadata file has no chapter data, proceeding anyway" >&2
fi

# Create output directory if needed
OUTPUT_DIR=$(dirname "$OUTPUT_FILE")
if [[ ! -d "$OUTPUT_DIR" ]]; then
  mkdir -p "$OUTPUT_DIR"
fi

# Write chapters to output file
# -i input_file: Audio input
# -i metadata_file: Metadata input with chapters
# -map_chapters 1: Apply chapters from metadata input
# -map 0: Map all streams from audio input
# -c copy: Copy codecs without re-encoding
#
# This preserves audio quality while adding chapter markers

ffmpeg \
  -i "$INPUT_FILE" \
  -i "$METADATA_FILE" \
  -map_chapters 1 \
  -map 0 \
  -c copy \
  "$OUTPUT_FILE" \
  -y 2>/dev/null || {
    echo "Error: Failed to write chapters to $OUTPUT_FILE" >&2
    exit 1
  }

# Verify output file has chapters
if ! ffprobe -v quiet -show_chapters "$OUTPUT_FILE" 2>/dev/null | grep -q "^\[CHAPTER\]"; then
  echo "Warning: Output file may not have chapters embedded" >&2
fi

exit 0
