/** Short texts for the screens: what a habit needs today and how far you are. Pure. */
import { dayOf, weekStart, type Day } from './day';
import { amountAt, versionAt, type HabitReport } from './engine';
import type { Facts, HabitVersion } from './types';

export type TickMode = 'manual' | 'timer' | 'typing' | 'auto';

/** How you complete it by hand on Today. */
export function tickMode(v: HabitVersion): TickMode {
  if (v.sources.some((s) => s.kind === 'timer')) return 'timer';
  if (v.sources.some((s) => s.kind === 'monkeytype')) return 'typing';
  if (v.sources.some((s) => s.kind === 'manual')) return 'manual';
  return 'auto';
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** "12 / 30 min CFA in Study Desk", "2 / 5 tests or 4 / 10 min" … for a day that isn't done yet. */
export function needs(v: HabitVersion, day: Day, f: Facts, tz: string): string {
  const parts: string[] = [];
  const ext = f.external[day];
  for (const s of v.sources) {
    if (s.kind === 'studyDeskFocus') {
      const sec = s.subjects.reduce((n, sub) => n + (ext?.focus[sub] ?? 0) + (s.lectures ? ext?.lecture[sub] ?? 0 : 0), 0);
      const min = amountAt(s.minMinutes, day);
      parts.push(`${Math.floor(sec / 60)} / ${min} min ${s.subjects.join(', ')}`);
    }
    if (s.kind === 'studyDeskReviews') parts.push(`${plural(s.minCards, 'card')} in Study Desk`);
    if (s.kind === 'monkeytype') {
      const rs = f.typing.filter((t) => dayOf(t.ts, tz) === day);
      const min = Math.floor(rs.reduce((n, r) => n + r.sec, 0) / 60);
      parts.push(`${rs.length} / ${s.minTests} tests or ${min} / ${s.minMinutes} min`);
    }
    if (s.kind === 'timer') parts.push(`${s.minutes}-min timer`);
  }
  return parts.join(' · ');
}

export interface RowInfo {
  status: 'done' | 'pending' | 'missed' | 'rest' | 'frozen' | 'none' | 'open';
  sub: string;
  mode: TickMode;
  /** Undo is possible (a mark of yours made it done). */
  markId?: string;
  streak: string;
  hot: boolean;
}

export function rowInfo(r: HabitReport, day: Day, f: Facts, tz: string): RowInfo | null {
  const v = versionAt(r.habit, day, tz);
  if (!v) return null;
  const d = r.days[day];
  const mode = tickMode(v);
  const streak = r.unit === 'weeks' ? `${r.current} wk` : String(r.current);
  const hot = r.current >= 7 || (r.unit === 'weeks' && r.current >= 4);
  if (r.unit === 'weeks') {
    const w = r.weeks[weekStart(day)];
    const done = d?.status === 'done';
    const week = w ? `${w.count} / ${w.target} this week` : '';
    return { status: done ? 'done' : w && w.count >= w.target ? 'done' : 'pending', sub: done && d?.via ? `${d.via.detail} · ${week}` : week, mode, markId: d?.via?.markId, streak, hot };
  }
  const status = d?.status ?? 'none';
  const sub = status === 'done' ? d!.via!.detail : status === 'rest' ? 'Rest day' : status === 'frozen' ? 'Covered by a freeze' : needs(v, day, f, tz);
  return { status: status === 'open' ? 'pending' : status, sub, mode, markId: d?.via?.markId, streak, hot };
}
