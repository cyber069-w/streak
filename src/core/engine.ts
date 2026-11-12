/**
 * The streak engine. One pure function turns the raw facts (habits with their rule history, your marks,
 * Study Desk and Monkeytype data, purchases) into day statuses, streaks, Koban, levels and badges.
 * Nothing derived is stored, so two devices can never disagree about a streak.
 *
 * Anti-cheating lives here, not only in the screens:
 *  - a mark counts only for the day it was made or the day before (today and yesterday are editable)
 *  - a rule change applies from the day after it was saved (except a habit's very first version)
 *  - a freeze covers only days (daily habits) or weeks (per-week habits) that start after the day it was bought
 */
import { addDays, dayOf, daysBetween, diffDays, weekdayOf, weekStart, type Day } from './day';
import { spentOf, validFreezes } from './shop';
import type { Amount, Facts, Habit, HabitVersion, Mark, Purchase, Rules, TypingResult } from './types';

export type DayStatus =
  | 'none' // not tracked (before the habit started, after it was archived)
  | 'rest'
  | 'done'
  | 'missed'
  | 'frozen'
  | 'pending' // today (or this week), not done yet
  | 'open'; // per-week habit: nothing on this day

export interface Completion {
  via: 'manual' | 'timer' | 'typing' | 'focus' | 'reviews' | 'monkeytype';
  detail: string;
  /** The mark behind it, if any (to undo a tick). */
  markId?: string;
}

export interface Earning {
  id: string;
  day: Day;
  amount: number;
  kind: 'habit' | 'milestone' | 'perfectWeek';
  habitId?: string;
  label: string;
}

export interface WeekInfo { status: DayStatus; count: number; target: number }

export interface HabitReport {
  habit: Habit;
  unit: 'days' | 'weeks';
  days: Record<Day, { status: DayStatus; via?: Completion }>;
  /** Per-week habits: keyed by the week's Monday. */
  weeks: Record<Day, WeekInfo>;
  current: number;
  best: number;
  /** First day each streak length (7, 30, 100 …) was reached. */
  reached: Record<number, Day>;
  frozen: Array<{ purchaseId: string; on: Day }>;
  /** A bought freeze not used yet. */
  waitingFreeze: Purchase | null;
  earnings: Earning[];
}

export interface Badge { id: string; name: string; earned: Day | null }

export interface Report {
  today: Day;
  habits: HabitReport[];
  earnings: Earning[];
  perfectWeeks: Day[];
  xp: number;
  spent: number;
  balance: number;
  level: Level;
  badges: Badge[];
}

export interface Level { level: number; from: number; to: number }

/** Level from all Koban ever earned: level L starts at 50·(L−1)² XP. */
export function levelOf(xp: number): Level {
  const level = Math.floor(Math.sqrt(Math.max(0, xp) / 50)) + 1;
  return { level, from: 50 * (level - 1) ** 2, to: 50 * level ** 2 };
}

export const amountAt = (a: Amount, day: Day) => a.byWeekday?.[weekdayOf(day)] ?? a.default;

/** The day a version starts to apply: never before the day after it was saved, except the first one. */
const effectiveFrom = (v: HabitVersion, i: number, tz: string): Day => {
  if (i === 0) return v.from;
  const next = addDays(dayOf(v.savedAt, tz), 1);
  return v.from > next ? v.from : next;
};

/** The rules that apply on `day`: the most recently saved version that has started by then. */
export function versionAt(h: Habit, day: Day, tz: string): HabitVersion | null {
  if (day < h.createdDay || (h.archivedDay && day > h.archivedDay)) return null;
  const sorted = h.versions.map((v, i) => ({ v, i })).sort((a, b) => a.v.savedAt - b.v.savedAt);
  let best: HabitVersion | null = null;
  for (const { v, i } of sorted) if (effectiveFrom(v, i, tz) <= day) best = v;
  return best;
}

export function isRest(v: HabitVersion, day: Day): boolean {
  const wd = weekdayOf(day);
  if (v.schedule.kind === 'weekdays' && !v.schedule.days.includes(wd)) return true;
  if (v.rest.weekdays.includes(wd)) return true;
  const c = v.rest.cycle;
  if (c && c.everyWeeks > 0 && wd === c.weekday) {
    const n = 7 * c.everyWeeks;
    if ((((diffDays(c.start, day) % n) + n) % n) === 0) return true;
  }
  return v.rest.dates.includes(day);
}

/** A mark counts only for the day it was made or the day before. */
export function markValid(m: Mark, tz: string): boolean {
  const made = dayOf(m.createdAt, tz);
  return m.day <= made && m.day >= addDays(made, -1);
}

const mins = (sec: number) => Math.round(sec / 60);

interface Index {
  marks: Map<string, Mark[]>;
  typing: Map<Day, TypingResult[]>;
}

function indexFacts(f: Facts, tz: string): Index {
  const marks = new Map<string, Mark[]>();
  for (const m of f.marks) {
    if (!markValid(m, tz)) continue;
    const k = `${m.habitId}|${m.day}`;
    marks.set(k, [...(marks.get(k) ?? []), m]);
  }
  const typing = new Map<Day, TypingResult[]>();
  for (const r of f.typing) {
    const d = dayOf(r.ts, tz);
    typing.set(d, [...(typing.get(d) ?? []), r]);
  }
  return { marks, typing };
}

/** Is the habit done on `day`, and through what? */
export function completion(h: Habit, v: HabitVersion, day: Day, f: Facts, ix: Index): Completion | null {
  const ext = f.external[day];
  for (const s of v.sources) {
    if (s.kind === 'studyDeskFocus' && ext) {
      const sec = s.subjects.reduce((n, sub) => n + (ext.focus[sub] ?? 0) + (s.lectures ? ext.lecture[sub] ?? 0 : 0), 0);
      if (sec > 0 && sec >= amountAt(s.minMinutes, day) * 60) return { via: 'focus', detail: `${mins(sec)} min in Study Desk` };
    }
    if (s.kind === 'studyDeskReviews' && ext) {
      const n = s.modules.reduce((sum, m) => sum + (ext.reviews[m] ?? 0), 0);
      if (n > 0 && n >= s.minCards) return { via: 'reviews', detail: `${n} cards in Study Desk` };
    }
    if (s.kind === 'monkeytype') {
      const rs = ix.typing.get(day) ?? [];
      const sec = rs.reduce((n, r) => n + r.sec, 0);
      if (rs.length && (sec >= s.minMinutes * 60 || rs.length >= s.minTests)) {
        const best = Math.max(...rs.map((r) => r.wpm));
        return { via: 'monkeytype', detail: `${rs.length} test${rs.length === 1 ? '' : 's'}, ${mins(sec)} min, best ${Math.round(best)} WPM` };
      }
    }
  }
  const m = (ix.marks.get(`${h.id}|${day}`) ?? []).sort((a, b) => a.createdAt - b.createdAt)[0];
  if (m) {
    if (m.source === 'timer') return { via: 'timer', detail: `${m.minutes ?? ''} min timer`.trim(), markId: m.id };
    if (m.source === 'typing') return { via: 'typing', detail: `${m.wpm ?? '–'} WPM, ${m.acc ?? '–'} %`, markId: m.id };
    return { via: 'manual', detail: 'Done', markId: m.id };
  }
  return null;
}

function evaluateHabit(h: Habit, f: Facts, ix: Index, today: Day, rules: Rules, freezes: Purchase[]): HabitReport {
  const tz = rules.tz;
  const weekly = h.versions[0]?.schedule.kind === 'perWeek';
  const r: HabitReport = { habit: h, unit: weekly ? 'weeks' : 'days', days: {}, weeks: {}, current: 0, best: 0, reached: {}, frozen: [], waitingFreeze: null, earnings: [] };
  const last = h.archivedDay && h.archivedDay < today ? h.archivedDay : today;
  const queue = freezes.filter((p) => p.habitId === h.id);
  let run = 0;

  // a missed day/week takes the oldest unused freeze bought before `start`
  const useFreeze = (start: Day, on: Day): boolean => {
    const p = queue[0];
    if (!p || dayOf(p.at, tz) >= start) return false;
    queue.shift();
    r.frozen.push({ purchaseId: p.id, on });
    return true;
  };
  const extend = (day: Day) => {
    run++;
    r.best = Math.max(r.best, run);
    r.reached[run] ??= day;
    const bonus = (weekly ? rules.weekMilestones : rules.milestones)[run];
    if (bonus) r.earnings.push({ id: `ms:${h.id}:${day}`, day, amount: bonus, kind: 'milestone', habitId: h.id, label: `${h.name}: ${run}-${weekly ? 'week' : 'day'} streak` });
  };
  const earn = (day: Day, v: HabitVersion) => {
    const amount = amountAt(v.koban, day);
    if (amount) r.earnings.push({ id: `h:${h.id}:${day}`, day, amount, kind: 'habit', habitId: h.id, label: h.name });
  };

  if (!weekly) {
    for (const day of daysBetween(h.createdDay, last)) {
      const v = versionAt(h, day, tz);
      if (!v) { r.days[day] = { status: 'none' }; continue; }
      const c = completion(h, v, day, f, ix);
      if (c) {
        r.days[day] = { status: 'done', via: c };
        earn(day, v);
        extend(day);
      } else if (isRest(v, day)) r.days[day] = { status: 'rest' };
      else if (day === today) r.days[day] = { status: 'pending' };
      else if (useFreeze(day, day)) r.days[day] = { status: 'frozen' };
      else {
        r.days[day] = { status: 'missed' };
        run = 0;
      }
    }
  } else {
    for (let ws = weekStart(h.createdDay); ws <= last; ws = addDays(ws, 7)) {
      const days = daysBetween(ws, addDays(ws, 6));
      const tracked = days.filter((d) => d >= h.createdDay && d <= last);
      const v = tracked.length ? versionAt(h, tracked[0], tz) : null;
      if (!v) continue;
      const target = Math.max(1, v.schedule.kind === 'perWeek' ? v.schedule.times : 1);
      let count = 0;
      let reachedOn: Day | null = null;
      for (const day of tracked) {
        const dv = versionAt(h, day, tz);
        const c = dv && completion(h, dv, day, f, ix);
        if (dv && c) {
          count++;
          r.days[day] = { status: 'done', via: c };
          if (count <= target) earn(day, dv);
          if (count === target) reachedOn = day;
        } else r.days[day] = { status: dv && isRest(dv, day) ? 'rest' : 'open' };
      }
      const full = tracked.length === 7;
      const allRest = days.every((d) => {
        const dv = versionAt(h, d, tz);
        return dv && isRest(dv, d);
      });
      let status: DayStatus;
      if (count >= target) {
        status = 'done';
        extend(reachedOn!);
      } else if (ws === weekStart(today) && last === today) status = 'pending';
      else if (!full) status = 'none';
      else if (allRest) status = 'rest';
      else if (useFreeze(ws, ws)) status = 'frozen';
      else {
        status = 'missed';
        run = 0;
      }
      r.weeks[ws] = { status, count, target };
    }
  }
  r.current = h.archivedDay && h.archivedDay < today ? 0 : run;
  r.waitingFreeze = queue[0] ?? null;
  return r;
}

/** Weeks (Mondays) that are over and where every due habit held – freezes don't count as perfect. */
function perfectWeeks(reports: HabitReport[], today: Day): Day[] {
  const mondays = new Set<Day>();
  for (const r of reports) for (const d of Object.keys(r.days)) mondays.add(weekStart(d));
  const out: Day[] = [];
  for (const ws of [...mondays].sort()) {
    if (addDays(ws, 6) >= today) continue;
    let due = 0;
    let ok = true;
    for (const r of reports) {
      if (r.unit === 'weeks') {
        const w = r.weeks[ws];
        if (!w || w.status === 'none' || w.status === 'rest') continue;
        due++;
        if (w.status !== 'done') ok = false;
      } else {
        for (const d of daysBetween(ws, addDays(ws, 6))) {
          const s = r.days[d]?.status;
          if (s === 'done') due++;
          else if (s === 'missed' || s === 'frozen') ok = false;
        }
      }
    }
    if (ok && due > 0) out.push(ws);
  }
  return out;
}

function badgesOf(reports: HabitReport[], pw: Day[], f: Facts, rules: Rules): Badge[] {
  const firstReach = (n: number) => {
    const days = reports.filter((r) => r.unit === 'days').map((r) => r.reached[n]).filter(Boolean).sort();
    return days[0] ?? null;
  };
  const wpm60 = [
    ...f.typing.filter((t) => t.wpm >= 60).map((t) => dayOf(t.ts, rules.tz)),
    ...f.marks.filter((m) => m.source === 'typing' && (m.wpm ?? 0) >= 60 && markValid(m, rules.tz)).map((m) => m.day),
  ].sort()[0] ?? null;
  const meditations = reports
    .filter((r) => r.habit.versions.some((v) => v.sources.some((s) => s.kind === 'timer')))
    .flatMap((r) => Object.entries(r.days).filter(([, d]) => d.status === 'done').map(([day]) => day))
    .sort();
  const firstReward = f.purchases.filter((p) => p.kind === 'reward').sort((a, b) => a.at - b.at)[0];
  return [
    { id: 'streak7', name: 'First 7-day streak', earned: firstReach(7) },
    { id: 'streak30', name: '30-day streak', earned: firstReach(30) },
    { id: 'streak100', name: '100-day streak', earned: firstReach(100) },
    { id: 'perfect1', name: 'First perfect week', earned: pw[0] ? addDays(pw[0], 6) : null },
    { id: 'perfect4', name: '4 perfect weeks', earned: pw[3] ? addDays(pw[3], 6) : null },
    { id: 'wpm60', name: '60 WPM', earned: wpm60 },
    { id: 'meditate100', name: '100 meditations', earned: meditations[99] ?? null },
    { id: 'reward1', name: 'First reward', earned: firstReward ? dayOf(firstReward.at, rules.tz) : null },
  ];
}

export function evaluate(f: Facts, now: number, rules: Rules): Report {
  const today = dayOf(now, rules.tz);
  const ix = indexFacts(f, rules.tz);
  const freezes = validFreezes(f.purchases, rules);
  const habits = [...f.habits].sort((a, b) => a.order - b.order).map((h) => evaluateHabit(h, f, ix, today, rules, freezes));
  const pw = perfectWeeks(habits, today);
  const earnings = [
    ...habits.flatMap((h) => h.earnings),
    ...pw.map((ws): Earning => ({ id: `pw:${ws}`, day: addDays(ws, 6), amount: rules.perfectWeek, kind: 'perfectWeek', label: 'Perfect week' })),
  ].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : a.id < b.id ? -1 : 1));
  const xp = earnings.reduce((n, e) => n + e.amount, 0);
  const spent = spentOf(f.purchases, rules);
  return { today, habits, earnings, perfectWeeks: pw, xp, spent, balance: xp - spent, level: levelOf(xp), badges: badgesOf(habits, pw, f, rules) };
}
