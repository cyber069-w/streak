/** Week: Mon–Sun per habit, which held and which slipped, Koban earned and spent; arrows to earlier weeks. */
import { useState } from 'react';
import { addDays, weekStart, type Day } from '../core/day';
import { useApp, useReport } from '../core/store';
import { weekSummary, type HabitWeek } from '../core/week';
import { Icon } from '../components/Icon';
import { EmptyState, HabitIcon, PageHead, SectionHead } from '../components/ui';

const short = (day: Day) => new Date(`${day}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const HEAD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
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

  const verdict = (list: typeof held, empty: string, detail: (h: (typeof held)[number]) => string) =>
    list.length ? (
      <ul className="history">
        {list.map((h) => <li key={h.id}><HabitIcon habit={h} className="sm" size={16} /><span className="grow">{h.name}</span><span className="faint small">{detail(h)}</span></li>)}
      </ul>
    ) : <p className="faint small">{empty}</p>;

  return (
    <div className="page">
      <PageHead
        eyebrow={`${short(week)} – ${short(addDays(week, 6))}`}
        title={week === current ? 'This week' : week === addDays(current, -7) ? 'Last week' : 'Week'}
        sub={rate(prev) !== null && rate(w) !== null ? `${rate(w)}% done – last week ${rate(prev)}%.` : rate(w) !== null ? `${rate(w)}% done.` : undefined}
        actions={<>
          <button className="icon-btn" disabled={week <= weekStart(first)} onClick={() => setWeek(addDays(week, -7))} aria-label="Previous week"><Icon name="left" /></button>
          <button className="icon-btn" disabled={week >= current} onClick={() => setWeek(addDays(week, 7))} aria-label="Next week"><Icon name="right" /></button>
        </>}
      />

      <div className="stat-tiles">
        <div className="card tile"><div className="tile-value num">{w.done}/{w.due}</div><div className="tile-label">habits done</div></div>
        <div className="card tile"><div className="tile-value">{w.perfect === 'yes' ? 'Yes' : w.perfect === 'possible' ? 'Possible' : 'No'}</div><div className="tile-label">perfect week</div></div>
        <div className="card tile"><div className="tile-value num">+{w.earned}</div><div className="tile-label">Koban earned</div></div>
        <div className="card tile"><div className="tile-value num">−{w.spent}</div><div className="tile-label">Koban spent</div></div>
      </div>

      <section className="section">
        <SectionHead title="Day by day" />
        <div className="card card-pad">
          <div className="wk-grid" role="table" aria-label="Habits this week">
            <div className="wk-row wk-head" role="row">
              <span role="columnheader" />
              {HEAD.map((d, i) => {
                const day = addDays(week, i);
                return <span key={i} role="columnheader" className={day === report.today ? 'today' : ''}><i className="wd-long">{d}</i><i className="wd-short">{d[0]}</i><b>{Number(day.slice(8))}</b></span>;
              })}
              <span role="columnheader" className="wk-total">Done</span>
            </div>
            {w.habits.map((h) => (
              <div key={h.id} className="wk-row" role="row">
                <span role="rowheader" className="wk-name" title={h.name} aria-label={h.name}><HabitIcon habit={h} size={15} /><span>{h.name}</span></span>
                {h.days.map((d) => <span key={d.day} role="cell"><Cell status={d.status} /></span>)}
                <span role="cell" className={`wk-total num${h.verdict === 'slipped' ? ' bad' : h.verdict === 'held' ? ' good' : ''}`}>{h.done}/{h.due}</span>
              </div>
            ))}
          </div>
          {!w.habits.length && <EmptyState icon="week" title="Nothing tracked this week" />}
        </div>
      </section>

      <section className="section verdicts">
        <div>
          <SectionHead title="Held" />
          <div className="card card-pad">{verdict(held, week === current ? 'Nothing finished yet – the week is still running.' : 'Nothing held this week.', (h) => (h.unit === 'weeks' ? `${h.done} of ${h.due}` : `${h.done} days`))}</div>
        </div>
        <div>
          <SectionHead title="Slipped" />
          <div className="card card-pad">{verdict(slipped, 'Nothing – well done.', (h) => (h.unit === 'weeks' ? `${h.done} of ${h.due}` : `${h.days.filter((d) => d.status === 'missed' || d.status === 'frozen').length} missed`))}</div>
        </div>
      </section>
    </div>
  );
}
