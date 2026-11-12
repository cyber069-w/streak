/**
 * JSON backup: everything that syncs (habits, ticks, Study Desk extract, typing results, rewards, purchases,
 * settings – including your ApeKey, so keep the file private). Importing merges item by item like a sync;
 * it never wipes what is on this device.
 */
import { applyKv, kvSnapshot, mergeKv, type KvData } from './kvSync';

export interface Backup { app: 'streak-app'; v: 1; exportedAt: string; kv: KvData }

export const makeBackup = (now = new Date()): Backup => ({ app: 'streak-app', v: 1, exportedAt: now.toISOString(), kv: kvSnapshot() });

export function parseBackup(text: string): Backup {
  let b: Partial<Backup>;
  try {
    b = JSON.parse(text) as Partial<Backup>;
  } catch {
    throw new Error('This file isn’t valid JSON.');
  }
  if (b.app !== 'streak-app' || !b.kv || typeof b.kv !== 'object') throw new Error('This isn’t a Streak backup.');
  return b as Backup;
}

/** Merge a backup into this device's data (newest version of each item wins). */
export async function importBackup(b: Backup) {
  await applyKv(mergeKv(kvSnapshot(), b.kv, Date.now()));
}
