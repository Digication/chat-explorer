/**
 * Artifact file storage — writes uploaded buffers to
 * `data/artifacts/{institutionId}/{artifactId}/{filename}` on disk and
 * returns the relative path. Download routes resolve that relative path
 * back to an absolute path on the server.
 *
 * Keeping storage behind this small module means we can swap to S3/GCS
 * later without changing the upload or download route code.
 */

import { mkdir, writeFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

export const ARTIFACTS_ROOT = join(process.cwd(), "data", "artifacts");

/**
 * Write the uploaded buffer to disk and return a relative path suitable
 * for storing in the `artifact.storagePath` column.
 */
export async function saveArtifactFile(
  institutionId: string,
  artifactId: string,
  originalFilename: string,
  buffer: Buffer
): Promise<string> {
  const safeName = originalFilename.replace(/[^a-zA-Z0-9._-]/g, "_") || "file";
  const dir = join(ARTIFACTS_ROOT, institutionId, artifactId);
  await mkdir(dir, { recursive: true });
  const filePath = join(dir, safeName);
  await writeFile(filePath, buffer);
  // Return the path relative to the project root for portability.
  return `data/artifacts/${institutionId}/${artifactId}/${safeName}`;
}

/**
 * Resolve a stored relative path to an absolute on-disk path, rejecting
 * anything that escapes the artifacts root (defence-in-depth against
 * path-traversal via a malformed storagePath).
 */
export function resolveArtifactPath(storagePath: string): string {
  const absolute = resolve(process.cwd(), storagePath);
  const rootAbs = resolve(ARTIFACTS_ROOT);
  if (!absolute.startsWith(rootAbs + "/") && absolute !== rootAbs) {
    throw new Error("Refusing to resolve artifact path outside storage root");
  }
  return absolute;
}

/** Returns file size in bytes, or null if the file is missing. */
export async function safeFileSize(absolutePath: string): Promise<number | null> {
  try {
    const s = await stat(absolutePath);
    return s.size;
  } catch {
    return null;
  }
}
