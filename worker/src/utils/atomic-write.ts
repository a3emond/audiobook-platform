import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

export async function atomicWrite(
  targetPath: string,
  content: Buffer | string,
): Promise<void> {
  const dir = path.dirname(targetPath);
  const basename = path.basename(targetPath);
  const tmpName = `.${basename}.tmp-${crypto.randomBytes(4).toString("hex")}`;
  const tmpPath = path.join(dir, tmpName);

  try {
    await fs.writeFile(tmpPath, content);
    await fs.rename(tmpPath, targetPath);
  } catch (error) {
    try {
      await fs.unlink(tmpPath);
    } catch {
      /* ignore cleanup errors */
    }

    throw error;
  }
}

export async function atomicWriteFile(
  targetPath: string,
  sourcePath: string,
): Promise<void> {
  const dir = path.dirname(targetPath);
  const basename = path.basename(targetPath);
  const tmpName = `.${basename}.tmp-${crypto.randomBytes(4).toString("hex")}`;
  const tmpPath = path.join(dir, tmpName);

  try {
    await fs.copyFile(sourcePath, tmpPath);
    await fs.rename(tmpPath, targetPath);
  } catch (error) {
    try {
      await fs.unlink(tmpPath);
    } catch {
      /* ignore cleanup errors */
    }

    throw error;
  }
}
