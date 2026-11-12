/**
 * Sync between devices through your private GitHub repository (adapted from Study Desk's core/sync.ts).
 *
 * Streak's own encrypted file is `streak.enc`, next to Study Desk's `progress.enc` in the same repo, with the
 * same token and password. Each sync reads Streak's file, merges it item by item (core/kvSync.ts), writes it
 * back if anything changed, and then reads Study Desk's file (read-only) to auto-complete habits.
 *
 * Runs in the background: shortly after the app starts, ~20 s after a change, when you switch away from the
 * app or back to it, when the connection comes back, and every few minutes while it is open.
 */
import { useSyncExternalStore } from 'react';
import { storage } from './db';
import { dayOf } from './day';
import { ConflictError, createGitHub, parseRepo, type GitHubClient } from './github';
import { applyKv, kvSnapshot, mergeKv, type KvData } from './kvSync';
import { getState, onLocalChange, saveExternal } from './store';
import { STUDY_DESK_FILE, extractStudyDesk, foldExternal, type StudyDeskData } from './studyDesk';
import { decryptJson, deriveKey, encryptJson, randomSalt, saltOf, WrongPasswordError } from '../lib/crypto';
import { stableStringify } from '../lib/stable';

export const SYNC_FILE = 'streak.enc';
const DEBOUNCE_MS = 20_000;
const STALE_MS = 60_000;
const POLL_MS = 5 * 60_000;

export interface SyncData {
  app: 'streak-app';
  v: 1;
  kv: KvData;
  devices: Record<string, { name: string; at: number }>;
}

interface SyncConfig {
  owner: string;
  repo: string;
  token: string;
  /** Non-extractable AES keys derived from the sync password: one for Streak's file, one for Study Desk's. */
  key: CryptoKey;
  salt: Uint8Array;
  sdKey?: CryptoKey;
  sdSalt?: Uint8Array;
}

export interface SyncStatus {
  phase: 'off' | 'idle' | 'syncing' | 'error';
  repo?: string;
  lastSync?: number;
  error?: string;
  devices?: SyncData['devices'];
  deviceId?: string;
  /** Study Desk: when its data was last read, or why it couldn't be. */
  studyDesk?: { at?: number; error?: string };
}

// ---------------------------------------------------------------------------
// The sync itself (dependencies injected, so it can be tested without a browser)
// ---------------------------------------------------------------------------

export function mergeSync(local: SyncData, remote: SyncData | null, deviceId: string, deviceName: string, now: number): SyncData {
  return {
    app: 'streak-app',
    v: 1,
    kv: mergeKv(local.kv, remote?.kv, now),
    devices: { ...remote?.devices, ...local.devices, [deviceId]: { name: deviceName, at: now } },
  };
}

const sameContent = (a: SyncData, b: SyncData) => stableStringify({ ...a, devices: Object.keys(a.devices).sort() }) === stableStringify({ ...b, devices: Object.keys(b.devices).sort() });

export interface SyncDeps {
  github: GitHubClient;
  key: CryptoKey;
  salt: Uint8Array;
  deviceId: string;
  deviceName: string;
  readLocal: () => SyncData;
  applyMerged: (merged: SyncData) => Promise<void>;
  now?: () => number;
}

export async function runSync(d: SyncDeps): Promise<SyncData> {
  const now = d.now ?? Date.now;
  for (let attempt = 0; attempt < 4; attempt++) {
    const file = await d.github.getFile(SYNC_FILE);
    let remote: SyncData | null = null;
    if (file) {
      if (saltOf(file.bytes).join() !== d.salt.join()) throw new WrongPasswordError();
      remote = await decryptJson<SyncData>(file.bytes, d.key);
      if (remote.app !== 'streak-app') throw new Error('The sync file belongs to another app.');
    }
    const merged = mergeSync(d.readLocal(), remote, d.deviceId, d.deviceName, now());
    if (!remote || !sameContent(merged, remote)) {
      try {
        await d.github.putFile(SYNC_FILE, await encryptJson(merged, d.key, d.salt), file?.sha, `Streak sync from ${d.deviceName}`);
      } catch (e) {
        if (e instanceof ConflictError) continue; // another device was faster – merge with its version
        throw e;
      }
    }
    await d.applyMerged(merged);
    return merged;
  }
  throw new Error('Another device kept syncing at the same moment – it will be tried again later.');
}

/** Only a GET – Streak never writes Study Desk's file. */
export type ReadFile = (path: string) => Promise<{ sha: string; bytes: Uint8Array } | null>;

/**
 * Reads Study Desk's file if it changed since `lastSha`. Returns the extract, or null when nothing changed
 * or there is no file.
 */
export async function readStudyDesk(get: ReadFile, key: CryptoKey | undefined, lastSha: string | undefined, tz: string) {
  const file = await get(STUDY_DESK_FILE);
  if (!file) return { sha: undefined, extract: null };
  if (file.sha === lastSha) return { sha: file.sha, extract: null };
  if (!key) throw new Error('Study Desk’s file appeared after you connected – disconnect and connect again to read it.');
  const data = await decryptJson<StudyDeskData>(file.bytes, key).catch((e) => {
    throw e instanceof WrongPasswordError ? new Error('Study Desk’s file uses a different password now – connect again with that password.') : e;
  });
  if (data.app !== 'nihongo-app') throw new Error('progress.enc is not a Study Desk file.');
  return { sha: file.sha, extract: extractStudyDesk(data, tz) };
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

let status: SyncStatus = { phase: 'off' };
const statusListeners = new Set<() => void>();
function setStatus(patch: Partial<SyncStatus>) {
  status = { ...status, ...patch };
  statusListeners.forEach((l) => l());
}
export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(
    (l) => {
      statusListeners.add(l);
      return () => statusListeners.delete(l);
    },
    () => status,
    () => status,
  );
}

// ---------------------------------------------------------------------------
// Device identity
// ---------------------------------------------------------------------------

export function deviceNameOf(ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''): string {
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1)) return 'iPad';
  if (/Android/.test(ua)) return /Mobile/.test(ua) ? 'Android phone' : 'Android tablet';
  if (/Macintosh|Mac OS X/.test(ua)) return 'Mac';
  if (/Windows/.test(ua)) return 'Windows PC';
  if (/Linux/.test(ua)) return 'Linux PC';
  return 'Browser';
}

async function deviceId(): Promise<string> {
  let id = await storage.get<string>('deviceId');
  if (!id) {
    id = crypto.randomUUID();
    await storage.set('deviceId', id);
  }
  return id;
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

let config: SyncConfig | null = null;
let myId = '';
let running: Promise<void> | null = null;
let again = false;
let dirty = false;
let timer: ReturnType<typeof setTimeout> | undefined;
let started = false;

export const syncConfigured = () => !!config;

const exportLocal = (): SyncData => ({ app: 'streak-app', v: 1, kv: kvSnapshot(), devices: {} });

/** Reads Study Desk (if it changed) and folds the extract into Streak's data. */
async function refreshStudyDesk(c: SyncConfig) {
  const github = createGitHub(c.token, c);
  const tz = getState().settings.rules.tz;
  try {
    const last = await storage.get<string>('studyDeskSha');
    const { sha, extract } = await readStudyDesk((p) => github.getFile(p), c.sdKey, last, tz);
    if (extract) {
      const old = getState().external;
      const next = foldExternal(old, extract, dayOf(Date.now(), tz));
      if (stableStringify(next) !== stableStringify(old)) await saveExternal(next);
    }
    if (sha) await storage.set('studyDeskSha', sha);
    setStatus({ studyDesk: { at: Date.now() } });
  } catch (e) {
    setStatus({ studyDesk: { at: status.studyDesk?.at, error: (e as Error).message } });
  }
}

/** Sync now (or right after the sync that is already running). */
export function syncNow(): Promise<void> {
  if (!config) return Promise.resolve();
  if (running) {
    again = true;
    return running;
  }
  clearTimeout(timer);
  running = (async () => {
    do {
      again = false;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        setStatus({ phase: status.lastSync ? 'idle' : 'error', error: status.lastSync ? undefined : 'Offline – sync starts when you are online.' });
        return;
      }
      dirty = false;
      setStatus({ phase: 'syncing' });
      try {
        const c = config!;
        await refreshStudyDesk(c);
        const merged = await runSync({
          github: createGitHub(c.token, c),
          key: c.key,
          salt: c.salt,
          deviceId: myId,
          deviceName: deviceNameOf(),
          readLocal: exportLocal,
          applyMerged: (m) => applyKv(m.kv),
        });
        const meta = { lastSync: Date.now(), devices: merged.devices };
        await storage.set('syncMeta', meta);
        setStatus({ phase: 'idle', error: undefined, ...meta });
      } catch (e) {
        dirty = true;
        const msg = e instanceof WrongPasswordError ? 'The sync file was saved with a different sync password. Disconnect and connect again with the right one.' : (e as Error).message;
        setStatus({ phase: 'error', error: msg });
        timer = setTimeout(() => void syncNow(), 5 * 60_000);
        again = false;
      }
    } while (again);
  })().finally(() => {
    running = null;
    schedule(POLL_MS);
  });
  return running;
}

function schedule(ms = DEBOUNCE_MS) {
  clearTimeout(timer);
  timer = setTimeout(() => void (document.visibilityState === 'visible' || dirty ? syncNow() : schedule(POLL_MS)), ms);
}

/** Load the saved connection and start syncing in the background. Call once after initStore(). */
export async function startSync() {
  if (started) return;
  started = true;
  myId = await deviceId();
  config = (await storage.get<SyncConfig>('sync')) ?? null;
  const meta = await storage.get<{ lastSync: number; devices: SyncData['devices'] }>('syncMeta');
  setStatus(config ? { phase: 'idle', repo: `${config.owner}/${config.repo}`, deviceId: myId, ...meta } : { phase: 'off', deviceId: myId });

  onLocalChange(() => {
    if (!config) return;
    dirty = true;
    schedule();
  });
  document.addEventListener('visibilitychange', () => {
    if (!config) return;
    if (document.visibilityState === 'hidden' && dirty) void syncNow();
    if (document.visibilityState === 'visible' && Date.now() - (status.lastSync ?? 0) > STALE_MS) void syncNow();
  });
  window.addEventListener('online', () => {
    if (config && (dirty || Date.now() - (status.lastSync ?? 0) > STALE_MS)) void syncNow();
  });
  if (config) schedule(1500);
}

export class PasswordMismatchError extends Error {}

/**
 * Connect this device: the same repository, token and password as Study Desk. Checks the password against
 * the files that exist, then syncs once. Returns whether the repository is public.
 */
export async function connectSync(repoInput: string, token: string, password: string, startFresh = false): Promise<{ publicRepo: boolean; studyDesk: boolean }> {
  const ref = parseRepo(repoInput);
  if (!ref) throw new Error('Enter the repository as owner/name, e.g. anna/study-sync.');
  if (!token.trim()) throw new Error('Paste your GitHub token.');
  if (password.trim().length < 6) throw new Error('The sync password has at least 6 characters.');
  const github = createGitHub(token, ref);
  const info = await github.repoInfo();
  const [file, sdFile] = await Promise.all([github.getFile(SYNC_FILE), github.getFile(STUDY_DESK_FILE)]);

  let sdKey: CryptoKey | undefined;
  let sdSalt: Uint8Array | undefined;
  if (sdFile) {
    sdSalt = saltOf(sdFile.bytes);
    sdKey = await deriveKey(password, sdSalt);
    try {
      await decryptJson(sdFile.bytes, sdKey);
    } catch (e) {
      if (e instanceof WrongPasswordError) throw new PasswordMismatchError('This password doesn’t open Study Desk’s data – use the same sync password as in Study Desk.');
      throw e;
    }
  }
  // a new Streak file uses Study Desk's salt, so one derived key opens both
  const salt = file && !startFresh ? saltOf(file.bytes) : sdSalt ?? randomSalt();
  const key = sdKey && sdSalt && salt.join() === sdSalt.join() ? sdKey : await deriveKey(password, salt);
  if (!myId) myId = await deviceId();
  if (file && !startFresh) {
    try {
      await decryptJson(file.bytes, key);
    } catch (e) {
      if (e instanceof WrongPasswordError) throw new PasswordMismatchError('This password doesn’t match the one Streak uses on your other devices.');
      throw e;
    }
  }
  if (file && startFresh) {
    const fresh = mergeSync(exportLocal(), null, myId, deviceNameOf(), Date.now());
    await github.putFile(SYNC_FILE, await encryptJson(fresh, key, salt), file.sha, `New Streak sync password from ${deviceNameOf()}`);
  }
  config = { ...ref, token: token.trim(), key, salt, sdKey, sdSalt };
  await storage.set('sync', config);
  await storage.del('studyDeskSha');
  setStatus({ phase: 'idle', repo: info.fullName, error: undefined, deviceId: myId });
  await syncNow();
  if (status.phase === 'error') throw new Error(status.error);
  return { publicRepo: !info.private, studyDesk: !!sdFile };
}

/** Forget the connection on this device (the files on GitHub stay). */
export async function disconnectSync() {
  clearTimeout(timer);
  config = null;
  await storage.del('sync');
  await storage.del('syncMeta');
  await storage.del('studyDeskSha');
  setStatus({ phase: 'off', repo: undefined, lastSync: undefined, error: undefined, devices: undefined, studyDesk: undefined });
}
