#!/bin/bash
#
# probe-duration.sh
# Extract duration and format information from audio file using ffprobe
#
# Usage: ./probe-duration.sh <input_file>
#
# Output: JSON with duration (seconds) and format name
# Example: {"duration": 86400, "format": "m4a"}
#

set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Error: Missing input file argument" >&2
  echo "Usage: $0 <input_file>" >&2
  exit 1
fi

INPUT_FILE="$1"

# Check if file exists
if [[ ! -f "$INPUT_FILE" ]]; then
  echo "{\"error\": \"file_not_found\", \"file\": \"$INPUT_FILE\"}" >&2
  exit 1
fi

# Use ffprobe to extract format and duration information
# -v quiet: Suppress verbose output
# -print_format json: Output as JSON
# -show_format: Show format information (including duration)
ffprobe \
  -v quiet \
  -print_format json \
  -show_format \
  "$INPUT_FILE" 2>/dev/null || {
    echo "{\"error\": \"ffprobe_failed\"}" >&2
    exit 1
  }
