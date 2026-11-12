/** Week: Mon–Sun per habit, which held and which slipped, Koban earned and spent; arrows to earlier weeks. */
import { useState } from 'react';
import { addDays, weekStart, type Day } from '../core/day';
import { useApp, useReport } from '../core/store';
import { weekSummary, type HabitWeek } from '../core/week';
import { Icon } from '../components/Icon';

const short = (day: Day) => new Date(`${day}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const HEAD = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const WORD: Record<string, string> = { done: 'done', missed: 'missed', rest: 'rest day', frozen: 'freeze used', pending: 'today, open', future: 'later', none: 'not tracked', open: 'nothing' };

function Cell({ status }: { status: HabitWeek['days'][number]['status'] }) {
  const icon = status === 'done' ? 'check' : status === 'missed' ? 'x' : status === 'frozen' ? 'snow' : null;
  return <span className={`wk-cell ${status}`} title={WORD[status]} aria-label={WORD[status]}>{icon && <Icon name={icon} size={14} stroke={2.4} />}</span>;
}

export function Week() {
  const state = useApp();
  const report = useReport();
  const current = weekStart(report.today);
  const [week, setWeek] = useState<Day>(current);
  if (!state.ready) return <div className="page" />;
  const w = weekSummary(report, state.purchases, week, state.settings.rules.tz);
  const prev = weekSummary(report, state.purchases, addDays(week, -7), state.settings.rules.tz);
  const rate = (s: typeof w) => (s.due ? Math.round((s.done / s.due) * 100) : null);
  const held = w.habits.filter((h) => h.verdict === 'held');
  const slipped = w.habits.filter((h) => h.verdict === 'slipped');
  const first = report.habits.reduce((min, r) => (r.habit.createdDay < min ? r.habit.createdDay : min), report.today);

  return (
    <div className="page stack">
      <header className="page-head">
        <h1>Week</h1>
        <button className="icon-btn" disabled={week <= weekStart(first)} onClick={() => setWeek(addDays(week, -7))} aria-label="Previous week"><Icon name="left" /></button>
        <span className="small num" style={{ minWidth: 112, textAlign: 'center' }}>{short(week)} – {short(addDays(week, 6))}</span>
        <button className="icon-btn" disabled={week >= current} onClick={() => setWeek(addDays(week, 7))} aria-label="Next week"><Icon name="right" /></button>
      </header>

      <section className="glass">
        <div className="tiles">
          <div><b className="num">{w.done} / {w.due}</b><span>done{rate(w) !== null ? ` · ${rate(w)}%` : ''}{rate(prev) !== null ? ` (last week ${rate(prev)}%)` : ''}</span></div>
          <div><b style={{ fontSize: w.perfect === 'possible' ? '1.15rem' : undefined }}>{w.perfect === 'yes' ? 'Yes' : w.perfect === 'possible' ? 'Still possible' : 'No'}</b><span>perfect week</span></div>
          <div><b className="num">+{w.earned}</b><span>Koban earned</span></div>
          <div><b className="num">−{w.spent}</b><span>Koban spent</span></div>
        </div>
      </section>

      <section className="glass">
        <div className="wk-grid" role="table" aria-label="Habits this week">
          <div className="wk-row wk-head" role="row">
            <span role="columnheader" />
            {HEAD.map((d, i) => <span key={i} role="columnheader" className={addDays(week, i) === report.today ? 'today' : ''}>{d}</span>)}
            <span role="columnheader" />
          </div>
          {w.habits.map((h) => (
            <div key={h.id} className="wk-row" role="row">
              <span role="rowheader" className="wk-name"><Icon name={h.icon} size={16} /><span>{h.name}</span></span>
              {h.days.map((d) => <span key={d.day} role="cell"><Cell status={d.status} /></span>)}
              <span role="cell" className="num small muted">{h.unit === 'weeks' ? `${h.done}/${h.due}` : ''}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="glass stack">
        <div>
          <h2 style={{ marginBottom: 6 }}>Held</h2>
          <p className="small">{held.length ? held.map((h) => h.name).join(', ') : week === current ? 'Nothing finished yet – the week is still running.' : '–'}</p>
        </div>
        <div>
          <h2 style={{ marginBottom: 6 }}>Slipped</h2>
          <p className="small">
            {slipped.length
              ? slipped.map((h) => `${h.name} (${h.unit === 'weeks' ? `${h.done} of ${h.due}` : `${h.days.filter((d) => d.status === 'missed' || d.status === 'frozen').length} missed`})`).join(', ')
              : 'Nothing – well done.'}
          </p>
        </div>
      </section>
    </div>
  );
}
