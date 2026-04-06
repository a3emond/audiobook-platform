import fs from "fs/promises";
import path from "path";

export class FileService {
  async exists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async createDirIfNeeded(dirPath: string): Promise<void> {
    try {
      await fs.mkdir(dirPath, { recursive: true });
    } catch (error) {
      if (error instanceof Error && error.message.includes("EEXIST")) {
        return;
      }

      throw error;
    }
  }

  async copyFile(sourcePath: string, targetPath: string): Promise<void> {
    await this.createDirIfNeeded(path.dirname(targetPath));
    await fs.copyFile(sourcePath, targetPath);
  }

  async moveFile(sourcePath: string, targetPath: string): Promise<void> {
    await this.createDirIfNeeded(path.dirname(targetPath));
    await fs.rename(sourcePath, targetPath);
  }

  async deleteFile(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
    } catch (error) {
      if (error instanceof Error && error.message.includes("ENOENT")) {
        return; // file already gone
      }

      throw error;
    }
  }

  async deleteDir(dirPath: string): Promise<void> {
    try {
      await fs.rm(dirPath, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }

  async getFileSize(filePath: string): Promise<number> {
    const stat = await fs.stat(filePath);
    return stat.size;
  }
}
