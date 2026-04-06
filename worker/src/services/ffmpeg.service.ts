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

  if (!data.format || typeof data.format.duration !== "number") {
    throw new Error("invalid_ffprobe_output: missing duration");
  }

  return {
    duration: data.format.duration,
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
}
