/**
 * Read-only access to Study Desk's data.
 *
 * Study Desk keeps everything in one encrypted file, `progress.enc`, in the same private repo (see its
 * core/sync.ts). Streak reads it with the same token and password and keeps only a small extract per day:
 * focus seconds per subject (study and lectures apart) and cards reviewed per module.
 *
 * Streak never writes Study Desk's file: the reader below is given a `get` function only, and a unit test
 * checks that no request to `progress.enc` is anything but a GET.
 */
import { addDays, dayOf, startOfDay, type Day } from './day';
import type { ExternalDay } from './types';

export const STUDY_DESK_FILE = 'progress.enc';

/** The parts of Study Desk's SyncData that Streak reads (everything else is ignored). */
export interface StudyDeskData {
  app: string;
  days?: Record<string, Array<{ date: string; modules?: Record<string, { reviews: number }> }>>;
  focus?: { sessions: Array<{ id: string; kind: 'study' | 'lecture'; subject: string; start: string; end: string; effectiveSec: number; at?: number }> };
}

/** How long data may come in late: a session counts for day D only if recorded by the end of D+1. */
const recordedInTime = (day: Day, recordedAt: number, tz: string) => recordedAt < startOfDay(addDays(day, 2), tz);

export function extractStudyDesk(data: StudyDeskData, tz: string): Record<Day, ExternalDay> {
  const out: Record<Day, ExternalDay> = {};
  const get = (day: Day) => (out[day] ??= { day, focus: {}, lecture: {}, reviews: {} });
  for (const s of data.focus?.sessions ?? []) {
    const start = Date.parse(s.start);
    if (!Number.isFinite(start) || !(s.effectiveSec > 0)) continue;
    const day = dayOf(start, tz);
    if (!recordedInTime(day, s.at ?? Date.parse(s.end), tz)) continue;
    const bucket = s.kind === 'lecture' ? get(day).lecture : get(day).focus;
    bucket[s.subject] = (bucket[s.subject] ?? 0) + s.effectiveSec;
  }
  // card reviews: one log per device, added up (like Study Desk's combineDays)
  for (const logs of Object.values(data.days ?? {})) {
    for (const d of logs) {
      for (const [m, v] of Object.entries(d.modules ?? {})) {
        if (!(v.reviews > 0)) continue;
        const r = get(d.date).reviews;
        r[m] = (r[m] ?? 0) + v.reviews;
      }
    }
  }
  return out;
}

const KEEP_DAYS = 400;

/**
 * Fold a fresh extract into what Streak already has: per value the larger one wins, so a later
 * deletion in Study Desk (or a device whose data is behind) never takes a completed day away.
 */
export function foldExternal(old: Record<Day, ExternalDay>, fresh: Record<Day, ExternalDay>, today: Day): Record<Day, ExternalDay> {
  const out: Record<Day, ExternalDay> = {};
  const cutoff = addDays(today, -KEEP_DAYS);
  const max = (a: Record<string, number> = {}, b: Record<string, number> = {}) => {
    const r: Record<string, number> = { ...a };
    for (const [k, v] of Object.entries(b)) r[k] = Math.max(r[k] ?? 0, v);
    return r;
  };
  for (const day of new Set([...Object.keys(old), ...Object.keys(fresh)])) {
    if (day < cutoff) continue;
    const a = old[day], b = fresh[day];
    out[day] = { day, focus: max(a?.focus, b?.focus), lecture: max(a?.lecture, b?.lecture), reviews: max(a?.reviews, b?.reviews) };
  }
  return out;
}
