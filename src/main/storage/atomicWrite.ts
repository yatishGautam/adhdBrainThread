/**
 * write tmp → fsync → rename. Rename is atomic on every OS we target, so a process killed
 * at any point leaves either the old file or the new one, never a truncated one (§4.6 #1).
 */
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

/**
 * Two writes to the same file inside one millisecond used to generate the same temp name: the
 * first rename moved it away and the second failed with ENOENT. A counter is enough — the pid
 * still separates processes, and this only has to be unique within one.
 */
let tmpCounter = 0;

export async function atomicWriteFile(file: string, contents: string): Promise<void> {
  const dir = path.dirname(file);
  await fs.mkdir(dir, { recursive: true });
  tmpCounter = (tmpCounter + 1) % Number.MAX_SAFE_INTEGER;
  const tmp = path.join(dir, `.${path.basename(file)}.tmp-${process.pid}-${Date.now()}-${tmpCounter}`);

  const handle = await fs.open(tmp, 'w');
  try {
    await handle.writeFile(contents, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }

  await fs.rename(tmp, file);
  await syncDirectory(dir);
}

/**
 * The rename itself is only durable once the directory entry is flushed. Not every platform
 * allows opening a directory, so a failure here is logged by the caller, never fatal.
 */
async function syncDirectory(dir: string): Promise<void> {
  let handle;
  try {
    handle = await fs.open(dir, 'r');
    await handle.sync();
  } catch {
    /* unsupported on this platform — the rename still landed */
  } finally {
    await handle?.close();
  }
}

export function checksum(contents: string): string {
  return createHash('sha256').update(contents, 'utf8').digest('hex');
}

export async function readFileIfExists(file: string): Promise<string | null> {
  try {
    return await fs.readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

export async function pathExists(file: string): Promise<boolean> {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}
