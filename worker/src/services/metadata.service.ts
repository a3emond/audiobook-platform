import fs from "fs/promises";

export interface Chapter {
  index: number;
  title: string;
  start: number; // milliseconds
  end: number; // milliseconds
}

export interface Metadata {
  title?: string;
  artist?: string;
  album?: string;
  genre?: string;
  chapters: Chapter[];
}

export class MetadataService {
  async parseFFmetadata(filePath: string): Promise<Metadata> {
    const content = await fs.readFile(filePath, "utf-8");
    return this.parseFFmetadataContent(content);
  }

  parseFFmetadataContent(content: string): Metadata {
    const lines = content.split("\n");
    const metadata: Metadata = {
      chapters: [],
    };

    let currentChapter: Partial<Chapter> | null = null;

    for (const line of lines) {
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith(";")) {
        continue;
      }

      if (trimmed === "[CHAPTER]") {
        if (currentChapter && currentChapter.title) {
          metadata.chapters.push({
            index: metadata.chapters.length,
            title: currentChapter.title,
            start: currentChapter.start ?? 0,
            end: currentChapter.end ?? 0,
          });
        }

        currentChapter = {};
        continue;
      }

      const [key, ...valueParts] = trimmed.split("=");
      const value = valueParts.join("=").trim();

      if (!key || !value) {
        continue;
      }

      if (currentChapter !== null) {
        if (key === "START") {
          currentChapter.start = Number(value);
        } else if (key === "END") {
          currentChapter.end = Number(value);
        } else if (key === "title") {
          currentChapter.title = value;
        }
      } else {
        if (key === "title") {
          metadata.title = value;
        } else if (key === "artist") {
          metadata.artist = value;
        } else if (key === "album") {
          metadata.album = value;
        } else if (key === "genre") {
          metadata.genre = value;
        }
      }
    }

    if (currentChapter && currentChapter.title) {
      metadata.chapters.push({
        index: metadata.chapters.length,
        title: currentChapter.title,
        start: currentChapter.start ?? 0,
        end: currentChapter.end ?? 0,
      });
    }

    return metadata;
  }

  generateFFmetadata(metadata: Metadata): string {
    const lines = [";FFMETADATA1"];

    if (metadata.title) {
      lines.push(`title=${metadata.title}`);
    }

    if (metadata.artist) {
      lines.push(`artist=${metadata.artist}`);
    }

    if (metadata.album) {
      lines.push(`album=${metadata.album}`);
    }

    if (metadata.genre) {
      lines.push(`genre=${metadata.genre}`);
    }

    for (const chapter of metadata.chapters) {
      lines.push("");
      lines.push("[CHAPTER]");
      lines.push("TIMEBASE=1/1000");
      lines.push(`START=${chapter.start}`);
      lines.push(`END=${chapter.end}`);
      lines.push(`title=${chapter.title}`);
    }

    return lines.join("\n");
  }

  async writeFFmetadata(filePath: string, metadata: Metadata): Promise<void> {
    const content = this.generateFFmetadata(metadata);
    await fs.writeFile(filePath, content, "utf-8");
  }
}
