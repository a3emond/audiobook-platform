#!/bin/bash
#
# extract-metadata.sh
# Extract FFmetadata format from an audio file
#
# FFmetadata format is a text-based format that contains:
# - Metadata tags (title, artist, album, etc.)
# - Chapter information with timestamps
#
# Usage: ./extract-metadata.sh <input_file> <output_file>
#
# Output: FFmetadata format file (text)
# Example:
# ;FFMETADATA1
# title=The Great Gatsby
# artist=F. Scott Fitzgerald
# album=Classic Literature
# [CHAPTER]
# TIMEBASE=1/1000
# START=0
# END=3600000
# title=Chapter 1
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

# Extract metadata using ffmpeg with ffmetadata format
# -i: input file
# -f ffmetadata: output format (FFmetadata)
# This extracts all metadata tags and chapter information
ffmpeg \
  -i "$INPUT_FILE" \
  -f ffmetadata \
  "$OUTPUT_FILE" \
  -y 2>/dev/null || {
    echo "Error: Failed to extract metadata from $INPUT_FILE" >&2
    exit 1
  }

exit 0
