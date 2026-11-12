/** The habits and rewards a new install starts with (all editable in Settings). */
import { dayOf, type Day } from './day';
import type { Habit, HabitVersion, Reward, Rules } from './types';

export const HABIT_COLORS = ['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'indigo', 'purple', 'pink'];
const DEFAULT_COLORS: Record<string, string> = { meditation: 'purple', typing: 'blue', japanese: 'red', cfa: 'green', vocab: 'orange', gym: 'indigo', journal: 'teal' };
/** A habit's tile colour (older habits without one get a stable default). */
export function habitColor(h: { id: string; color?: string }): string {
  if (h.color) return h.color;
  if (DEFAULT_COLORS[h.id]) return DEFAULT_COLORS[h.id];
  let n = 0;
  for (const c of h.id) n = (n * 31 + c.charCodeAt(0)) % 997;
  return HABIT_COLORS[n % HABIT_COLORS.length];
}

/** Study Desk's Japanese module ids (its `days[].modules` keys). */
export const JAPANESE_MODULES = ['hiragana', 'katakana', 'vocab', 'kanji', 'grammar', 'numbers', 'listening', 'speaking'];

const v = (from: Day, savedAt: number, p: Pick<HabitVersion, 'schedule' | 'sources' | 'koban'> & Partial<HabitVersion>): HabitVersion => ({
  from, savedAt, rest: { weekdays: [], dates: [] }, ...p,
});

export function defaultHabits(now: number, rules: Rules): Habit[] {
  const day = dayOf(now, rules.tz);
  const h = (id: string, name: string, icon: string, order: number, ver: HabitVersion, timeOfDay?: Habit['timeOfDay']): Habit => ({
    id, name, icon, order, createdDay: day, versions: [ver], ...(timeOfDay ? { timeOfDay } : {}),
  });
  return [
    h('meditation', 'Meditation', 'meditation', 0, v(day, now, { schedule: { kind: 'daily' }, sources: [{ kind: 'timer', minutes: 10 }], koban: { default: 8 } }), 'morning'),
    h('typing', 'Typing', 'keyboard', 1, v(day, now, { schedule: { kind: 'daily' }, sources: [{ kind: 'monkeytype', minMinutes: 10, minTests: 5 }], koban: { default: 8 } })),
    h('japanese', 'Japanese', 'language', 2, v(day, now, {
      schedule: { kind: 'daily' },
      sources: [
        { kind: 'studyDeskFocus', subjects: ['Japanisch'], lectures: false, minMinutes: { default: 15 } },
        { kind: 'studyDeskReviews', modules: JAPANESE_MODULES, minCards: 1 },
        { kind: 'manual' },
      ],
      koban: { default: 10 },
    })),
    h('cfa', 'CFA', 'chart', 3, v(day, now, {
      schedule: { kind: 'daily' },
      // the every-3rd-week "long Wednesday" cycle stays off until its start date is set in Settings
      rest: { weekdays: [1], dates: [] },
      sources: [{ kind: 'studyDeskFocus', subjects: ['CFA'], lectures: false, minMinutes: { default: 30, byWeekday: { 6: 60, 7: 60 } } }],
      koban: { default: 20, byWeekday: { 6: 25, 7: 25 } },
    })),
    h('vocab', 'Vocab', 'cards', 4, v(day, now, { schedule: { kind: 'daily' }, sources: [{ kind: 'manual' }], koban: { default: 5 } })),
    h('gym', 'Gym', 'barbell', 5, v(day, now, { schedule: { kind: 'perWeek', times: 1 }, sources: [{ kind: 'manual' }], koban: { default: 30 } })),
    h('journal', 'Journal', 'notebook', 6, v(day, now, { schedule: { kind: 'daily' }, sources: [{ kind: 'manual' }], koban: { default: 5 } }), 'evening'),
  ];
}

export const DEFAULT_REWARDS: Reward[] = [
  { id: 'youtube30', name: '30 min YouTube, guilt-free', price: 40 },
  { id: 'evening-off', name: 'Evening off', price: 150 },
  { id: 'takeaway', name: 'Takeaway dinner', price: 250 },
  { id: 'new-game', name: 'New game', price: 1200 },
];
