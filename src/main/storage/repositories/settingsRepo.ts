/**
 * settings.json is one small object rather than a collection, so it gets its own atomic
 * read/write rather than a shard. Invalid contents fall back to defaults instead of blocking
 * boot — a broken preference is not worth a boot loop.
 */
import path from 'node:path';
import type { Settings } from '@shared/domain.js';
import { atomicWriteFile, readFileIfExists } from '../atomicWrite.js';
import { serialise } from '../serialise.js';
import { defaultSettings, settingsSchema } from '../schemas/settings.js';

export class SettingsRepo {
  private cached: Settings = defaultSettings();

  constructor(private readonly root: string) {}

  private get file(): string {
    return path.join(this.root, 'settings.json');
  }

  async load(): Promise<Settings> {
    const raw = await readFileIfExists(this.file);
    if (raw === null) {
      this.cached = defaultSettings();
      await this.persist();
      return this.cached;
    }
    const parsed = settingsSchema.safeParse(JSON.parse(raw) as unknown);
    this.cached = parsed.success ? parsed.data : defaultSettings();
    return this.cached;
  }

  get(): Settings {
    return this.cached;
  }

  async update(patch: Partial<Settings>): Promise<Settings> {
    this.cached = settingsSchema.parse({ ...this.cached, ...patch });
    await this.persist();
    return this.cached;
  }

  private async persist(): Promise<void> {
    await atomicWriteFile(this.file, serialise(this.cached));
  }
}
