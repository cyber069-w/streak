/**
 * Pulls Monkeytype results and stores them (they sync to other devices). While the app is open it asks the
 * cheap "last result" call every few minutes; the full list (30 a day per ApeKey) is loaded only after new
 * tests showed up, or by the Refresh button. See monkeytype.ts.
 */
import { useSyncExternalStore } from 'react';
import { storage } from './db';
import { DAILY_BUDGET, LIGHT_EVERY_MS, MonkeytypeError, afterLight, fetchLast, fetchResults, mayFetch, mergeResults, sinceOf, spend, type Budget } from './monkeytype';
import { getState, initStore, saveTyping } from './store';

export interface TypingStatus { busy: boolean; at?: number; error?: string; left: number; added?: number }

let status: TypingStatus = { busy: false, left: DAILY_BUDGET };
const listeners = new Set<() => void>();
const set = (p: Partial<TypingStatus>) => {
  status = { ...status, ...p };
  listeners.forEach((l) => l());
};
export const useTypingStatus = () =>
  useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => status, () => status);

const offline = () => typeof navigator !== 'undefined' && navigator.onLine === false;
let lastCheck = 0;
let pausedUntil = 0;

/** One full load from `from` – if today's budget allows. Returns how many results were new, or null if not loaded. */
async function loadFull(key: string, from: number): Promise<number | null> {
  const tz = getState().settings.rules.tz;
  const now = Date.now();
  const budget = await storage.get<Budget>('mtBudget');
  if (!mayFetch(budget, now, tz).ok) return null;
  const spent = spend(budget, now, tz);
  await storage.set('mtBudget', spent);
  set({ left: DAILY_BUDGET - spent.calls });
  const fresh = await fetchResults(key, from);
  const known = new Set(Object.keys(getState().typing));
  const added = fresh.filter((r) => !known.has(String(r.ts))).length;
  if (added) await saveTyping(mergeResults(getState().typing, fresh, now));
  await storage.del('mtBackfill');
  return added;
}

async function run(job: () => Promise<number | null>) {
  set({ busy: true, error: undefined });
  try {
    const added = await job();
    set({ busy: false, at: Date.now(), ...(added !== null ? { added } : {}) });
  } catch (e) {
    if (e instanceof MonkeytypeError && (e.status === 429 || e.status === 479)) pausedUntil = Date.now() + 15 * 60_000;
    set({ busy: false, at: Date.now(), error: (e as Error).message });
  }
}

async function ready() {
  await initStore();
  const s = getState();
  const budget = await storage.get<Budget>('mtBudget');
  set({ left: mayFetch(budget, Date.now(), s.settings.rules.tz).left });
  const key = s.settings.apeKey?.trim();
  return key && !status.busy && !offline() ? key : null;
}

/** The cheap check: is there a newer test? Adds it, and loads the full list once things went quiet again. */
export async function checkTyping() {
  const key = await ready();
  const now = Date.now();
  if (!key || now < pausedUntil || now - lastCheck < 60_000) return;
  lastCheck = now;
  await run(async () => {
    const last = await fetchLast(key);
    const plan = afterLight(last, Object.values(getState().typing), now, await storage.get<number>('mtBackfill'));
    if (plan.add) {
      await saveTyping(mergeResults(getState().typing, [plan.add], now));
      await storage.set('mtBackfill', plan.backfillFrom);
      return 1;
    }
    return plan.loadNow ? loadFull(key, plan.backfillFrom!) : 0;
  });
}

/** The Refresh button: load the full list now (one of today's full loads). */
export async function refreshTyping() {
  const key = await ready();
  if (!key) return;
  const from = (await storage.get<number>('mtBackfill')) ?? sinceOf(Object.values(getState().typing), Date.now());
  await run(() => loadFull(key, from));
}

let started = false;
/** Check shortly after start, every few minutes while the app is in front, and when it comes back to the front. */
export function startTypingSync() {
  if (started) return;
  started = true;
  setTimeout(() => void checkTyping(), 3000);
  setInterval(() => document.visibilityState === 'visible' && void checkTyping(), LIGHT_EVERY_MS);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && void checkTyping());
}
