import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export interface MP3Metadata {
  title?: string;
  artist?: string;
  album?: string;
  genre?: string;
  narrator?: string;
  asin?: string;
  productId?: string;
  copyright?: string;
  chapters: Array<{
    title: string;
    startMs: number;
    endMs: number;
  }>;
}

interface FFProbeFormat {
  duration?: number | string;
  tags?: Record<string, unknown>;
}

interface FFProbeChapter {
  start_time?: string;
  end_time?: string;
  tags?: Record<string, unknown>;
}

interface FFProbeData {
  format?: FFProbeFormat;
  chapters?: FFProbeChapter[];
}

/**
 * Extracts metadata from MP3 files using FFprobe
 * Handles standard ID3 tags, CUESHEET data, and embedded chapters
 */
export class MP3MetadataService {
  async extractMetadata(filePath: string): Promise<MP3Metadata> {
    const ffprobeOutput = await this.runFFprobe(filePath);
    const data = JSON.parse(ffprobeOutput) as FFProbeData;

    const metadata: MP3Metadata = {
      chapters: [],
    };

    // Extract standard tags from format
    if (data.format?.tags) {
      const tags = data.format.tags as Record<string, unknown>;

      metadata.title = this.getString(tags.title || tags.TITLE);
      metadata.artist = this.getString(tags.artist || tags.ARTIST);
      metadata.album = this.getString(tags.album || tags.ALBUM);
      metadata.genre = this.getString(tags.genre || tags.GENRE);
      metadata.narrator = this.getString(tags.narratedBy);
      metadata.asin = this.getString(tags.asin);
      metadata.productId = this.getString(tags.product_id);
      metadata.copyright = this.getString(tags.copyright);
    }

    // Try to extract chapters from multiple sources
    const chapters = await this.extractChapters(filePath, data);
    metadata.chapters = chapters;

    return metadata;
  }

  /**
   * Extract chapters from:
   * 1. Embedded FFprobe chapters (M4A/M4B format)
   * 2. CUESHEET metadata (MP3 with cue data)
   * 3. Individual MP3 files (fallback: single chapter)
   */
  private async extractChapters(
    filePath: string,
    ffprobeData: FFProbeData,
  ): Promise<MP3Metadata["chapters"]> {
    // Check for embedded chapters in ffprobe output
    if (ffprobeData.chapters && ffprobeData.chapters.length > 0) {
      return this.parseEmbeddedChapters(ffprobeData.chapters);
    }

    // Check for CUESHEET metadata
    if (ffprobeData.format?.tags) {
      const tags = ffprobeData.format.tags as Record<string, unknown>;
      const cuesheet = this.getString(tags.CUESHEET);
      if (cuesheet) {
        const duration = this.parseDuration(ffprobeData.format.duration);
        return this.parseCuesheet(cuesheet, duration);
      }
    }

    // Fallback: single chapter for entire file
    const duration = this.parseDuration(ffprobeData.format?.duration);
    return [
      {
        title: "Full Book",
        startMs: 0,
        endMs: Math.round(duration * 1000),
      },
    ];
  }

  /**
   * Parse embedded chapter info from FFprobe JSON
   * Format: each chapter has start_time, end_time, and tags.title
   */
  private parseEmbeddedChapters(
    chapters: FFProbeChapter[],
  ): MP3Metadata["chapters"] {
    return chapters
      .map((ch, idx) => {
        const startMs = Math.round(parseFloat(ch.start_time ?? "0") * 1000);
        const endMs = Math.round(parseFloat(ch.end_time ?? "0") * 1000);
        const title =
          this.getString((ch.tags as Record<string, unknown>)?.title) ||
          `Chapter ${idx + 1}`;

        return { title, startMs, endMs };
      })
      .filter((ch) => ch.endMs > ch.startMs);
  }

  /**
   * Parse CUESHEET format (found in MP3 ID3 tags)
   * Format:
   *   TRACK 1 AUDIO
   *     TITLE "Chapter Name"
   *     INDEX 01 MM:SS:FF
   *   TRACK 2 AUDIO
   *     TITLE "Next Chapter"
   *     INDEX 01 MM:SS:FF
   *
   * MM:SS:FF = minutes:seconds:frames (75 frames per second in CD audio)
   */
  private parseCuesheet(cuesheet: string, totalDurationMs: number): MP3Metadata["chapters"] {
    const chapters: MP3Metadata["chapters"] = [];
    const lines = cuesheet.split("\n");

    let currentTitle = "";
    let currentIndexStr = "";

    for (const line of lines) {
      const trimmed = line.trim();

      // Match TITLE "Chapter Name"
      if (trimmed.startsWith('TITLE "')) {
        const titleMatch = trimmed.match(/TITLE "([^"]+)"/);
        if (titleMatch) {
          currentTitle = titleMatch[1];
        }
        continue;
      }

      // Match INDEX 01 MM:SS:FF
      if (trimmed.startsWith("INDEX 01 ")) {
        const indexMatch = trimmed.match(/INDEX 01 (\d+):(\d+):(\d+)/);
        if (indexMatch) {
          const minutes = parseInt(indexMatch[1], 10);
          const seconds = parseInt(indexMatch[2], 10);
          const frames = parseInt(indexMatch[3], 10); // 75 frames/sec in CD audio

          const ms = (minutes * 60 + seconds) * 1000 + (frames / 75) * 1000;

          if (currentIndexStr === "") {
            currentIndexStr = String(ms);
          } else {
            // We have a start time, push the previous chapter
            if (currentTitle) {
              chapters.push({
                title: currentTitle,
                startMs: Math.round(parseFloat(currentIndexStr)),
                endMs: Math.round(ms),
              });
            }
            currentIndexStr = String(ms);
            currentTitle = "";
          }
        }
        continue;
      }
    }

    // Push last chapter with calculated end time
    if (currentIndexStr && currentTitle) {
      chapters.push({
        title: currentTitle,
        startMs: Math.round(parseFloat(currentIndexStr)),
        endMs: totalDurationMs,
      });
    }

    return chapters.length > 0
      ? chapters
      : [
          {
            title: "Full Book",
            startMs: 0,
            endMs: totalDurationMs,
          },
        ];
  }

  /**
   * Run ffprobe with JSON output, returning chapters and format info
   */
  private async runFFprobe(filePath: string): Promise<string> {
    const cmd =
      `ffprobe -v quiet -print_format json ` +
      `-show_format -show_chapters "${filePath}"`;

    try {
      const { stdout } = await execAsync(cmd, {
        timeout: 60000, // 1 minute timeout
      });
      return stdout;
    } catch (error) {
      throw new Error(
        `ffprobe_failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private getString(value: unknown): string | undefined {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    return undefined;
  }

  private parseDuration(value: unknown): number {
    const num =
      typeof value === "number"
        ? value
        : typeof value === "string"
          ? parseFloat(value)
          : 0;

    return Math.max(0, num);
  }
}
