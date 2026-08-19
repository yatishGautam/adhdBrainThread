/**
 * The Anthropic API key, and the only place it is ever held.
 *
 * Same two rules as `AuthService`, for the same reasons:
 *
 *  1. **Encrypted with the OS keychain, never written in plain text.** `safeStorage` is Keychain
 *     on macOS, DPAPI on Windows, the desktop keyring on Linux. Where encryption is unavailable
 *     the key is kept in memory for this run only rather than written in the clear — a key on
 *     disk in plain text is worse than being asked to paste it again tomorrow.
 *
 *  2. **It never leaves the main process.** The renderer can ask *whether* a key is configured
 *     and where it came from; it can never read one back. `contextIsolation` makes that a real
 *     boundary rather than a convention, and there is no IPC channel that returns the value.
 *
 * Three sources, in order. A key pasted into the app wins because it is the one the user last
 * chose deliberately; the env var and `.env` exist so `npm run dev` works without a UI step, and
 * because that is where a developer expects to put one.
 */
import { safeStorage } from 'electron';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { atomicWriteFile, readFileIfExists } from '../storage/atomicWrite.js';

export type KeySource = 'stored' | 'env' | 'dotenv' | null;

/** What the renderer is allowed to know. Never the key itself. */
export interface KeyState {
  configured: boolean;
  source: KeySource;
  /** `sk-ant-…4f2a` — enough to tell two keys apart, not enough to use one. */
  hint: string | null;
  /** False on a box with no keyring: a pasted key works this run but will not be remembered. */
  canPersist: boolean;
}

interface StoredKey {
  version: 1;
  /** base64 of the keychain-encrypted key. */
  key: string;
}

export class ApiKeyStore {
  private stored: string | null = null;
  private fromEnv: string | null = null;
  private envSource: Exclude<KeySource, 'stored' | null> = 'env';
  /** Set when the keyring is unavailable: usable now, gone on quit. */
  private memoryOnly = false;

  constructor(private readonly root: string) {}

  private get file(): string {
    return path.join(this.root, 'apikey.json');
  }

  async load(projectRoot?: string): Promise<void> {
    await this.loadStored();
    await this.loadEnv(projectRoot);
  }

  private async loadStored(): Promise<void> {
    const raw = await readFileIfExists(this.file);
    if (raw === null) return;
    try {
      const parsed = JSON.parse(raw) as StoredKey;
      if (!parsed.key) return;
      if (!safeStorage.isEncryptionAvailable()) return;
      this.stored = safeStorage.decryptString(Buffer.from(parsed.key, 'base64')).trim() || null;
    } catch {
      // A key we cannot decrypt is a key from another machine or another keychain. Falling back
      // to "not configured" prompts for a new one, which is recoverable; throwing here would
      // take the whole planner down over a file the user can simply replace.
      this.stored = null;
    }
  }

  /**
   * `process.env` first, then a `.env` beside the source tree.
   *
   * Electron does not read `.env` on its own and this app has no dotenv dependency, so the file
   * is parsed here — twelve lines, only in development, and only for keys this app knows about.
   * A packaged build has no project root to look in and skips it entirely.
   */
  private async loadEnv(projectRoot?: string): Promise<void> {
    const fromProcess = process.env.ANTHROPIC_API_KEY?.trim();
    if (fromProcess) {
      this.fromEnv = fromProcess;
      this.envSource = 'env';
      return;
    }
    if (!projectRoot) return;

    try {
      const text = await fs.readFile(path.join(projectRoot, '.env'), 'utf8');
      const value = parseDotenv(text).ANTHROPIC_API_KEY;
      if (value) {
        this.fromEnv = value;
        this.envSource = 'dotenv';
      }
    } catch {
      // No .env is the normal case, not a problem.
    }
  }

  /** The key to call with, or null. Main process only — this is never sent over IPC. */
  current(): string | null {
    return this.stored ?? this.fromEnv;
  }

  state(): KeyState {
    const key = this.current();
    return {
      configured: key !== null,
      source: key === null ? null : this.stored ? 'stored' : this.envSource,
      hint: key === null ? null : hintOf(key),
      canPersist: safeStorage.isEncryptionAvailable(),
    };
  }

  /**
   * Store a pasted key. Validated for shape only — whether it actually works is something only
   * the API can answer, and it answers on the first generation with a clear message.
   */
  async set(key: string): Promise<KeyState> {
    const trimmed = key.trim();
    if (!trimmed) throw new Error('That key is empty.');
    if (!trimmed.startsWith('sk-ant-')) {
      throw new Error('An Anthropic API key starts with "sk-ant-". Check you copied all of it.');
    }

    this.stored = trimmed;
    if (!safeStorage.isEncryptionAvailable()) {
      // Held for this run rather than written in plain text. Said out loud in the UI, not hidden.
      this.memoryOnly = true;
      return this.state();
    }

    this.memoryOnly = false;
    const encrypted = safeStorage.encryptString(trimmed).toString('base64');
    await atomicWriteFile(this.file, JSON.stringify({ version: 1, key: encrypted }, null, 2));
    return this.state();
  }

  /** Forget the pasted key. An env-provided one survives — this app did not put it there. */
  async clear(): Promise<KeyState> {
    this.stored = null;
    this.memoryOnly = false;
    await fs.rm(this.file, { force: true });
    return this.state();
  }

  get isMemoryOnly(): boolean {
    return this.memoryOnly;
  }
}

/** `sk-ant-…9f2a`. Enough to recognise, useless to steal. */
function hintOf(key: string): string {
  return key.length <= 12 ? 'sk-ant-…' : `sk-ant-…${key.slice(-4)}`;
}

/**
 * A minimal `KEY=value` parser: comments, blank lines, `export ` prefixes and surrounding
 * quotes. Not a general dotenv implementation and does not want to be — it reads one key.
 */
export function parseDotenv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(trimmed);
    if (!match) continue;
    const key = match[1] as string;
    let value = (match[2] ?? '').trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length > 1) ||
      (value.startsWith("'") && value.endsWith("'") && value.length > 1)
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}
