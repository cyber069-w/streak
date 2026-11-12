/** The weekly review: per habit what held and what slipped, Koban earned and spent. Pure. */
import { addDays, dayOf, daysBetween, weekStart, type Day } from './day';
import { isRest, versionAt, type DayStatus, type Report } from './engine';
import type { Purchase } from './types';

export type HabitWeek = {
  id: string;
  name: string;
  icon: string;
  unit: 'days' | 'weeks';
  days: Array<{ day: Day; status: DayStatus | 'future' }>;
  done: number;
  /** Due days (daily habits) or the weekly target. */
  due: number;
  verdict: 'held' | 'slipped' | 'open' | 'rest';
};

export interface WeekSummary {
  week: Day;
  habits: HabitWeek[];
  done: number;
  due: number;
  earned: number;
  spent: number;
  perfect: 'yes' | 'possible' | 'no';
}

export function weekSummary(report: Report, purchases: Purchase[], week: Day, tz: string): WeekSummary {
  const today = report.today;
  const days = daysBetween(week, addDays(week, 6));
  const habits: HabitWeek[] = [];
  for (const r of report.habits) {
    const cells = days.map((day): HabitWeek['days'][number] => {
      const s = r.days[day]?.status ?? 'none';
      if (day === today && s === 'open') return { day, status: 'pending' }; // per-week habit: today is still open
      if (day <= today) return { day, status: s };
      const v = versionAt(r.habit, day, tz);
      return { day, status: !v ? 'none' : r.unit === 'days' && isRest(v, day) ? 'rest' : 'future' };
    });
    if (cells.every((c) => c.status === 'none' || c.status === 'future') && !(r.unit === 'weeks' && r.weeks[week])) continue;
    let done = cells.filter((c) => c.status === 'done').length;
    let due: number;
    let verdict: HabitWeek['verdict'];
    if (r.unit === 'weeks') {
      const w = r.weeks[week];
      due = w?.target ?? 0;
      done = w?.count ?? done;
      verdict = !w || w.status === 'none' || w.status === 'pending' ? 'open' : w.status === 'done' ? 'held' : w.status === 'rest' ? 'rest' : 'slipped';
    } else {
      const open = cells.filter((c) => c.status === 'pending' || c.status === 'future').length;
      due = cells.filter((c) => ['done', 'missed', 'frozen', 'pending', 'future'].includes(c.status)).length;
      const slipped = cells.some((c) => c.status === 'missed' || c.status === 'frozen');
      verdict = slipped ? 'slipped' : due === 0 ? 'rest' : open ? 'open' : 'held';
    }
    habits.push({ id: r.habit.id, name: r.habit.name, icon: r.habit.icon, unit: r.unit, days: cells, done, due, verdict });
  }
  const inWeek = (day: Day) => day >= week && day <= addDays(week, 6);
  const earned = report.earnings.filter((e) => inWeek(e.day)).reduce((n, e) => n + e.amount, 0);
  const spent = purchases.filter((p) => inWeek(dayOf(p.at, tz))).reduce((n, p) => n + p.price, 0);
  const over = addDays(week, 6) < today;
  const perfect = report.perfectWeeks.includes(week) ? 'yes' : !over && habits.every((h) => h.verdict !== 'slipped') ? 'possible' : 'no';
  return {
    week, habits, earned, spent, perfect,
    done: habits.reduce((n, h) => n + Math.min(h.done, h.due), 0),
    due: habits.reduce((n, h) => n + h.due, 0),
  };
}

export const thisWeek = (report: Report) => weekStart(report.today);
