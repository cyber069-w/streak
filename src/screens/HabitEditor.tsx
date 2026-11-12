/** Settings → Habits: add, edit, reorder and archive habits. Rule changes apply from tomorrow. */
import { useState } from 'react';
import { addDays, dayOf, type Weekday } from '../core/day';
import { HABIT_COLORS, JAPANESE_MODULES, habitColor } from '../core/defaults';
import { latestRules, newHabit, withRules } from '../core/habits';
import { saveHabits, useApp } from '../core/store';
import type { Amount, Habit, HabitVersion, Schedule, Source } from '../core/types';
import { Icon } from '../components/Icon';
import { Sheet } from '../components/Sheet';
import { Section } from '../components/Section';
import { HabitIcon, Seg } from '../components/ui';

const DAYS: Array<[Weekday, string]> = [[1, 'Mo'], [2, 'Tu'], [3, 'We'], [4, 'Th'], [5, 'Fr'], [6, 'Sa'], [7, 'Su']];
const ICONS = ['meditation', 'keyboard', 'language', 'chart', 'cards', 'barbell', 'notebook', 'book', 'run', 'walk', 'code', 'music', 'bed', 'water', 'star'];
type Rules = Omit<HabitVersion, 'from' | 'savedAt'>;

function DayChips({ value, onChange }: { value: Weekday[]; onChange: (v: Weekday[]) => void }) {
  return (
    <div className="chips">
      {DAYS.map(([d, l]) => (
        <button key={d} type="button" className={`chip${value.includes(d) ? ' on' : ''}`} onClick={() => onChange(value.includes(d) ? value.filter((x) => x !== d) : [...value, d].sort())}>{l}</button>
      ))}
    </div>
  );
}

const num = (s: string, min = 0) => Math.max(min, Math.round(Number(s) || 0));
/** "Weekdays / weekends" amount editor (weekend value only stored when it differs). */
function AmountInput({ label, value, onChange }: { label: string; value: Amount; onChange: (a: Amount) => void }) {
  const weekend = value.byWeekday?.[6] ?? value.default;
  const set = (d: number, w: number) => onChange(w === d ? { default: d } : { default: d, byWeekday: { 6: w, 7: w } });
  return (
    <div className="row">
      <label className="field grow">{label} (Mon–Fri)<input inputMode="numeric" value={value.default} onChange={(e) => set(num(e.target.value), weekend === value.default ? num(e.target.value) : weekend)} /></label>
      <label className="field grow">Sat–Sun<input inputMode="numeric" value={weekend} onChange={(e) => set(value.default, num(e.target.value))} /></label>
    </div>
  );
}

function Editor({ habit, onClose }: { habit: Habit | null; onClose: () => void }) {
  const state = useApp();
  const tz = state.settings.rules.tz;
  const today = dayOf(Date.now(), tz);
  const start = habit ? latestRules(habit) : null;
  const [name, setName] = useState(habit?.name ?? '');
  const [icon, setIcon] = useState(habit?.icon ?? 'star');
  const [color, setColor] = useState(habit ? habitColor(habit) : 'blue');
  const [timeOfDay, setTimeOfDay] = useState(habit?.timeOfDay ?? '');
  const [r, setR] = useState<Rules>(() =>
    start ? { schedule: start.schedule, rest: start.rest, sources: start.sources, koban: start.koban } : { schedule: { kind: 'daily' }, rest: { weekdays: [], dates: [] }, sources: [{ kind: 'manual' }], koban: { default: 10 } },
  );
  const [newRest, setNewRest] = useState('');
  const src = <K extends Source['kind']>(k: K) => r.sources.find((s) => s.kind === k) as Extract<Source, { kind: K }> | undefined;
  const setSrc = (k: Source['kind'], s: Source | null) => setR({ ...r, sources: [...r.sources.filter((x) => x.kind !== k), ...(s ? [s] : [])] });
  const futureRest = r.rest.dates.filter((d) => d > today).sort();
  const isNew = !habit;
  const kindLocked = !!habit && habit.createdDay < today;

  const save = async () => {
    const tidy: Rules = { ...r, rest: { ...r.rest, dates: [...new Set(r.rest.dates)].sort() } };
    let list = state.habits;
    if (habit) {
      const changed = JSON.stringify(tidy) !== JSON.stringify({ schedule: start!.schedule, rest: start!.rest, sources: start!.sources, koban: start!.koban });
      const h = { ...(changed ? withRules(habit, tidy, Date.now(), tz) : habit), name: name.trim(), icon, color, ...(timeOfDay ? { timeOfDay: timeOfDay as Habit['timeOfDay'] } : { timeOfDay: undefined }) };
      list = list.map((x) => (x.id === h.id ? h : x));
    } else {
      const h = { ...newHabit(name.trim(), icon, Math.max(-1, ...list.map((x) => x.order)) + 1, tidy, Date.now(), tz), color };
      list = [...list, timeOfDay ? { ...h, timeOfDay: timeOfDay as Habit['timeOfDay'] } : h];
    }
    await saveHabits(list);
    onClose();
  };
  const archive = async () => {
    await saveHabits(state.habits.map((x) => (x.id === habit!.id ? { ...x, archivedDay: today } : x)));
    onClose();
  };

  const setSchedule = (s: Schedule) => setR({ ...r, schedule: s });
  const focus = src('studyDeskFocus');
  const reviews = src('studyDeskReviews');
  const mt = src('monkeytype');
  const timer = src('timer');
  return (
    <Sheet title={isNew ? 'New habit' : `Edit ${habit.name}`} onClose={onClose}>
      <div className="stack">
        {!isNew && <p className="muted small">Changes to schedule, rest days, sources and Koban apply from tomorrow, so today can’t be changed after the fact.</p>}
        <label className="field">Name<input value={name} onChange={(e) => setName(e.target.value)} autoFocus={isNew} /></label>
        <div className="row" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
          <HabitIcon habit={{ id: habit?.id ?? 'new', icon, color }} />
          <div className="stack grow" style={{ ['--gap' as string]: '10px' }}>
            <div className="icon-pick" role="radiogroup" aria-label="Icon">
              {ICONS.map((i) => <button key={i} type="button" className={icon === i ? 'on' : ''} onClick={() => setIcon(i)} aria-label={i} aria-checked={icon === i} role="radio"><Icon name={i} /></button>)}
            </div>
            <div className="color-pick" role="radiogroup" aria-label="Colour">
              {HABIT_COLORS.map((c) => <button key={c} type="button" className={color === c ? 'on' : ''} style={{ background: `var(--h-${c})` }} onClick={() => setColor(c)} aria-label={c} aria-checked={color === c} role="radio" />)}
            </div>
          </div>
        </div>

        <div className="sub-box">
          <b className="small">Schedule</b>
          {kindLocked ? (
            <p className="muted small">{r.schedule.kind === 'perWeek' ? 'Times per week' : 'Daily / on chosen days'} (fixed once a habit has history)</p>
          ) : (
            <Seg label="Schedule" value={r.schedule.kind} options={[['daily', 'Daily'], ['weekdays', 'Some days'], ['perWeek', '× per week']]}
              onChange={(k) => setSchedule(k === 'daily' ? { kind: 'daily' } : k === 'weekdays' ? { kind: 'weekdays', days: [1, 2, 3, 4, 5] } : { kind: 'perWeek', times: 3 })} />
          )}
          {r.schedule.kind === 'daily' && kindLocked && (
            <button className="btn btn-sm" onClick={() => setSchedule({ kind: 'weekdays', days: [1, 2, 3, 4, 5, 6, 7] })}>Only on some days</button>
          )}
          {r.schedule.kind === 'weekdays' && <DayChips value={r.schedule.days} onChange={(days) => setSchedule({ kind: 'weekdays', days })} />}
          {r.schedule.kind === 'perWeek' && (
            <label className="field">Times per week (Mon–Sun)<input inputMode="numeric" value={r.schedule.times} onChange={(e) => setSchedule({ kind: 'perWeek', times: Math.min(7, num(e.target.value, 1)) })} /></label>
          )}
          <label className="field">Show first
            <select value={timeOfDay} onChange={(e) => setTimeOfDay(e.target.value)}>
              <option value="">Any time</option>
              <option value="morning">In the morning</option>
              <option value="evening">In the evening</option>
            </select>
          </label>
        </div>

        {r.schedule.kind !== 'perWeek' && (
          <div className="sub-box">
            <b className="small">Rest days (never break the streak)</b>
            <span className="muted small">Every week on</span>
            <DayChips value={r.rest.weekdays} onChange={(weekdays) => setR({ ...r, rest: { ...r.rest, weekdays } })} />
            <label className="check">
              <input type="checkbox" checked={!!r.rest.cycle} onChange={(e) => setR({ ...r, rest: { ...r.rest, cycle: e.target.checked ? { weekday: 3, everyWeeks: 3, start: today } : undefined } })} />
              Also rest on one weekday every few weeks
            </label>
            {r.rest.cycle && (
              <div className="row" style={{ flexWrap: 'wrap' }}>
                <label className="field">Weekday
                  <select value={r.rest.cycle.weekday} onChange={(e) => setR({ ...r, rest: { ...r.rest, cycle: { ...r.rest.cycle!, weekday: Number(e.target.value) as Weekday } } })}>
                    {DAYS.map(([d, l]) => <option key={d} value={d}>{l}</option>)}
                  </select>
                </label>
                <label className="field">Every … weeks<input inputMode="numeric" value={r.rest.cycle.everyWeeks} onChange={(e) => setR({ ...r, rest: { ...r.rest, cycle: { ...r.rest.cycle!, everyWeeks: num(e.target.value, 1) } } })} /></label>
                <label className="field grow">One of those days<input type="date" value={r.rest.cycle.start} onChange={(e) => e.target.value && setR({ ...r, rest: { ...r.rest, cycle: { ...r.rest.cycle!, start: e.target.value } } })} /></label>
              </div>
            )}
            <span className="muted small">Planned single rest days (from tomorrow on)</span>
            <div className="row">
              <input className="grow" type="date" min={addDays(today, 1)} value={newRest} onChange={(e) => setNewRest(e.target.value)} style={{ minHeight: 40, borderRadius: 12, border: '1px solid var(--line-2)', background: 'transparent', padding: '6px 10px' }} />
              <button className="btn btn-sm" disabled={!newRest || newRest <= today} onClick={() => { setR({ ...r, rest: { ...r.rest, dates: [...r.rest.dates, newRest] } }); setNewRest(''); }}>Add</button>
            </div>
            {futureRest.map((d) => (
              <div key={d} className="list-row small">
                <span className="grow">{d}</span>
                <button className="icon-btn" onClick={() => setR({ ...r, rest: { ...r.rest, dates: r.rest.dates.filter((x) => x !== d) } })} aria-label={`Remove ${d}`}><Icon name="x" size={16} /></button>
              </div>
            ))}
          </div>
        )}

        <div className="sub-box">
          <b className="small">Done when …</b>
          <label className="check"><input type="checkbox" checked={!!src('manual')} onChange={(e) => setSrc('manual', e.target.checked ? { kind: 'manual' } : null)} />I tick it by hand</label>
          <label className="check"><input type="checkbox" checked={!!focus} onChange={(e) => setSrc('studyDeskFocus', e.target.checked ? { kind: 'studyDeskFocus', subjects: [name.trim() || 'CFA'], lectures: false, minMinutes: { default: 15 } } : null)} />Study Desk focus time</label>
          {focus && (
            <>
              <label className="field">Study Desk subjects (comma-separated, as named there)<input value={focus.subjects.join(', ')} onChange={(e) => setSrc('studyDeskFocus', { ...focus, subjects: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} /></label>
              <AmountInput label="Minutes" value={focus.minMinutes} onChange={(minMinutes) => setSrc('studyDeskFocus', { ...focus, minMinutes })} />
              <label className="check"><input type="checkbox" checked={focus.lectures} onChange={(e) => setSrc('studyDeskFocus', { ...focus, lectures: e.target.checked })} />Lectures count too</label>
            </>
          )}
          <label className="check"><input type="checkbox" checked={!!reviews} onChange={(e) => setSrc('studyDeskReviews', e.target.checked ? { kind: 'studyDeskReviews', modules: JAPANESE_MODULES, minCards: 1 } : null)} />Japanese cards reviewed in Study Desk</label>
          {reviews && <label className="field">At least … cards<input inputMode="numeric" value={reviews.minCards} onChange={(e) => setSrc('studyDeskReviews', { ...reviews, minCards: num(e.target.value, 1) })} /></label>}
          <label className="check"><input type="checkbox" checked={!!mt} onChange={(e) => setSrc('monkeytype', e.target.checked ? { kind: 'monkeytype', minMinutes: 10, minTests: 5 } : null)} />Monkeytype (with manual WPM entry)</label>
          {mt && (
            <div className="row">
              <label className="field grow">Minutes<input inputMode="numeric" value={mt.minMinutes} onChange={(e) => setSrc('monkeytype', { ...mt, minMinutes: num(e.target.value, 1) })} /></label>
              <label className="field grow">or tests<input inputMode="numeric" value={mt.minTests} onChange={(e) => setSrc('monkeytype', { ...mt, minTests: num(e.target.value, 1) })} /></label>
            </div>
          )}
          <label className="check"><input type="checkbox" checked={!!timer} onChange={(e) => setSrc('timer', e.target.checked ? { kind: 'timer', minutes: 10 } : null)} />Timer finished</label>
          {timer && <label className="field">Timer minutes<input inputMode="numeric" value={timer.minutes} onChange={(e) => setSrc('timer', { kind: 'timer', minutes: num(e.target.value, 1) })} /></label>}
        </div>

        <div className="sub-box">
          <b className="small">Koban per completion</b>
          <AmountInput label="Koban" value={r.koban} onChange={(koban) => setR({ ...r, koban })} />
        </div>

        <div className="row">
          <button className="btn btn-primary" disabled={!name.trim() || !r.sources.length} onClick={() => void save()}>Save</button>
          {!isNew && <button className="btn" onClick={() => void archive()}><Icon name="archive" size={18} /> Archive</button>}
        </div>
        {!isNew && <p className="muted small">Archiving keeps its history and Koban; it just stops tracking it from tomorrow.</p>}
      </div>
    </Sheet>
  );
}

export function HabitsSection() {
  const { habits } = useApp();
  const [edit, setEdit] = useState<Habit | 'new' | null>(null);
  const active = habits.filter((h) => !h.archivedDay).sort((a, b) => a.order - b.order);
  const move = (i: number, d: -1 | 1) => {
    const a = active[i], b = active[i + d];
    if (!a || !b) return;
    void saveHabits(habits.map((h) => (h.id === a.id ? { ...h, order: b.order } : h.id === b.id ? { ...h, order: a.order } : h)));
  };
  return (
    <Section title="Habits" id="habits">
      <p className="muted small" style={{ margin: '4px 0 8px' }}>Tap a habit to change its schedule, rest days, how it’s completed and its Koban.</p>
      <div>
        {active.map((h, i) => (
          <div key={h.id} className="list-row">
            <HabitIcon habit={h} className="sm" size={18} />
            <button className="name" onClick={() => setEdit(h)}>{h.name}</button>
            <button className="icon-btn" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move ${h.name} up`}><Icon name="up" size={18} /></button>
            <button className="icon-btn" disabled={i === active.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${h.name} down`}><Icon name="down" size={18} /></button>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 10 }}><button className="btn btn-sm" onClick={() => setEdit('new')}><Icon name="plus" size={16} /> Add habit</button></div>
      {edit && <Editor habit={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
    </Section>
  );
}
