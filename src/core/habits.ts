/** Editing habits without rewriting the past. Pure. */
import { addDays, dayOf, type Day } from './day';
import type { Habit, HabitVersion } from './types';

/**
 * Save new rules for a habit. They apply from tomorrow – except for a habit created today, whose first
 * version is simply replaced. Versions saved earlier that haven't started yet are replaced too.
 */
export function withRules(h: Habit, rules: Omit<HabitVersion, 'from' | 'savedAt'>, now: number, tz: string): Habit {
  const today = dayOf(now, tz);
  if (h.createdDay >= today && h.versions.length === 1) return { ...h, versions: [{ ...rules, from: h.createdDay, savedAt: now }] };
  const tomorrow = addDays(today, 1);
  const started = h.versions.filter((v, i) => i === 0 || v.from <= today);
  return { ...h, versions: [...started, { ...rules, from: tomorrow, savedAt: now }] };
}

/** The newest rules (also ones that start tomorrow) – what the editor shows. */
export const latestRules = (h: Habit): HabitVersion => [...h.versions].sort((a, b) => a.savedAt - b.savedAt)[h.versions.length - 1];

export function newHabit(name: string, icon: string, order: number, rules: Omit<HabitVersion, 'from' | 'savedAt'>, now: number, tz: string): Habit {
  const day: Day = dayOf(now, tz);
  const id = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'habit'}-${now.toString(36)}`;
  return { id, name, icon, order, createdDay: day, versions: [{ ...rules, from: day, savedAt: now }] };
}
