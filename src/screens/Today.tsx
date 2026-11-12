/** Today: Koban and level, then one row per habit – one tap ticks it off. */
import { useEffect, useRef, useState } from 'react';
import { addDays, type Day } from '../core/day';
import { rowInfo, type RowInfo } from '../core/describe';
import { versionAt, type HabitReport, type Report } from '../core/engine';
import { addMark, factsOf, getState, toggleTick, useApp, useReport } from '../core/store';
import { Icon } from '../components/Icon';
import { MeditationTimer } from '../components/MeditationTimer';
import { EmptyState, HabitIcon, PageHead, Seg } from '../components/ui';
import { weekSummary } from '../core/week';
import { weekStart } from '../core/day';
import { Sheet } from '../components/Sheet';

const dateLabel = (day: Day) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' });

function greeting(h: number) {
  if (h < 5) return 'Good night';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

/** This week at a glance: one small column per day (done of due), Koban earned, perfect-week status. */
function WeekStrip() {
  const report = useReport();
  const { purchases, settings } = useApp();
  const w = weekSummary(report, purchases, weekStart(report.today), settings.rules.tz);
  const days = Array.from({ length: 7 }, (_, i) => {
    const day = addDays(w.week, i);
    let done = 0, due = 0;
    for (const h of w.habits) {
      if (h.unit === 'weeks') continue;
      const s = h.days[i].status;
      if (s === 'done') { done++; due++; } else if (['missed', 'frozen', 'pending', 'future'].includes(s)) due++;
    }
    return { day, done, due, future: day > report.today, today: day === report.today };
  });
  return (
    <div className="stack" style={{ ['--gap' as string]: '12px' }}>
      <div className="week-mini" role="list" aria-label="This week by day">
        {days.map((d, i) => (
          <div key={d.day} role="listitem" className={`wm-day${d.today ? ' today' : ''}${d.future ? ' future' : ''}`} title={`${d.done} of ${d.due} done`}>
            <span className="wm-track"><i style={{ height: `${d.due ? (d.done / d.due) * 100 : 0}%` }} /></span>
            <span className="wm-label">{'MTWTFSS'[i]}</span>
          </div>
        ))}
      </div>
      <div className="split-line">
        <span><b className="num">{w.done}</b><span className="faint"> of {w.due} done</span></span>
        <span className="pill">+{w.earned} Koban</span>
      </div>
      <span className="faint tiny">{w.perfect === 'yes' ? 'Perfect week!' : w.perfect === 'possible' ? 'A perfect week is still possible (+75 Koban).' : 'No perfect week this time.'}</span>
    </div>
  );
}

/** Morning habits first before noon, evening habits first from 6 pm. */
function ordered(habits: HabitReport[]): HabitReport[] {
  const h = new Date().getHours();
  const first = h < 12 ? 'morning' : h >= 18 ? 'evening' : null;
  return [...habits].sort((a, b) => Number(b.habit.timeOfDay === first) - Number(a.habit.timeOfDay === first) || a.habit.order - b.habit.order);
}

export function KobanCard({ report }: { report: Report }) {
  const { level, from, to } = report.level;
  const pct = Math.min(100, ((report.xp - from) / (to - from)) * 100);
  const [pop, setPop] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const seen = useRef<{ level: number; bonus: Set<string> } | null>(null);

  // a small pop for milestones, perfect weeks and level-ups only – never for an ordinary tick
  useEffect(() => {
    const bonus = new Set(report.earnings.filter((e) => e.kind !== 'habit').map((e) => e.id));
    const prev = seen.current;
    seen.current = { level, bonus };
    if (!prev) return;
    const fresh = report.earnings.find((e) => e.kind !== 'habit' && !prev.bonus.has(e.id) && e.day >= addDays(report.today, -1));
    const msg = level > prev.level ? `Level ${level}!` : fresh ? `${fresh.label} +${fresh.amount}` : null;
    if (!msg) return;
    setPop(true);
    setToast(msg);
    const id = setTimeout(() => { setPop(false); setToast(null); }, 2600);
    return () => clearTimeout(id);
  }, [report, level]);

  return (
    <section className="glass purse">
      <div className="purse-head">
        <span className={`coin${pop ? ' pop' : ''}`}><Icon name="coin" size={26} /></span>
        <div className="grow">
          <div className="eyebrow">Koban</div>
          <div className="balance num">{report.balance}</div>
        </div>
        <span className="level-badge" aria-label={`Level ${level}`}><small>Level</small>{level}</span>
      </div>
      <div className="bar" aria-label={`${report.xp - from} of ${to - from} XP to level ${level + 1}`}><i style={{ width: `${pct}%` }} /></div>
      <div className="split-line tiny">
        <span className="faint">{toast ?? `${report.xp - from} / ${to - from} XP`}</span>
        <span className="faint">Level {level + 1} at {to} XP</span>
      </div>
    </section>
  );
}

export function TypingEntry({ habitId, day, onClose }: { habitId: string; day: Day; onClose: () => void }) {
  const [wpm, setWpm] = useState('');
  const [acc, setAcc] = useState('');
  const ok = Number(wpm) > 0 && Number(acc) > 0 && Number(acc) <= 100;
  const save = async () => {
    await addMark({ id: `${habitId}:${day}:typing`, habitId, day, createdAt: Date.now(), source: 'typing', wpm: Math.round(Number(wpm)), acc: Number(acc) });
    onClose();
  };
  return (
    <Sheet title="Typing – enter by hand" onClose={onClose}>
      <div className="stack">
        <p className="muted small">If Monkeytype hasn’t synced (or you typed elsewhere), enter today’s result.</p>
        <div className="fields">
          <label className="field">WPM<input inputMode="numeric" value={wpm} onChange={(e) => setWpm(e.target.value)} autoFocus /></label>
          <label className="field">Accuracy %<input inputMode="decimal" value={acc} onChange={(e) => setAcc(e.target.value)} /></label>
        </div>
        <div><button className="btn btn-primary" disabled={!ok} onClick={save}>Save</button></div>
      </div>
    </Sheet>
  );
}

type Open = { kind: 'timer' | 'typing' | 'auto'; r: HabitReport; info: RowInfo } | null;

export function Today() {
  const state = useApp();
  const report = useReport();
  const [which, setWhich] = useState<'today' | 'yesterday'>('today');
  const [open, setOpen] = useState<Open>(null);
  if (!state.ready) return <div className="page" />;
  const tz = state.settings.rules.tz;
  const day = which === 'today' ? report.today : addDays(report.today, -1);
  const facts = factsOf(getState());

  const rows = ordered(report.habits)
    .map((r) => ({ r, info: rowInfo(r, day, facts, tz) }))
    .filter((x): x is { r: HabitReport; info: RowInfo } => !!x.info);
  const due = rows.filter((x) => x.info.status !== 'rest');
  const rest = rows.filter((x) => x.info.status === 'rest');
  const doneCount = due.filter((x) => x.info.status === 'done').length;

  const tap = (r: HabitReport, info: RowInfo) => {
    if (info.markId || (info.status !== 'done' && info.mode === 'manual')) return void toggleTick(r.habit.id, day);
    if (info.status === 'done') return; // done automatically – nothing to undo
    if (info.mode === 'timer' && which === 'today') return setOpen({ kind: 'timer', r, info });
    if (info.mode === 'typing') return setOpen({ kind: 'typing', r, info });
    setOpen({ kind: 'auto', r, info });
  };

  const best = report.habits.reduce((m, r) => (r.unit === 'days' && r.current > m.n ? { n: r.current, name: r.habit.name } : m), { n: 0, name: '' });
  const date = new Date(`${report.today}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

  return (
    <div className="page">
      <PageHead
        eyebrow={date}
        title={greeting(new Date().getHours())}
        sub={`${doneCount} of ${due.length} done ${which === 'today' ? 'today' : 'yesterday'}${best.n >= 2 ? ` · longest streak: ${best.name}, ${best.n} days` : ''}`}
      />
      <div className="today-grid">
        <section className="glass today-main">
          <div className="glass-head">
            <h2>{which === 'today' ? 'Habits' : `Yesterday · ${dateLabel(day)}`}</h2>
            <Seg label="Day" value={which} options={[['today', 'Today'], ['yesterday', 'Yesterday']]} onChange={setWhich} />
          </div>
          <ul className="habits">
            {due.map(({ r, info }) => {
              const done = info.status === 'done';
              const auto = done && !info.markId;
              return (
                <li key={r.habit.id} className={`habit${done ? ' done' : ''}`}>
                  <HabitIcon habit={r.habit} />
                  <div className="habit-main">
                    <div className="habit-name">
                      {r.habit.name}
                      <span className={`streak-n${info.hot ? ' hot' : ''}`} title={`Streak: ${info.streak}`}><Icon name="flame" size={15} />{info.streak}</span>
                    </div>
                    <div className="habit-sub">{info.status === 'frozen' ? 'Covered by a freeze' : info.status === 'missed' ? `Missed · ${info.sub}` : info.sub}</div>
                  </div>
                  <button
                    className={`tick${done ? ' on' : ''}${!done && info.mode === 'auto' ? ' auto' : ''}${auto ? ' locked' : ''}`}
                    onClick={() => tap(r, info)}
                    aria-pressed={done}
                    aria-label={`${r.habit.name}: ${done ? 'done' : 'not done'}`}
                  >
                    {done ? <Icon name="check" size={24} stroke={2.4} /> : info.mode === 'timer' ? <Icon name="play" size={20} /> : info.mode === 'typing' ? <Icon name="pen" size={18} /> : info.mode === 'auto' ? <Icon name="info" size={20} /> : null}
                  </button>
                </li>
              );
            })}
          </ul>
          {!due.length && <EmptyState icon="moon" title="Nothing due" hint="Every habit rests today." />}
          {rest.length > 0 && <p className="rest-note">Rest day: {rest.map((x) => x.r.habit.name).join(', ')}</p>}
        </section>
        <div className="today-koban"><KobanCard report={report} /></div>
        <section className="glass today-week">
          <div className="glass-head"><h2>This week</h2><a className="small" href="#/week">Review →</a></div>
          <WeekStrip />
        </section>
      </div>

      {open?.kind === 'timer' && (() => {
        const v = versionAt(open.r.habit, day, tz)!;
        const src = v.sources.find((s) => s.kind === 'timer');
        return <MeditationTimer habitId={open.r.habit.id} name={open.r.habit.name} minutes={src?.kind === 'timer' ? src.minutes : 10} onClose={() => setOpen(null)} />;
      })()}
      {open?.kind === 'typing' && <TypingEntry habitId={open.r.habit.id} day={day} onClose={() => setOpen(null)} />}
      {open?.kind === 'auto' && (
        <Sheet title={open.r.habit.name} onClose={() => setOpen(null)}>
          <div className="stack">
            {open.info.mode === 'timer' ? (
              <p>Meditation is completed by the timer, on the day itself.</p>
            ) : (
              <>
                <p>This one ticks itself from Study Desk.</p>
                <p className="muted">So far: {open.info.sub}</p>
                <p className="muted small">Study Desk syncs about 20 s after you study and when you leave it, so it can take a minute to show up here.</p>
              </>
            )}
          </div>
        </Sheet>
      )}
    </div>
  );
}
