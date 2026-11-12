import { describe, expect, it } from 'vitest';
import { addDays, dayOf, startOfDay, type Day } from './day';
import { evaluate, levelOf, type Report } from './engine';
import { DEFAULT_RULES, type Facts, type Habit, type HabitVersion, type Mark, type Purchase, type Source } from './types';

const rules = DEFAULT_RULES;
const noon = (d: Day) => startOfDay(d) + 12 * 3_600_000;

function habit(id: string, start: Day, p: Partial<HabitVersion> = {}, extra: Partial<Habit> = {}): Habit {
  return {
    id, name: id, icon: '', order: 0, createdDay: start,
    versions: [{ from: start, savedAt: noon(start), schedule: { kind: 'daily' }, rest: { weekdays: [], dates: [] }, sources: [{ kind: 'manual' }], koban: { default: 10 }, ...p }],
    ...extra,
  };
}

let n = 0;
/** A tick made on `day` itself (at noon unless `at` says otherwise). */
const tick = (habitId: string, day: Day, at = noon(day), source: Mark['source'] = 'manual', more: Partial<Mark> = {}): Mark => ({ id: `m${n++}`, habitId, day, createdAt: at, source, ...more });
const ticks = (habitId: string, days: Day[]) => days.map((d) => tick(habitId, d));
const freeze = (habitId: string, at: number, price = 150): Purchase => ({ id: `f${n++}`, at, price, kind: 'freeze', habitId, name: 'Freeze' });

const facts = (p: Partial<Facts>): Facts => ({ habits: [], marks: [], external: {}, typing: [], purchases: [], ...p });
const run = (p: Partial<Facts>, today: Day, now = noon(today)): Report => evaluate(facts(p), now, rules);
const h0 = (r: Report) => r.habits[0];

// Mon 2 Nov 2026 … Sun 8 Nov; Mon 9 Nov … Thu 12 Nov
const W1 = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08'];

describe('daily habits', () => {
  it('counts consecutive done days; today not done yet is pending, not a break', () => {
    const r = run({ habits: [habit('j', '2026-11-09')], marks: ticks('j', ['2026-11-09', '2026-11-10', '2026-11-11']) }, '2026-11-12');
    expect(h0(r).days['2026-11-12'].status).toBe('pending');
    expect(h0(r).current).toBe(3);
    expect(h0(r).best).toBe(3);
  });

  it('a missed day breaks the streak; best is kept', () => {
    const r = run({ habits: [habit('j', '2026-11-02')], marks: ticks('j', ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-06', '2026-11-07']) }, '2026-11-07');
    expect(h0(r).days['2026-11-05'].status).toBe('missed');
    expect(h0(r).current).toBe(2);
    expect(h0(r).best).toBe(3);
  });

  it('rest weekdays never break the streak and do not add to it', () => {
    const cfa = habit('cfa', '2026-11-06', { rest: { weekdays: [1], dates: [] } });
    const r = run({ habits: [cfa], marks: ticks('cfa', ['2026-11-06', '2026-11-07', '2026-11-08', '2026-11-10']) }, '2026-11-10');
    expect(h0(r).days['2026-11-09'].status).toBe('rest');
    expect(h0(r).current).toBe(4);
  });

  it('the cycle rest day hits every 3rd week from its start date (both directions)', () => {
    const cfa = habit('cfa', '2026-10-01', { rest: { weekdays: [], dates: [], cycle: { weekday: 3, everyWeeks: 3, start: '2026-11-04' } } });
    const r = run({ habits: [cfa] }, '2026-12-31');
    const s = (d: Day) => h0(r).days[d].status;
    expect(s('2026-11-04')).toBe('rest');
    expect(s('2026-11-11')).toBe('missed');
    expect(s('2026-11-18')).toBe('missed');
    expect(s('2026-11-25')).toBe('rest');
    expect(s('2026-10-14')).toBe('rest');
  });

  it('a weekdays schedule rests on the other days', () => {
    const r = run({ habits: [habit('x', '2026-11-02', { schedule: { kind: 'weekdays', days: [2, 4] } })], marks: ticks('x', ['2026-11-03', '2026-11-05', '2026-11-10']) }, '2026-11-11');
    expect(h0(r).days['2026-11-04'].status).toBe('rest');
    expect(h0(r).current).toBe(3);
  });

  it('planned one-off rest dates are rest', () => {
    const r = run({ habits: [habit('x', '2026-11-02', { rest: { weekdays: [], dates: ['2026-11-03'] } })], marks: ticks('x', ['2026-11-02', '2026-11-04']) }, '2026-11-04');
    expect(h0(r).days['2026-11-03'].status).toBe('rest');
    expect(h0(r).current).toBe(2);
  });

  it('doing a habit on a rest day still counts', () => {
    const r = run({ habits: [habit('x', '2026-11-02', { rest: { weekdays: [1], dates: [] } })], marks: ticks('x', ['2026-11-02']) }, '2026-11-02');
    expect(h0(r).days['2026-11-02'].status).toBe('done');
  });

  it('an archived habit stops at its last day', () => {
    const r = run({ habits: [habit('x', '2026-11-02', {}, { archivedDay: '2026-11-04' })], marks: ticks('x', W1.slice(0, 3)) }, '2026-11-10');
    expect(h0(r).days['2026-11-05']).toBeUndefined();
    expect(h0(r).current).toBe(0);
    expect(h0(r).best).toBe(3);
  });
});

describe('anti-cheating', () => {
  it('a tick after midnight counts for the new day', () => {
    const at = startOfDay('2026-11-12') + 30 * 60_000; // 00:30
    const r = run({ habits: [habit('j', '2026-11-10')], marks: [tick('j', dayOf(at), at)] }, '2026-11-12');
    expect(dayOf(at)).toBe('2026-11-12');
    expect(h0(r).days['2026-11-12'].status).toBe('done');
    expect(h0(r).days['2026-11-11'].status).toBe('missed');
  });

  it('23:59:59 still counts for the old day, 00:00:00 for the new one', () => {
    const end = startOfDay('2026-11-12') - 1000;
    expect(dayOf(end)).toBe('2026-11-11');
    expect(dayOf(end + 1000)).toBe('2026-11-12');
  });

  it('yesterday can still be fixed, older days are locked', () => {
    const today = '2026-11-12';
    const marks = [tick('j', '2026-11-11', noon(today)), tick('j', '2026-11-10', noon(today)), tick('j', '2026-11-13', noon(today))];
    const r = run({ habits: [habit('j', '2026-11-09')], marks }, today);
    expect(h0(r).days['2026-11-11'].status).toBe('done');
    expect(h0(r).days['2026-11-10'].status).toBe('missed');
    expect(h0(r).days['2026-11-13']).toBeUndefined();
  });

  it('a rule change applies from tomorrow, even if it claims an earlier start', () => {
    const base = habit('j', '2026-11-02');
    const change: HabitVersion = { ...base.versions[0], from: '2026-11-11', savedAt: noon('2026-11-12'), rest: { weekdays: [], dates: ['2026-11-11', '2026-11-12', '2026-11-13'] } };
    const h = { ...base, versions: [...base.versions, change] };
    const r = run({ habits: [h] }, '2026-11-13');
    expect(h0(r).days['2026-11-11'].status).toBe('missed');
    expect(h0(r).days['2026-11-12'].status).toBe('missed');
    expect(h0(r).days['2026-11-13'].status).toBe('rest');
  });

  it('a Koban value change does not rewrite past earnings', () => {
    const base = habit('j', '2026-11-09');
    const h = { ...base, versions: [...base.versions, { ...base.versions[0], from: '2026-11-11', savedAt: noon('2026-11-10'), koban: { default: 50 } }] };
    const r = run({ habits: [h], marks: ticks('j', ['2026-11-09', '2026-11-10', '2026-11-11']) }, '2026-11-11');
    expect(r.earnings.filter((e) => e.kind === 'habit').map((e) => e.amount)).toEqual([10, 10, 50]);
  });
});

describe('minimums and automatic sources', () => {
  const cfaSource: Source = { kind: 'studyDeskFocus', subjects: ['CFA'], lectures: false, minMinutes: { default: 30, byWeekday: { 6: 60, 7: 60 } } };
  const ext = (day: Day, cfaMin: number, lectureMin = 0) => ({ day, focus: { CFA: cfaMin * 60 }, lecture: { CFA: lectureMin * 60 }, reviews: {} });

  it('the minimum can differ by weekday', () => {
    const external = { '2026-11-10': ext('2026-11-10', 45), '2026-11-07': ext('2026-11-07', 45), '2026-11-08': ext('2026-11-08', 60) };
    const r = run({ habits: [habit('cfa', '2026-11-07', { sources: [cfaSource] })], external }, '2026-11-10');
    expect(h0(r).days['2026-11-07'].status).toBe('missed'); // Saturday: 45 < 60
    expect(h0(r).days['2026-11-08'].status).toBe('done');
    expect(h0(r).days['2026-11-10'].status).toBe('done'); // Tuesday: 45 ≥ 30
    expect(h0(r).days['2026-11-10'].via?.via).toBe('focus');
  });

  it('lectures only count when the source says so', () => {
    const external = { '2026-11-10': ext('2026-11-10', 10, 60) };
    const off = run({ habits: [habit('cfa', '2026-11-10', { sources: [cfaSource] })], external }, '2026-11-10');
    const on = run({ habits: [habit('cfa', '2026-11-10', { sources: [{ ...cfaSource, lectures: true }] })], external }, '2026-11-10');
    expect(h0(off).days['2026-11-10'].status).toBe('pending');
    expect(h0(on).days['2026-11-10'].status).toBe('done');
  });

  it('Japanese: reviewed cards in Study Desk complete the day', () => {
    const external = { '2026-11-10': { day: '2026-11-10', focus: {}, lecture: {}, reviews: { vocab: 12, hiragana: 3 } } };
    const r = run({ habits: [habit('j', '2026-11-10', { sources: [{ kind: 'studyDeskReviews', modules: ['vocab', 'hiragana'], minCards: 1 }] })], external }, '2026-11-10');
    expect(h0(r).days['2026-11-10'].via?.detail).toBe('15 cards in Study Desk');
  });

  it('Monkeytype: ≥ 5 tests or ≥ 10 minutes, counted on the Zurich day (also across DST)', () => {
    const src: Source = { kind: 'monkeytype', minMinutes: 10, minTests: 5 };
    const test = (iso: string, sec = 30) => ({ ts: Date.parse(iso), wpm: 45, acc: 95, sec, mode: 'time 30' });
    const typing = [
      ...[0, 1, 2, 3, 4].map((i) => test(`2026-10-24T10:0${i}:00Z`)), // 5 short tests
      test('2026-10-25T23:30:00Z', 660), // 00:30 CET on 26 Oct
      test('2026-10-27T10:00:00Z', 60),
    ];
    const r = run({ habits: [habit('t', '2026-10-24', { sources: [src] })], typing }, '2026-10-28');
    const s = (d: Day) => h0(r).days[d].status;
    expect(s('2026-10-24')).toBe('done');
    expect(s('2026-10-25')).toBe('missed');
    expect(s('2026-10-26')).toBe('done');
    expect(s('2026-10-27')).toBe('missed');
  });

  it('a tick on the spring DST day at 23:59 CEST counts for that day', () => {
    const at = Date.parse('2026-03-29T21:59:00Z');
    const r = run({ habits: [habit('j', '2026-03-28')], marks: [tick('j', dayOf(at), at), tick('j', '2026-03-28')] }, '2026-03-30');
    expect(h0(r).days['2026-03-29'].status).toBe('done');
    expect(h0(r).current).toBe(2);
  });
});

describe('per-week habits', () => {
  const gym = (times = 1) => habit('gym', '2026-11-02', { schedule: { kind: 'perWeek', times } });

  it('counts weeks; the current week is pending until it is over', () => {
    const r = run({ habits: [gym()], marks: ticks('gym', ['2026-11-04']) }, '2026-11-12');
    expect(h0(r).unit).toBe('weeks');
    expect(h0(r).weeks['2026-11-02'].status).toBe('done');
    expect(h0(r).weeks['2026-11-09'].status).toBe('pending');
    expect(h0(r).current).toBe(1);
  });

  it('a week below target is missed and breaks the streak', () => {
    const r = run({ habits: [gym(3)], marks: ticks('gym', ['2026-11-03', '2026-11-05']) }, '2026-11-12');
    expect(h0(r).weeks['2026-11-02']).toEqual({ status: 'missed', count: 2, target: 3 });
    expect(h0(r).current).toBe(0);
  });

  it('Koban only up to the weekly target', () => {
    const r = run({ habits: [gym(1)], marks: ticks('gym', ['2026-11-03', '2026-11-05']) }, '2026-11-12');
    expect(r.earnings.filter((e) => e.kind === 'habit')).toHaveLength(1);
  });

  it('a first partial week that is not met does not count against you', () => {
    const r = run({ habits: [habit('gym', '2026-11-06', { schedule: { kind: 'perWeek', times: 1 } })], marks: ticks('gym', ['2026-11-10']) }, '2026-11-12');
    expect(h0(r).weeks['2026-11-02'].status).toBe('none');
    expect(h0(r).current).toBe(1);
  });
});

describe('freezes', () => {
  const missTwoDays = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-07']; // 5th and 6th missed

  it('a freeze bought before the missed day covers it; the streak survives without growing', () => {
    const r = run({ habits: [habit('j', '2026-11-02')], marks: ticks('j', ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-06']), purchases: [freeze('j', noon('2026-11-03'))] }, '2026-11-06');
    expect(h0(r).days['2026-11-05'].status).toBe('frozen');
    expect(h0(r).current).toBe(4);
    expect(h0(r).waitingFreeze).toBeNull();
  });

  it('only the first missed day is covered', () => {
    const r = run({ habits: [habit('j', '2026-11-02')], marks: ticks('j', missTwoDays), purchases: [freeze('j', noon('2026-11-02'))] }, '2026-11-07');
    expect(h0(r).days['2026-11-05'].status).toBe('frozen');
    expect(h0(r).days['2026-11-06'].status).toBe('missed');
    expect(h0(r).current).toBe(1);
  });

  it('a freeze bought on the missed day itself, or later, never applies retroactively', () => {
    const sameDay = run({ habits: [habit('j', '2026-11-02')], marks: ticks('j', ['2026-11-02', '2026-11-04']), purchases: [freeze('j', startOfDay('2026-11-03') + 60_000)] }, '2026-11-04');
    expect(h0(sameDay).days['2026-11-03'].status).toBe('missed');
    expect(h0(sameDay).waitingFreeze).not.toBeNull(); // still waiting for a future miss
    const later = run({ habits: [habit('j', '2026-11-02')], marks: ticks('j', ['2026-11-02', '2026-11-04']), purchases: [freeze('j', noon('2026-11-04'))] }, '2026-11-04');
    expect(h0(later).days['2026-11-03'].status).toBe('missed');
  });

  it('protects only its own habit', () => {
    const r = run({ habits: [habit('j', '2026-11-02'), { ...habit('k', '2026-11-02'), order: 1 }], marks: [...ticks('j', ['2026-11-02', '2026-11-04']), ...ticks('k', ['2026-11-02', '2026-11-04'])], purchases: [freeze('j', noon('2026-11-02'))] }, '2026-11-04');
    expect(r.habits[0].days['2026-11-03'].status).toBe('frozen');
    expect(r.habits[1].days['2026-11-03'].status).toBe('missed');
  });

  it('is not used when yesterday is fixed after all', () => {
    const today = '2026-11-04';
    const r = run({ habits: [habit('j', '2026-11-02')], marks: [tick('j', '2026-11-02'), tick('j', '2026-11-03', noon(today))], purchases: [freeze('j', noon('2026-11-02'))] }, today);
    expect(h0(r).days['2026-11-03'].status).toBe('done');
    expect(h0(r).waitingFreeze).not.toBeNull();
  });

  it('per-week habits: must be bought before the week starts', () => {
    const g = habit('gym', '2026-10-26', { schedule: { kind: 'perWeek', times: 1 } });
    const marks = ticks('gym', ['2026-10-28', '2026-11-10']);
    const before = run({ habits: [g], marks, purchases: [freeze('gym', noon('2026-11-01'))] }, '2026-11-12');
    expect(h0(before).weeks['2026-11-02'].status).toBe('frozen');
    expect(h0(before).current).toBe(2);
    const during = run({ habits: [g], marks, purchases: [freeze('gym', noon('2026-11-02'))] }, '2026-11-12');
    expect(h0(during).weeks['2026-11-02'].status).toBe('missed');
  });

  it('a freeze costs Koban; more than 2 in a month are ignored and not charged', () => {
    const p = [freeze('j', noon('2026-11-01'), 150), freeze('k', noon('2026-11-02'), 300), freeze('l', noon('2026-11-03'), 300)];
    const r = run({ habits: [habit('j', '2026-11-01')], marks: ticks('j', ['2026-11-01']), purchases: p }, '2026-11-03');
    expect(r.spent).toBe(450);
  });
});

describe('Koban, bonuses, levels, badges', () => {
  it('earns per done day with weekday values', () => {
    const r = run({ habits: [habit('cfa', '2026-11-06', { koban: { default: 20, byWeekday: { 6: 25, 7: 25 } } })], marks: ticks('cfa', ['2026-11-06', '2026-11-07']) }, '2026-11-07');
    expect(r.xp).toBe(45);
  });

  it('streak milestone at 7 days, and a perfect week once the week is over', () => {
    const marks = ticks('j', W1);
    const during = run({ habits: [habit('j', '2026-11-02')], marks }, '2026-11-08');
    expect(during.earnings.find((e) => e.kind === 'milestone')?.amount).toBe(25);
    expect(during.perfectWeeks).toEqual([]);
    const after = run({ habits: [habit('j', '2026-11-02')], marks }, '2026-11-09');
    expect(after.perfectWeeks).toEqual(['2026-11-02']);
    expect(after.xp).toBe(7 * 10 + 25 + 75);
    expect(after.badges.find((b) => b.id === 'streak7')?.earned).toBe('2026-11-08');
    expect(after.badges.find((b) => b.id === 'perfect1')?.earned).toBe('2026-11-08');
  });

  it('a frozen day spoils the perfect week; rest days do not', () => {
    const withRest = run({ habits: [habit('j', '2026-11-02', { rest: { weekdays: [1], dates: [] } })], marks: ticks('j', W1.slice(1)) }, '2026-11-09');
    expect(withRest.perfectWeeks).toEqual(['2026-11-02']);
    const withFreeze = run({ habits: [habit('j', '2026-11-02')], marks: ticks('j', W1.filter((d) => d !== '2026-11-05')), purchases: [freeze('j', noon('2026-11-01'))] }, '2026-11-09');
    expect(withFreeze.habits[0].days['2026-11-05'].status).toBe('frozen');
    expect(withFreeze.perfectWeeks).toEqual([]);
  });

  it('spending lowers the balance but never XP', () => {
    const r = run({ habits: [habit('j', '2026-11-09')], marks: ticks('j', ['2026-11-09', '2026-11-10']), purchases: [{ id: 'p', at: noon('2026-11-10'), price: 15, kind: 'reward', name: 'YouTube' }] }, '2026-11-10');
    expect(r.xp).toBe(20);
    expect(r.balance).toBe(5);
    expect(r.badges.find((b) => b.id === 'reward1')?.earned).toBe('2026-11-10');
  });

  it('levels: L2 at 50, L5 at 800, L10 at 4050', () => {
    expect(levelOf(0).level).toBe(1);
    expect(levelOf(49).level).toBe(1);
    expect(levelOf(50).level).toBe(2);
    expect(levelOf(800).level).toBe(5);
    expect(levelOf(4050)).toEqual({ level: 10, from: 4050, to: 5000 });
  });

  it('a long history stays fast and consistent', () => {
    const start = '2025-11-12';
    const days = Array.from({ length: 366 }, (_, i) => addDays(start, i));
    const r = run({ habits: [habit('j', start)], marks: days.map((d) => tick('j', d)) }, days[365]);
    expect(h0(r).current).toBe(366);
    expect(r.badges.find((b) => b.id === 'streak100')?.earned).toBe(addDays(start, 99));
  });
});
