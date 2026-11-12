/**
 * The meditation timer. Kept as timestamps on this device, so it survives reloads and a locked phone:
 * if you come back after the time is up, the session still counts. The chime only plays while the app is
 * open (a web app can't wake itself), so the screen is kept awake while it runs.
 */
import { useEffect, useRef, useState } from 'react';
import { dayOf } from '../core/day';
import { addMark, getState, initStore } from '../core/store';
import { chime, primeAudio } from '../lib/chime';
import { Icon } from './Icon';
import { Sheet } from './Sheet';

interface TimerState { habitId: string; minutes: number; startedAt: number | null; elapsedBefore: number }
const KEY = 'streak:timer';
const load = (): TimerState | null => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? 'null') as TimerState | null;
  } catch {
    return null;
  }
};
const save = (t: TimerState | null) => {
  try {
    if (t) localStorage.setItem(KEY, JSON.stringify(t));
    else localStorage.removeItem(KEY);
  } catch { /* private mode: the timer just isn't kept across reloads */ }
};

const elapsed = (t: TimerState, now: number) => t.elapsedBefore + (t.startedAt ? now - t.startedAt : 0);
const fmt = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

async function finish(t: TimerState, at: number) {
  save(null);
  await initStore();
  const day = dayOf(at, getState().settings.rules.tz);
  await addMark({ id: `${t.habitId}:${day}:timer`, habitId: t.habitId, day, createdAt: at, source: 'timer', minutes: t.minutes });
}

/** Call once on start: a timer that ran out while the app was closed still counts. */
export function settleTimer() {
  const t = load();
  if (t?.startedAt && elapsed(t, Date.now()) >= t.minutes * 60_000) void finish(t, t.startedAt + (t.minutes * 60_000 - t.elapsedBefore));
}

export function MeditationTimer({ habitId, name, minutes, onClose }: { habitId: string; name: string; minutes: number; onClose: () => void }) {
  const [t, setT] = useState<TimerState>(() => {
    const saved = load();
    return saved?.habitId === habitId ? saved : { habitId, minutes, startedAt: null, elapsedBefore: 0 };
  });
  const [now, setNow] = useState(Date.now());
  const [done, setDone] = useState(false);
  const lock = useRef<WakeLockSentinel | null>(null);
  const total = t.minutes * 60_000;
  const left = total - elapsed(t, now);
  const running = t.startedAt !== null;

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    const keepAwake = async () => {
      try {
        lock.current = await navigator.wakeLock?.request('screen');
      } catch { /* not allowed – fine */ }
    };
    void keepAwake();
    const onVisible = () => document.visibilityState === 'visible' && void keepAwake();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      void lock.current?.release().catch(() => {});
      lock.current = null;
    };
  }, [running]);

  useEffect(() => {
    if (running && left <= 0 && !done) {
      setDone(true);
      chime();
      const end = t.startedAt! + (total - t.elapsedBefore);
      setT({ ...t, startedAt: null, elapsedBefore: total });
      void finish(t, end);
    }
  }, [running, left, done, t, total]);

  const update = (next: TimerState) => {
    setT(next);
    save(next.startedAt || next.elapsedBefore ? next : null);
  };
  const start = () => {
    primeAudio();
    setNow(Date.now());
    update({ ...t, startedAt: Date.now() });
  };
  const pause = () => update({ ...t, startedAt: null, elapsedBefore: elapsed(t, Date.now()) });
  const reset = () => update({ ...t, startedAt: null, elapsedBefore: 0 });

  const r = 100;
  const c = 2 * Math.PI * r;
  const frac = Math.min(1, Math.max(0, 1 - left / total));
  return (
    <Sheet title={name} onClose={onClose}>
      <div className="timer">
        <svg viewBox="0 0 240 240" aria-hidden="true">
          <circle cx="120" cy="120" r={r} fill="none" stroke="var(--track)" strokeWidth="10" />
          <circle
            cx="120" cy="120" r={r} fill="none" stroke="var(--accent)" strokeWidth="10" strokeLinecap="round"
            strokeDasharray={c} strokeDashoffset={c * (1 - frac)} transform="rotate(-90 120 120)" style={{ transition: 'stroke-dashoffset 0.25s linear' }}
          />
        </svg>
        <div className="time num" aria-live="polite">{done ? 'Done' : fmt(left)}</div>
        {done ? (
          <>
            <p className="muted">Nice. Meditation is ticked off for today.</p>
            <button className="btn btn-primary" onClick={onClose}>Close</button>
          </>
        ) : (
          <div className="row">
            {running ? (
              <button className="btn" onClick={pause}><Icon name="pause" /> Pause</button>
            ) : (
              <button className="btn btn-primary" onClick={start}><Icon name="play" /> {t.elapsedBefore ? 'Resume' : 'Start'}</button>
            )}
            {t.elapsedBefore > 0 && !running && <button className="btn" onClick={reset}>Reset</button>}
          </div>
        )}
        <p className="muted small" style={{ textAlign: 'center' }}>
          The screen stays on while the timer runs. The chime only plays while Streak is open; if you lock the phone, the session still counts.
        </p>
      </div>
    </Sheet>
  );
}
