# M4B Metadata & Chapters — FFmpeg Guide

## Overview

- `.m4b` = MP4 container (audio + metadata + chapters)
- Safe approach = **remux (no re-encode)** using `ffmpeg`
- Never edit binary atoms directly

------

## Core Principle

```
input.m4b → extract → modify → remux → output.m4b
```

- Use `-c copy` to avoid re-encoding
- Metadata + chapters are rewritten cleanly

------

## 1. Extract Existing Metadata

```bash
ffmpeg -i input.m4b -f ffmetadata metadata.txt
```

------

## 2. Metadata File Format

```txt
;FFMETADATA1

title=My Book
artist=Author Name
album=Series Name
genre=Audiobook

[CHAPTER]
TIMEBASE=1/1000
START=0
END=60000
title=Chapter 1

[CHAPTER]
TIMEBASE=1/1000
START=60000
END=120000
title=Chapter 2
```

### Notes

- `TIMEBASE=1/1000` → values in milliseconds
- `START` / `END` must be increasing

------

## 3. Apply Metadata + Chapters

```bash
ffmpeg -i input.m4b -i metadata.txt \
  -map_metadata 1 \
  -map_chapters 1 \
  -c copy \
  output.m4b
```

------

## 4. Modify Metadata Only

```bash
ffmpeg -i input.m4b \
  -metadata title="New Title" \
  -metadata artist="Author" \
  -metadata album="Series" \
  -metadata genre="Audiobook" \
  -c copy \
  output.m4b
```

------

## 5. Add / Replace Cover Art

```bash
ffmpeg -i input.m4b -i cover.jpg \
  -map 0 -map 1 \
  -c copy \
  -disposition:v:0 attached_pic \
  output.m4b
```

------

## 6. Generate Chapters Programmatically

### Input (example JSON)

```json
[
  { "title": "Intro", "start": 0 },
  { "title": "Chapter 1", "start": 65 },
  { "title": "Chapter 2", "start": 130 }
]
```

### Convert → ffmetadata

- `start` in seconds → convert to ms
- `end = next.start`

------

## 7. C# Wrapper (Process Execution)

```csharp
public static async Task RewriteM4bAsync(
    string input,
    string metadataFile,
    string output)
{
    var args = $"""
        -i "{input}"
        -i "{metadataFile}"
        -map_metadata 1
        -map_chapters 1
        -c copy
        "{output}"
    """;

    var psi = new ProcessStartInfo
    {
        FileName = "ffmpeg",
        Arguments = args,
        RedirectStandardOutput = true,
        RedirectStandardError = true
    };

    using var process = Process.Start(psi);
    await process.WaitForExitAsync();

    if (process.ExitCode != 0)
        throw new Exception("ffmpeg failed");
}
```

------

## 8. Batch Processing Pattern

```
for each file:
  extract metadata
  modify (or regenerate)
  remux → output
```

------

## 9. Docker Setup

### Dockerfile

```dockerfile
FROM alpine
RUN apk add --no-cache ffmpeg
WORKDIR /app
COPY . .
```

------

## 10. Key Constraints

- Always use `-c copy`
- Chapter times must be valid and ordered
- Cover must be JPEG or PNG
- Some players rely on correct genre = Audiobook

------

## 11. Minimal Workflow Summary

```
ffmpeg -i input.m4b -f ffmetadata metadata.txt
(edit metadata.txt)
ffmpeg -i input.m4b -i metadata.txt -map_metadata 1 -map_chapters 1 -c copy output.m4b
```

------

## End