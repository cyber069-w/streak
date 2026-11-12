/**
 * Streaks: per habit the current and best streak and a month calendar (done, missed, rest day, freeze look
 * different). Arrows switch the month for all habits at once.
 */
import { useState } from 'react';
import { addDays, daysBetween, weekStart, type Day } from '../core/day';
import type { DayStatus, HabitReport } from '../core/engine';
import { useReport } from '../core/store';
import { Icon } from '../components/Icon';
import { HabitIcon, PageHead } from '../components/ui';

const WORDS: Record<string, string> = { done: 'Done', missed: 'Missed', 'missed-week': 'Week missed', rest: 'Rest day', frozen: 'Freeze used', pending: 'Not done yet', none: 'Not tracked', open: '–', future: '' };
const long = (day: Day) => new Date(`${day}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const monthName = (month: string) => new Date(`${month}-15T12:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const shiftMonth = (month: string, n: number) => {
  const d = new Date(`${month}-15T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 7);
};
const lastDay = (month: string) => addDays(`${shiftMonth(month, 1)}-01`, -1);

/** What a day shows: its own status; per-week habits colour empty days by their week. */
function cellOf(r: HabitReport, day: Day, today: Day): string {
  if (day > today) return 'future';
  const s: DayStatus | undefined = r.days[day]?.status;
  if (r.unit === 'weeks' && s !== 'done') {
    if (!r.days[day]) return 'none';
    const w = r.weeks[weekStart(day)]?.status;
    if (w === 'missed') return 'missed-week';
    if (w === 'frozen') return 'frozen';
    if (w === 'rest') return 'rest';
    return day === today ? 'pending' : 'open';
  }
  return s ?? 'none';
}

function MonthCalendar({ r, month, today }: { r: HabitReport; month: string; today: Day }) {
  const [sel, setSel] = useState<Day | null>(null);
  const days = daysBetween(weekStart(`${month}-01`), addDays(weekStart(lastDay(month)), 6));
  const d = sel ? r.days[sel] : null;
  const week = sel && r.unit === 'weeks' ? r.weeks[weekStart(sel)] : null;
  return (
    <>
      <div className="cal" role="grid" aria-label={`${r.habit.name}, ${monthName(month)}`}>
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((l, i) => <span key={i} className="cal-head">{l}</span>)}
        {days.map((day) => {
          if (day.slice(0, 7) !== month) return <span key={day} className="cal-day out" aria-hidden="true" />;
          const c = cellOf(r, day, today);
          return (
            <button key={day} className={`cal-day ${c}${day === today ? ' today' : ''}${sel === day ? ' sel' : ''}`} onClick={() => setSel(sel === day ? null : day)}
              aria-label={`${long(day)}: ${WORDS[c] ?? c}`}>
              {c === 'frozen' ? <Icon name="snow" size={13} /> : Number(day.slice(8))}
            </button>
          );
        })}
      </div>
      <p className="cal-detail small">
        {sel ? (
          <><b>{long(sel)}</b> · {WORDS[cellOf(r, sel, today)]}{d?.via ? ` – ${d.via.detail}` : ''}{week ? ` · week ${week.count} of ${week.target}` : ''}</>
        ) : <span className="faint">Tap a day for details.</span>}
      </p>
    </>
  );
}

export function Streaks() {
  const report = useReport();
  const thisMonth = report.today.slice(0, 7);
  const [month, setMonth] = useState(thisMonth);
  const habits = report.habits.filter((r) => !r.habit.archivedDay || r.habit.archivedDay >= `${month}-01`);
  const firstMonth = report.habits.reduce((m, r) => (r.habit.createdDay.slice(0, 7) < m ? r.habit.createdDay.slice(0, 7) : m), thisMonth);
  const total = report.habits.reduce((n, r) => n + Object.values(r.days).filter((x) => x.status === 'done').length, 0);

  return (
    <div className="page">
      <PageHead
        eyebrow="Streaks"
        title={monthName(month)}
        sub={`${total} habit ${total === 1 ? 'day' : 'days'} completed since you started.`}
        actions={<>
          <button className="icon-btn" disabled={month <= firstMonth} onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month"><Icon name="left" /></button>
          <button className="icon-btn" disabled={month >= thisMonth} onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Next month"><Icon name="right" /></button>
        </>}
      />
      <div className="legend" style={{ marginBottom: 16 }}>
        <span><i className="done" />Done</span>
        <span><i className="missed" />Missed</span>
        <span><i className="rest" />Rest day</span>
        <span><i className="frozen" />Freeze used</span>
      </div>
      <div className="streak-grid">
        {habits.map((r) => {
          const unit = (n: number) => (r.unit === 'weeks' ? (n === 1 ? 'week' : 'weeks') : n === 1 ? 'day' : 'days');
          const days = Object.entries(r.days).filter(([day]) => day.slice(0, 7) === month);
          const done = days.filter(([, x]) => x.status === 'done').length;
          const due = days.filter(([, x]) => ['done', 'missed', 'frozen'].includes(x.status)).length;
          const sched = r.habit.versions[0].schedule;
          return (
            <section key={r.habit.id} className="card card-pad streak-card">
              <div className="streak-card-head">
                <HabitIcon habit={r.habit} />
                <div className="grow">
                  <h2>{r.habit.name}</h2>
                  <span className="faint tiny">{sched.kind === 'perWeek' ? `${sched.times}× per week` : sched.kind === 'weekdays' ? 'On chosen days' : 'Daily'}</span>
                </div>
                {r.waitingFreeze && <span className="pill"><Icon name="snow" size={12} /> Freeze</span>}
              </div>
              <div className="streak-stats">
                <div><b className="num">{r.current}</b><span>current {unit(r.current)}</span></div>
                <div><b className="num">{r.best}</b><span>best</span></div>
                <div><b className="num">{r.unit === 'weeks' ? done : due ? `${Math.round((done / due) * 100)}%` : '–'}</b><span>{r.unit === 'weeks' ? 'this month' : 'this month'}</span></div>
              </div>
              <MonthCalendar r={r} month={month} today={report.today} />
            </section>
          );
        })}
      </div>
    </div>
  );
}
