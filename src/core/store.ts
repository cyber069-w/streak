/**
 * App state: the raw facts in IndexedDB (through kvSync, so every store syncs item by item), one in-memory
 * snapshot for React, and the engine report derived from it. Every write is saved at once.
 */
import { useSyncExternalStore } from 'react';
import { dayOf, type Day } from './day';
import { DEFAULT_REWARDS, defaultHabits } from './defaults';
import { evaluate, type Report } from './engine';
import { initKvSync, localWrite, registerKvHooks } from './kvSync';
import { storage } from './db';
import { DEFAULT_RULES, type ExternalDay, type Facts, type Habit, type Mark, type Purchase, type Reward, type Rules, type TypingResult } from './types';

export interface AppSettings {
  rules: Rules;
  /** Typing goal and where you started (for the progress bar). */
  wpmGoal: number;
  wpmStart: number;
  /** Monkeytype ApeKey (synced inside the encrypted file, so you paste it once). */
  apeKey?: string;
}
export const DEFAULT_SETTINGS: AppSettings = { rules: DEFAULT_RULES, wpmGoal: 60, wpmStart: 43 };

export interface AppState {
  ready: boolean;
  habits: Habit[];
  marks: Mark[];
  rewards: Reward[];
  purchases: Purchase[];
  external: Record<Day, ExternalDay>;
  typing: Record<string, TypingResult>;
  settings: AppSettings;
  /** Changes when the day changes (or after any write), so the report is recomputed. */
  now: number;
}

let state: AppState = {
  ready: false, habits: [], marks: [], rewards: [], purchases: [], external: {}, typing: {}, settings: DEFAULT_SETTINGS, now: Date.now(),
};
const listeners = new Set<() => void>();
function set(patch: Partial<AppState>) {
  state = { ...state, ...patch };
  report = null;
  listeners.forEach((l) => l());
}
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

let report: Report | null = null;
export const factsOf = (s: AppState): Facts => ({ habits: s.habits, marks: s.marks, external: s.external, typing: Object.values(s.typing), purchases: s.purchases });
export function getReport(): Report {
  report ??= evaluate(factsOf(state), state.now, state.settings.rules);
  return report;
}
export const getState = () => state;
export const useApp = () => useSyncExternalStore(subscribe, () => state, () => state);
/** The engine's view of the current state (recomputed only when something changed). */
export function useReport(): Report {
  useApp();
  return getReport();
}

const settingsFrom = (rec: Record<string, unknown> | undefined): AppSettings => ({ ...DEFAULT_SETTINGS, ...(rec as Partial<AppSettings>) });

/** Apply a store value that changed (locally or through sync) to the snapshot. */
function applyKey(key: string, value: unknown) {
  if (key === 'settings') set({ settings: settingsFrom(value as Record<string, unknown>) });
  else if (key in state) set({ [key]: value ?? (key === 'external' || key === 'typing' ? {} : []) } as Partial<AppState>);
}

async function write(key: keyof AppState, value: unknown) {
  applyKey(key, value);
  set({ now: Date.now() });
  await localWrite(key, value);
}

let started: Promise<void> | null = null;
export function initStore(): Promise<void> {
  started ??= (async () => {
    // first start on this device: the default habits and rewards, saved *before* the sync collections exist,
    // so they count as very old – a device that is already in use (sync) always wins over these defaults
    if (!(await storage.get('seeded'))) {
      const now = Date.now();
      if (!(await storage.get('habits'))) await storage.set('habits', defaultHabits(now, DEFAULT_RULES));
      if (!(await storage.get('rewards'))) await storage.set('rewards', DEFAULT_REWARDS);
      if (!(await storage.get('settings'))) await storage.set('settings', { ...DEFAULT_SETTINGS });
      await storage.set('seeded', true);
    }
    await initKvSync();
    registerKvHooks(() => syncHook(), (key, value) => applyKey(key, value));
    const [habits, marks, rewards, purchases, external, typing, settings] = await Promise.all([
      storage.get<Habit[]>('habits'), storage.get<Mark[]>('marks'), storage.get<Reward[]>('rewards'), storage.get<Purchase[]>('purchases'),
      storage.get<Record<Day, ExternalDay>>('external'), storage.get<Record<string, TypingResult>>('typing'), storage.get<Record<string, unknown>>('settings'),
    ]);
    set({
      habits: habits ?? [], marks: marks ?? [], rewards: rewards ?? [], purchases: purchases ?? [], external: external ?? {}, typing: typing ?? {},
      settings: settingsFrom(settings),
    });
    set({ ready: true, now: Date.now() });
    // a new day → new report (checked every 30 s and when the app comes back)
    let day = dayOf(Date.now(), state.settings.rules.tz);
    const check = () => {
      const d = dayOf(Date.now(), state.settings.rules.tz);
      if (d !== day) {
        day = d;
        set({ now: Date.now() });
      }
    };
    setInterval(check, 30_000);
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check());
  })();
  return started;
}

/** Sync registers itself here (core/sync.ts) to hear about local changes. */
let syncHook: () => void = () => {};
export const onLocalChange = (fn: () => void) => { syncHook = fn; };

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export const today = () => dayOf(Date.now(), state.settings.rules.tz);

/** Tick or untick a habit for a day (today or yesterday – older days are locked). */
export async function toggleTick(habitId: string, day: Day) {
  const existing = state.marks.filter((m) => m.habitId === habitId && m.day === day);
  if (existing.length) return write('marks', state.marks.filter((m) => !existing.includes(m)));
  return addMark({ id: `${habitId}:${day}:manual`, habitId, day, createdAt: Date.now(), source: 'manual' });
}

export function addMark(m: Mark) {
  return write('marks', [...state.marks.filter((x) => x.id !== m.id), m]);
}

export const saveHabits = (habits: Habit[]) => write('habits', habits);
export const saveRewards = (rewards: Reward[]) => write('rewards', rewards);
export const addPurchase = (p: Purchase) => write('purchases', [...state.purchases, p]);
export const saveSettings = (patch: Partial<AppSettings>) => write('settings', { ...state.settings, ...patch });
export const saveExternal = (external: Record<Day, ExternalDay>) => write('external', external);
export const saveTyping = (typing: Record<string, TypingResult>) => write('typing', typing);
