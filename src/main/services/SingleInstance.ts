/**
 * Two instances writing the same data directory would interleave shard writes and corrupt
 * them (§4.6 #6). Electron's lock is the real gate; the `.lock` file exists so a human staring
 * at the data directory can see which process claimed it.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { app } from 'electron';

export function claimSingleInstance(onSecondInstance: () => void): boolean {
  const acquired = app.requestSingleInstanceLock();
  if (!acquired) return false;
  app.on('second-instance', onSecondInstance);
  return true;
}

export async function writeLockFile(root: string): Promise<void> {
  await fs.mkdir(root, { recursive: true });
  await fs.writeFile(
    path.join(root, '.lock'),
    `${JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }, null, 2)}\n`,
    'utf8',
  );
}

export async function clearLockFile(root: string): Promise<void> {
  await fs.rm(path.join(root, '.lock'), { force: true });
}
