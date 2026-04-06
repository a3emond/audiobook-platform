#!/bin/bash
#
# extract-cover.sh
# Extract cover art image from an audio file (M4B format)
#
# M4B files typically contain an embedded cover image.
# This script extracts the first video stream (cover art) and saves it as JPEG.
#
# Usage: ./extract-cover.sh <input_file> <output_file>
#
# Output: JPEG image file
#

set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo "Error: Missing arguments" >&2
  echo "Usage: $0 <input_file> <output_file>" >&2
  exit 1
fi

INPUT_FILE="$1"
OUTPUT_FILE="$2"

# Check if input file exists
if [[ ! -f "$INPUT_FILE" ]]; then
  echo "Error: Input file not found: $INPUT_FILE" >&2
  exit 1
fi

# Create output directory if needed
OUTPUT_DIR=$(dirname "$OUTPUT_FILE")
if [[ ! -d "$OUTPUT_DIR" ]]; then
  mkdir -p "$OUTPUT_DIR"
fi

# Extract cover image
# -an: No audio
# -vcodec png/copy: Copy video codec (or convert to PNG)
# Extracts the first image stream as-is or converts to requested format
#
# We try extracting as-is first (copy), then convert to JPG if needed

# Check if file has video stream (cover art)
if ! ffprobe -v quiet -select_streams v:0 -show_entries stream=codec_type "$INPUT_FILE" 2>/dev/null | grep -q "codec_type=video"; then
  echo "Error: No embedded image found in $INPUT_FILE" >&2
  exit 1
fi

# Extract cover image
# Strategy: extract to temporary PNG first, then convert to JPEG for better compatibility
TEMP_PNG="/tmp/cover_$$.png"

ffmpeg \
  -i "$INPUT_FILE" \
  -an \
  -vcodec copy \
  "$TEMP_PNG" \
  -y 2>/dev/null || {
    rm -f "$TEMP_PNG"
    echo "Error: Failed to extract cover image from $INPUT_FILE" >&2
    exit 1
  }

# If output wanted in JPEG, convert from PNG
if [[ "$OUTPUT_FILE" == *.jpg || "$OUTPUT_FILE" == *.jpeg ]]; then
  ffmpeg \
    -i "$TEMP_PNG" \
    -q:v 2 \
    "$OUTPUT_FILE" \
    -y 2>/dev/null || {
      rm -f "$TEMP_PNG"
      echo "Error: Failed to convert cover to JPEG: $OUTPUT_FILE" >&2
      exit 1
    }
  rm -f "$TEMP_PNG"
else
  # Keep as PNG or copy directly
  mv "$TEMP_PNG" "$OUTPUT_FILE"
fi

exit 0
