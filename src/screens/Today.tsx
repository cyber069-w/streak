/** Today: Koban and level, then one row per habit – one tap ticks it off. */
import { useEffect, useRef, useState } from 'react';
import { addDays, type Day } from '../core/day';
import { rowInfo, type RowInfo } from '../core/describe';
import { versionAt, type HabitReport, type Report } from '../core/engine';
import { addMark, factsOf, getState, toggleTick, useApp, useReport } from '../core/store';
import { Icon } from '../components/Icon';
import { MeditationTimer } from '../components/MeditationTimer';
import { Sheet } from '../components/Sheet';
import { navigate } from '../lib/router';

const dateLabel = (day: Day) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' });

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
    <div className="glass purse">
      <span className={`coin${pop ? ' pop' : ''}`}><Icon name="coin" size={26} /></span>
      <div className="grow">
        <div className="row" style={{ alignItems: 'baseline' }}>
          <span className="balance num">{report.balance}</span>
          <span className="muted small">Koban</span>
          <span className="grow" />
          <span className="small" style={{ fontWeight: 600 }}>Level {level}</span>
        </div>
        <div className="bar" style={{ marginTop: 8 }} aria-label={`${report.xp - from} of ${to - from} XP to level ${level + 1}`}><i style={{ width: `${pct}%` }} /></div>
        <div className="muted small" style={{ marginTop: 4 }}>{toast ?? `${report.xp} XP · ${to - report.xp} to level ${level + 1}`}</div>
      </div>
    </div>
  );
}

function TypingEntry({ habitId, day, onClose }: { habitId: string; day: Day; onClose: () => void }) {
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
        <div className="row">
          <label className="field grow">WPM<input inputMode="numeric" value={wpm} onChange={(e) => setWpm(e.target.value)} autoFocus /></label>
          <label className="field grow">Accuracy %<input inputMode="decimal" value={acc} onChange={(e) => setAcc(e.target.value)} /></label>
        </div>
        <button className="btn primary" disabled={!ok} onClick={save}>Save</button>
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

  return (
    <div className="page stack">
      <header className="page-head">
        <h1>{which === 'today' ? 'Today' : 'Yesterday'}</h1>
        <button className="icon-btn" onClick={() => navigate('/settings')} aria-label="Settings"><Icon name="settings" /></button>
      </header>
      <KobanCard report={report} />
      <section className="glass">
        <div className="glass-head">
          <h2>{dateLabel(day)}</h2>
          <span className="muted small num">{doneCount} / {due.length}</span>
        </div>
        <div className="seg" style={{ marginBottom: 6 }}>
          <button className={which === 'today' ? 'on' : ''} onClick={() => setWhich('today')}>Today</button>
          <button className={which === 'yesterday' ? 'on' : ''} onClick={() => setWhich('yesterday')}>Fix yesterday</button>
        </div>
        <ul className="habits">
          {due.map(({ r, info }) => {
            const done = info.status === 'done';
            const auto = done && !info.markId;
            return (
              <li key={r.habit.id} className={`habit${done ? ' done' : ''}`}>
                <span className="habit-icon"><Icon name={r.habit.icon} size={22} /></span>
                <div className="grow">
                  <div className="row" style={{ gap: 8 }}>
                    <span className="habit-name">{r.habit.name}</span>
                    <span className={`streak-n${info.hot ? ' hot' : ''}`}><Icon name="flame" size={15} />{info.streak}</span>
                  </div>
                  <div className="habit-sub">{info.status === 'frozen' ? 'Covered by a freeze' : info.status === 'missed' ? `Missed · ${info.sub}` : info.sub}</div>
                </div>
                <button
                  className={`tick${done ? ' on' : ''}${!done && info.mode === 'auto' ? ' auto' : ''}${auto ? ' locked' : ''}`}
                  onClick={() => tap(r, info)}
                  aria-pressed={done}
                  aria-label={`${r.habit.name}: ${done ? 'done' : 'not done'}`}
                >
                  {done ? <Icon name="check" size={24} stroke={2.4} /> : info.mode === 'timer' ? <Icon name="play" size={20} /> : info.mode === 'auto' ? <Icon name="info" size={20} /> : null}
                </button>
              </li>
            );
          })}
        </ul>
        {rest.length > 0 && <p className="rest-list">Rest day: {rest.map((x) => x.r.habit.name).join(', ')}</p>}
      </section>

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
