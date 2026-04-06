import fs from "fs/promises";
import crypto from "crypto";

export async function computeFileSha256(filePath: string): Promise<string> {
  const hash = crypto.createHash("sha256");
  const fileHandle = await fs.open(filePath, "r");

  try {
    const stream = fileHandle.createReadStream({ highWaterMark: 64 * 1024 });

    for await (const chunk of stream) {
      hash.update(chunk);
    }

    return hash.digest("hex");
  } finally {
    await fileHandle.close();
  }
}

export function formatSha256(digest: string): string {
  return `sha256:${digest}`;
}

export function parseSha256(formatted: string): string | null {
  if (!formatted.startsWith("sha256:")) {
    return null;
  }

  return formatted.slice(6);
}
