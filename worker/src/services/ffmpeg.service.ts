import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export interface ProbeInfo {
  duration: number; // seconds
  format: string;
}

export interface FFmpegExecutionResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

const DEFAULT_TIMEOUT_MS = 300000; // 5 minutes

function parseFFprobeJson(jsonStr: string): ProbeInfo {
  const data = JSON.parse(jsonStr);

  const rawDuration = data?.format?.duration;
  const duration =
    typeof rawDuration === "number"
      ? rawDuration
      : typeof rawDuration === "string"
        ? Number(rawDuration)
        : NaN;

  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error("invalid_ffprobe_output: missing duration");
  }

  return {
    duration,
    format: data.format.format_name || "unknown",
  };
}

export class FFmpegService {
  async probeFile(filePath: string): Promise<ProbeInfo> {
    const cmd = `ffprobe -v quiet -print_format json -show_format "${filePath}"`;

    try {
      const { stdout } = await execAsync(cmd, {
        timeout: DEFAULT_TIMEOUT_MS,
      });

      return parseFFprobeJson(stdout);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`ffprobe_failed: ${error.message}`);
      }

      throw error;
    }
  }

  async execute(
    args: string[],
    timeoutMs: number = DEFAULT_TIMEOUT_MS,
  ): Promise<FFmpegExecutionResult> {
    const cmd = `ffmpeg ${args.join(" ")}`;

    try {
      const { stdout, stderr } = await execAsync(cmd, {
        timeout: timeoutMs,
      });

      return {
        exitCode: 0,
        stdout,
        stderr,
      };
    } catch (error) {
      if (error instanceof Error) {
        return {
          exitCode: 1,
          stdout: "",
          stderr: error.message,
        };
      }

      throw error;
    }
  }

  async extractMetadata(inputPath: string, outputPath: string): Promise<void> {
    const result = await this.execute([
      "-i",
      `"${inputPath}"`,
      "-f",
      "ffmetadata",
      `"${outputPath}"`,
    ]);

    if (result.exitCode !== 0) {
      throw new Error(`extract_metadata_failed: ${result.stderr}`);
    }
  }

  async remuxWithMetadata(
    inputPath: string,
    metadataPath: string,
    outputPath: string,
  ): Promise<void> {
    const result = await this.execute([
      "-i",
      `"${inputPath}"`,
      "-i",
      `"${metadataPath}"`,
      "-map_metadata",
      "1",
      "-map_chapters",
      "1",
      "-c",
      "copy",
      `"${outputPath}"`,
    ]);

    if (result.exitCode !== 0) {
      throw new Error(`remux_failed: ${result.stderr}`);
    }
  }

  async extractCover(inputPath: string, outputPath: string): Promise<void> {
    const result = await this.execute([
      "-i",
      `"${inputPath}"`,
      "-an",
      "-vcodec",
      "copy",
      `"${outputPath}"`,
    ]);

    if (result.exitCode !== 0) {
      throw new Error(`extract_cover_failed: ${result.stderr}`);
    }
  }

  async remuxWithMetadataAndCover(
    inputPath: string,
    metadataPath: string,
    coverPath: string,
    outputPath: string,
  ): Promise<void> {
    const result = await this.execute([
      "-i",
      `"${inputPath}"`,
      "-i",
      `"${coverPath}"`,
      "-i",
      `"${metadataPath}"`,
      "-map",
      "0:a",
      "-map",
      "1:v",
      "-map_metadata",
      "2",
      "-map_chapters",
      "2",
      "-c:a",
      "copy",
      "-c:v",
      "mjpeg",
      "-disposition:v:0",
      "attached_pic",
      `"${outputPath}"`,
    ]);

    if (result.exitCode !== 0) {
      throw new Error(`remux_with_cover_failed: ${result.stderr}`);
    }
  }

  async buildM4bFromAudio(
    inputPath: string,
    metadataPath: string,
    outputPath: string,
    coverPath?: string | null,
  ): Promise<void> {
    const args = [
      "-i",
      `"${inputPath}"`,
    ];

    if (coverPath) {
      args.push("-i", `"${coverPath}"`);
    }

    args.push("-i", `"${metadataPath}"`);

    if (coverPath) {
      args.push(
        "-map",
        "0:a",
        "-map",
        "1:v",
        "-map_metadata",
        "2",
        "-map_chapters",
        "2",
      );
    } else {
      args.push(
        "-map",
        "0:a",
        "-map_metadata",
        "1",
        "-map_chapters",
        "1",
      );
    }

    args.push("-c:a", "aac", "-b:a", "96k");

    if (coverPath) {
      args.push("-c:v", "mjpeg", "-disposition:v:0", "attached_pic");
    }

    args.push("-movflags", "+faststart", `"${outputPath}"`);

    const result = await this.execute(args);
    if (result.exitCode !== 0) {
      throw new Error(`build_m4b_failed: ${result.stderr}`);
    }
  }
}
