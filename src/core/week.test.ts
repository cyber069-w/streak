import { describe, expect, it } from 'vitest';
import { startOfDay } from './day';
import { evaluate } from './engine';
import { weekSummary } from './week';
import { DEFAULT_RULES, type Habit, type Mark } from './types';

const tz = DEFAULT_RULES.tz;
const noon = (d: string) => startOfDay(d, tz) + 12 * 3_600_000;
const habit = (id: string, perWeek?: number, restMonday = false): Habit => ({
  id, name: id, icon: '', order: 0, createdDay: '2026-11-02',
  versions: [{ from: '2026-11-02', savedAt: noon('2026-11-02'), schedule: perWeek ? { kind: 'perWeek', times: perWeek } : { kind: 'daily' }, rest: { weekdays: restMonday ? [1] : [], dates: [] }, sources: [{ kind: 'manual' }], koban: { default: 10 } }],
});
const tick = (habitId: string, day: string): Mark => ({ id: `${habitId}${day}`, habitId, day, createdAt: noon(day), source: 'manual' });
const W1 = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08'];

describe('weekly review', () => {
  it('held, slipped, Koban earned and spent, perfect week', () => {
    const marks = [...W1.slice(1).map((d) => tick('cfa', d)), ...W1.filter((d) => d !== '2026-11-05').map((d) => tick('journal', d)), tick('gym', '2026-11-04')];
    const purchases = [{ id: 'p', at: noon('2026-11-06'), price: 40, kind: 'reward' as const, name: 'YouTube' }];
    const report = evaluate({ habits: [habit('cfa', undefined, true), { ...habit('journal'), order: 1 }, { ...habit('gym', 1), order: 2 }], marks, external: {}, typing: [], purchases }, noon('2026-11-10'), DEFAULT_RULES);
    const w = weekSummary(report, purchases, '2026-11-02', tz);
    expect(w.habits.map((h) => [h.id, h.verdict, h.done, h.due])).toEqual([['cfa', 'held', 6, 6], ['journal', 'slipped', 6, 7], ['gym', 'held', 1, 1]]);
    expect(w.perfect).toBe('no');
    expect(w.earned).toBe(6 * 10 + 6 * 10 + 10);
    expect(w.spent).toBe(40);
    expect(w.done).toBe(13);
    expect(w.due).toBe(14);
  });

  it('the current week is still open and can be perfect', () => {
    const report = evaluate({ habits: [habit('journal')], marks: [tick('journal', '2026-11-09')], external: {}, typing: [], purchases: [] }, noon('2026-11-10'), DEFAULT_RULES);
    const w = weekSummary(report, [], '2026-11-09', tz);
    expect(w.habits[0].verdict).toBe('open');
    expect(w.habits[0].days.map((d) => d.status)).toEqual(['done', 'pending', 'future', 'future', 'future', 'future', 'future']);
    expect(w.perfect).toBe('possible');
  });
});

describe('weekly review – future rest days', () => {
  it('rest days are not counted as due (Monday rest, today Tuesday: 6 due)', () => {
    const now = evaluate({ habits: [habit('cfa', undefined, true)], marks: [], external: {}, typing: [], purchases: [] }, noon('2026-11-03'), DEFAULT_RULES);
    expect(weekSummary(now, [], '2026-11-02', tz).habits[0].due).toBe(6);
  });
});

describe('weekly review – rest later this week', () => {
  it('a rest day still ahead is shown as rest, not as due', () => {
    const h = habit('x');
    h.versions[0].rest.weekdays = [6];
    const report = evaluate({ habits: [h], marks: [], external: {}, typing: [], purchases: [] }, noon('2026-11-03'), DEFAULT_RULES);
    const w = weekSummary(report, [], '2026-11-02', tz);
    expect(w.habits[0].days[5].status).toBe('rest');
    expect(w.habits[0].due).toBe(6);
  });
});
