/** Pulls new Monkeytype results now and then (within the daily budget) and stores them (they sync to other devices). */
import { useSyncExternalStore } from 'react';
import { storage } from './db';
import { DAILY_BUDGET, fetchResults, mayFetch, mergeResults, sinceOf, spend, type Budget } from './monkeytype';
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

export async function refreshTyping(manual = false) {
  await initStore();
  const s = getState();
  const key = s.settings.apeKey?.trim();
  const tz = s.settings.rules.tz;
  const budget = await storage.get<Budget>('mtBudget');
  const now = Date.now();
  const may = mayFetch(budget, now, tz, manual);
  set({ left: may.left, at: budget?.lastAt });
  if (!key || status.busy || !may.ok || (typeof navigator !== 'undefined' && navigator.onLine === false)) return;
  set({ busy: true, error: undefined });
  const spent = spend(budget, now, tz);
  await storage.set('mtBudget', spent);
  try {
    const have = getState().typing;
    const fresh = await fetchResults(key, sinceOf(Object.values(have), now));
    const known = new Set(Object.keys(have));
    const added = fresh.filter((r) => !known.has(String(r.ts))).length;
    if (added) await saveTyping(mergeResults(getState().typing, fresh, now));
    set({ busy: false, at: now, left: DAILY_BUDGET - spent.calls, added });
  } catch (e) {
    set({ busy: false, at: now, left: DAILY_BUDGET - spent.calls, error: (e as Error).message });
  }
}

let started = false;
/** Fetch shortly after start and whenever the app comes back to the front (the budget decides). */
export function startTypingSync() {
  if (started) return;
  started = true;
  setTimeout(() => void refreshTyping(), 3000);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && void refreshTyping());
}
