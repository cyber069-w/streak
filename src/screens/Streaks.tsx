/** Streaks: current and best per habit, and a year heatmap (done, missed, rest, freeze all look different). */
import { useState } from 'react';
import { addDays, weekStart, type Day } from '../core/day';
import type { DayStatus, HabitReport } from '../core/engine';
import { useReport } from '../core/store';
import { Icon } from '../components/Icon';

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
  return (
    <div className="page stack">
      <header className="page-head"><h1>Streaks</h1></header>
      {habits.map((r) => {
        const unit = (n: number) => (r.unit === 'weeks' ? (n === 1 ? 'week' : 'weeks') : n === 1 ? 'day' : 'days');
        return (
          <section key={r.habit.id} className="glass">
            <div className="row" style={{ marginBottom: 12 }}>
              <span className="habit-icon"><Icon name={r.habit.icon} size={22} /></span>
              <h2 className="grow">{r.habit.name}</h2>
              {r.waitingFreeze && <span className="small muted row" style={{ gap: 4 }}><Icon name="snow" size={16} /> Freeze ready</span>}
            </div>
            <div className="stat-pair" style={{ marginBottom: 12 }}>
              <div><b className="num">{r.current} <small className="small">{unit(r.current)}</small></b><span className="muted small">current</span></div>
              <div><b className="num">{r.best} <small className="small">{unit(r.best)}</small></b><span className="muted small">best</span></div>
            </div>
            <Heatmap r={r} today={report.today} />
          </section>
        );
      })}
      <div className="legend">
        <span><i className="heat-key" style={{ background: 'var(--accent)' }} />Done</span>
        <span><i className="heat-key" style={{ background: 'var(--bad-tint)' }} />Missed</span>
        <span><i className="heat-key" style={{ background: 'repeating-linear-gradient(135deg, color-mix(in srgb, var(--ink) 22%, transparent) 0 2px, transparent 2px 4px)' }} />Rest</span>
        <span><i className="heat-key" style={{ background: 'var(--ice-tint)', boxShadow: 'inset 0 0 0 1px var(--ice)' }} />Freeze</span>
      </div>
    </div>
  );
}
