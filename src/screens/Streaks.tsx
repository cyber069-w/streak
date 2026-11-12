/** Streaks: current and best per habit, and a year heatmap (done, missed, rest, freeze all look different). */
import { useState } from 'react';
import { addDays, weekStart, type Day } from '../core/day';
import type { DayStatus, HabitReport } from '../core/engine';
import { useReport } from '../core/store';
import { Icon } from '../components/Icon';
import { HabitIcon, PageHead } from '../components/ui';

const WEEKS = 53;
const label = (day: Day) => new Date(`${day}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const WORDS: Record<string, string> = { done: 'Done', missed: 'Missed', rest: 'Rest day', frozen: 'Freeze used', pending: 'Not done yet', none: 'Not tracked', open: '–', future: '' };

/** What a cell shows: the day's own status; for per-week habits, empty days take their week's colour. */
function cellOf(r: HabitReport, day: Day, today: Day): string {
  if (day > today) return 'future';
  const s: DayStatus | undefined = r.days[day]?.status;
  if (r.unit === 'weeks' && s !== 'done') {
    const w = r.weeks[weekStart(day)]?.status;
    if (w === 'missed') return 'missed';
    if (w === 'frozen') return 'frozen';
    if (w === 'rest' || s === 'rest') return 'rest';
    return day === today ? 'pending' : 'none';
  }
  return s ?? 'none';
}

function Heatmap({ r, today }: { r: HabitReport; today: Day }) {
  const [sel, setSel] = useState<Day | null>(null);
  const first = addDays(weekStart(today), -7 * (WEEKS - 1));
  const days = Array.from({ length: WEEKS * 7 }, (_, i) => addDays(first, i));
  const d = sel ? r.days[sel] : null;
  const selWeek = sel && r.unit === 'weeks' ? r.weeks[weekStart(sel)] : null;
  return (
    <>
      <div className="heat-wrap" ref={(el) => { if (el) el.scrollLeft = el.scrollWidth; }}>
        <div className="heat" role="grid" aria-label={`${r.habit.name}, last 12 months`}>
          {days.map((day) => {
            const c = cellOf(r, day, today);
            return <i key={day} className={`${c}${sel === day ? ' sel' : ''}`} title={`${label(day)}: ${WORDS[c] ?? c}`} onClick={() => setSel(sel === day ? null : day)} />;
          })}
        </div>
      </div>
      {sel && (
        <p className="small" style={{ marginTop: 8 }}>
          <b>{label(sel)}</b> · {WORDS[cellOf(r, sel, today)]}
          {d?.via ? ` – ${d.via.detail}` : ''}
          {selWeek ? ` · week: ${selWeek.count} / ${selWeek.target}` : ''}
        </p>
      )}
    </>
  );
}

export function Streaks() {
  const report = useReport();
  const habits = report.habits.filter((r) => !r.habit.archivedDay || r.habit.archivedDay >= report.today);
  const total = habits.reduce((n, r) => n + Object.values(r.days).filter((d) => d.status === 'done').length, 0);
  return (
    <div className="page">
      <PageHead eyebrow="Last 12 months" title="Streaks" sub={`${total} completed habit days so far.`} />
      <div className="legend" style={{ marginBottom: 16 }}>
        <span><i className="done" />Done</span>
        <span><i className="missed" />Missed</span>
        <span><i className="rest" />Rest day</span>
        <span><i className="frozen" />Freeze used</span>
      </div>
      <div className="stack">
        {habits.map((r) => {
          const unit = (n: number) => (r.unit === 'weeks' ? (n === 1 ? 'week' : 'weeks') : n === 1 ? 'day' : 'days');
          return (
            <section key={r.habit.id} className="card card-pad">
              <div className="glass-head" style={{ alignItems: 'center' }}>
                <HabitIcon habit={r.habit} className="sm" size={18} />
                <h2>{r.habit.name}</h2>
                {r.waitingFreeze && <span className="tag"><Icon name="snow" size={14} /> Freeze ready</span>}
              </div>
              <div className="streak-stats">
                <div><b className="num">{r.current} <small>{unit(r.current)}</small></b><span>current</span></div>
                <div><b className="num">{r.best} <small>{unit(r.best)}</small></b><span>best</span></div>
              </div>
              <Heatmap r={r} today={report.today} />
            </section>
          );
        })}
      </div>
    </div>
  );
}
