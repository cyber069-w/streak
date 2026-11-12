/** Typing: Monkeytype results – where you are, progress to the goal, weekly best, practice per day. */
import { useEffect, useState } from 'react';
import { dayOf } from '../core/day';
import { typingStats } from '../core/monkeytype';
import { factsOf, getState, useApp } from '../core/store';
import { refreshTyping, useTypingStatus } from '../core/typingSync';
import { BarChart, ChartTable, LineChart } from '../components/Charts';
import { Icon } from '../components/Icon';
import { EmptyState, PageHead, SectionHead } from '../components/ui';
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

  const status = !state.settings.apeKey
    ? 'Monkeytype is not connected yet.'
    : `${st.error ? `${st.error} ` : st.at ? `Checked ${time(st.at)}${st.added ? ` · ${st.added} new` : ''} · ` : ''}${st.left} of 10 checks left today on this device`;

  return (
    <div className="page">
      <PageHead
        eyebrow="Monkeytype"
        title="Typing"
        sub={status}
        actions={state.settings.apeKey ? (
          <button className="btn btn-sm" onClick={() => void refreshTyping(true)} disabled={st.busy || st.left <= 0}>
            <Icon name="refresh" size={16} /> {st.busy ? 'Loading…' : 'Refresh'}
          </button>
        ) : (
          <button className="btn btn-sm btn-primary" onClick={() => navigate('/settings')}><Icon name="key" size={16} /> Add ApeKey</button>
        )}
      />

      <div className="stat-tiles">
        <div className="card tile"><div className="tile-icon"><Icon name="keyboard" size={18} /></div><div className="tile-value num">{now ?? '–'}</div><div className="tile-label">WPM now (last 10 tests)</div></div>
        <div className="card tile"><div className="tile-icon"><Icon name="check" size={18} /></div><div className="tile-value num">{s.recentAcc ?? '–'}{s.recentAcc !== null ? '%' : ''}</div><div className="tile-label">accuracy</div></div>
        <div className="card tile"><div className="tile-icon"><Icon name="flame" size={18} /></div><div className="tile-value num">{s.best7 ?? '–'}</div><div className="tile-label">best WPM, 7 days</div></div>
        <div className="card tile"><div className="tile-icon"><Icon name="trophy" size={18} /></div><div className="tile-value num">{s.bestEver ?? '–'}</div><div className="tile-label">best ever</div></div>
      </div>

      <section className="section">
        <SectionHead title={`Goal: ${goal} WPM`} meta={now === null ? 'no tests yet' : now >= goal ? 'reached!' : `${Math.round((goal - now) * 10) / 10} WPM to go`} />
        <div className="card card-pad">
          <div className="goal-row" style={{ marginTop: 0 }}>
            <span className="faint num">{start}</span>
            <div className="bar" aria-label={`Progress from ${start} to ${goal} WPM`}><i style={{ width: `${pct}%` }} /></div>
            <b className="num">{goal}</b>
          </div>
        </div>
      </section>

      <section className="section">
        <SectionHead title="Best WPM per week" meta="last 12 weeks" />
        <div className="card card-pad">
          <LineChart
            label={`Best WPM per week, last 12 weeks, goal ${goal}`} unit="WPM" goal={goal}
            points={s.weekly.map((w) => ({ label: `Week of ${short(w.week)}`, short: short(w.week), value: w.best }))}
          />
          <ChartTable head={['Week of', 'Best WPM']} rows={s.weekly.map((w) => [short(w.week), w.best === null ? '–' : String(w.best)])} />
        </div>
      </section>

      <section className="section">
        <SectionHead title="Minutes typed per day" meta="last 14 days" />
        <div className="card card-pad">
          <BarChart label="Minutes typed per day, last 14 days" unit="min" bars={s.daily.map((d) => ({ label: short(d.day), short: short(d.day), value: d.minutes, note: `${d.tests} tests` }))} />
          <ChartTable head={['Day', 'Minutes · tests']} rows={s.daily.map((d) => [short(d.day), `${d.minutes} · ${d.tests}`])} />
        </div>
      </section>

      <section className="section">
        <SectionHead title="Latest tests" action={typingHabit && <button className="btn btn-sm" onClick={() => setEntry(true)}><Icon name="pen" size={16} /> Enter by hand</button>} />
        <div className="card card-pad">
          {s.points.length ? (
            <ul className="history">
              {[...s.points].reverse().slice(0, 10).map((p) => (
                <li key={`${p.ts}${p.manual ? 'm' : ''}`}>
                  <span className="grow">{p.mode || 'test'}<small>{time(p.ts)}</small></span>
                  <span className="num"><b>{p.wpm}</b> WPM · {p.acc}%</span>
                </li>
              ))}
            </ul>
          ) : <EmptyState icon="keyboard" title="No tests yet" hint="Type a few tests on Monkeytype – they show up here after the next check." />}
        </div>
      </section>
      {entry && typingHabit && <TypingEntry habitId={typingHabit.id} day={dayOf(Date.now(), tz)} onClose={() => setEntry(false)} />}
    </div>
  );
}
