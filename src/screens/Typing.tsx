/** Typing: Monkeytype results – where you are, progress to the goal, weekly best, practice per day. */
import { useEffect, useState } from 'react';
import { dayOf } from '../core/day';
import { typingStats } from '../core/monkeytype';
import { factsOf, getState, useApp } from '../core/store';
import { refreshTyping, useTypingStatus } from '../core/typingSync';
import { BarChart, ChartTable, LineChart } from '../components/Charts';
import { Icon } from '../components/Icon';
import { navigate } from '../lib/router';
import { TypingEntry } from './Today';

const short = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const time = (ms: number) => new Date(ms).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export function Typing() {
  const state = useApp();
  const st = useTypingStatus();
  const [entry, setEntry] = useState(false);
  useEffect(() => void refreshTyping(), []);
  if (!state.ready) return <div className="page" />;
  const tz = state.settings.rules.tz;
  const { wpmGoal: goal, wpmStart: start } = state.settings;
  const s = typingStats(factsOf(getState()).typing, state.marks, Date.now(), tz);
  const now = s.recentWpm;
  const pct = now === null ? 0 : Math.max(0, Math.min(100, ((now - start) / (goal - start)) * 100));
  const typingHabit = state.habits.find((h) => !h.archivedDay && h.versions.some((v) => v.sources.some((x) => x.kind === 'monkeytype')));

  return (
    <div className="page stack">
      <header className="page-head">
        <h1>Typing</h1>
        {state.settings.apeKey && (
          <button className="btn small" onClick={() => void refreshTyping(true)} disabled={st.busy || st.left <= 0}>
            <Icon name="refresh" size={16} /> {st.busy ? 'Loading…' : 'Refresh'}
          </button>
        )}
      </header>

      {!state.settings.apeKey && (
        <section className="glass stack">
          <p>Connect Monkeytype to see your results here and tick Typing automatically.</p>
          <div><button className="btn primary" onClick={() => navigate('/settings')}>Add ApeKey in Settings</button></div>
        </section>
      )}
      {state.settings.apeKey && (
        <p className="muted small" style={{ marginTop: -8 }}>
          {st.error ? <span style={{ color: 'var(--bad)' }}>{st.error} </span> : st.at ? `Checked ${time(st.at)}${st.added ? ` · ${st.added} new` : ''} · ` : ''}
          {st.left} of 10 checks left today on this device
        </p>
      )}

      <section className="glass">
        <div className="tiles">
          <div><b className="num">{now ?? '–'}</b><span>WPM now <i>(last 10)</i></span></div>
          <div><b className="num">{s.recentAcc ?? '–'}{s.recentAcc !== null ? '%' : ''}</b><span>accuracy</span></div>
          <div><b className="num">{s.best7 ?? '–'}</b><span>best, 7 days</span></div>
          <div><b className="num">{s.bestEver ?? '–'}</b><span>best ever</span></div>
        </div>
        <div className="row small" style={{ marginTop: 14 }}>
          <span className="muted num">{start}</span>
          <div className="bar grow" aria-label={`Progress from ${start} to ${goal} WPM`}><i style={{ width: `${pct}%` }} /></div>
          <span className="num" style={{ fontWeight: 600 }}>{goal} WPM</span>
        </div>
        <p className="muted small" style={{ marginTop: 4 }}>{now === null ? 'No tests yet.' : now >= goal ? 'Goal reached!' : `${Math.round((goal - now) * 10) / 10} WPM to go`}</p>
      </section>

      <section className="glass">
        <div className="glass-head"><h2>Best WPM per week</h2></div>
        <LineChart
          label={`Best WPM per week, last 12 weeks, goal ${goal}`} unit="WPM" goal={goal}
          points={s.weekly.map((w) => ({ label: `Week of ${short(w.week)}`, short: short(w.week), value: w.best }))}
        />
        <ChartTable head={['Week of', 'Best WPM']} rows={s.weekly.map((w) => [short(w.week), w.best === null ? '–' : String(w.best)])} />
      </section>

      <section className="glass">
        <div className="glass-head"><h2>Minutes typed per day</h2></div>
        <BarChart label="Minutes typed per day, last 14 days" unit="min" bars={s.daily.map((d) => ({ label: short(d.day), short: short(d.day), value: d.minutes, note: `${d.tests} tests` }))} />
        <ChartTable head={['Day', 'Minutes · tests']} rows={s.daily.map((d) => [short(d.day), `${d.minutes} · ${d.tests}`])} />
      </section>

      <section className="glass">
        <div className="glass-head">
          <h2>Latest tests</h2>
          {typingHabit && <button className="btn small" onClick={() => setEntry(true)}><Icon name="pen" size={16} /> Enter by hand</button>}
        </div>
        {s.points.length ? (
          <ul className="history">
            {[...s.points].reverse().slice(0, 10).map((p) => (
              <li key={`${p.ts}${p.manual ? 'm' : ''}`}>
                <span className="grow">{p.mode || 'test'}<span className="muted small" style={{ display: 'block' }}>{time(p.ts)}</span></span>
                <span className="num"><b>{p.wpm}</b> WPM · {p.acc}%</span>
              </li>
            ))}
          </ul>
        ) : <p className="muted small">Nothing yet.</p>}
      </section>
      {entry && typingHabit && <TypingEntry habitId={typingHabit.id} day={dayOf(Date.now(), tz)} onClose={() => setEntry(false)} />}
    </div>
  );
}
