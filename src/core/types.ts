import type { Day, Weekday } from './day';

/** A number that may differ by weekday (e.g. CFA: 30 min on weekdays, 60 at weekends). */
export interface Amount {
  default: number;
  byWeekday?: Partial<Record<Weekday, number>>;
}

export type Schedule = { kind: 'daily' } | { kind: 'weekdays'; days: Weekday[] } | { kind: 'perWeek'; times: number };

export interface RestRules {
  /** Weekdays that are always rest (CFA: Monday). */
  weekdays: Weekday[];
  /** A weekday that is rest every n-th week, counted from `start` (CFA: the long Wednesday every 3rd week). */
  cycle?: { weekday: Weekday; everyWeeks: number; start: Day };
  /** Planned one-off rest days. */
  dates: Day[];
}

export type Source =
  | { kind: 'manual' }
  | { kind: 'timer'; minutes: number }
  | { kind: 'studyDeskFocus'; subjects: string[]; lectures: boolean; minMinutes: Amount }
  | { kind: 'studyDeskReviews'; modules: string[]; minCards: number }
  | { kind: 'monkeytype'; minMinutes: number; minTests: number };

/** One version of a habit's rules. Edits make a new version that applies from tomorrow. */
export interface HabitVersion {
  from: Day;
  /** When this version was saved (ms) – the engine never lets it apply earlier than the next day. */
  savedAt: number;
  schedule: Schedule;
  rest: RestRules;
  /** Any one satisfied = the day is done. Marks (ticks, timer, typing entry) always count. */
  sources: Source[];
  koban: Amount;
}

export interface Habit {
  id: string;
  name: string;
  icon: string;
  /** Tile colour: red, orange, yellow, green, teal, blue, indigo, purple, pink. */
  color?: string;
  order: number;
  /** Shown first in the morning or in the evening on Today (no enforced time window). */
  timeOfDay?: 'morning' | 'evening';
  createdDay: Day;
  /** Last tracked day (archived habits keep their history). */
  archivedDay?: Day;
  versions: HabitVersion[];
}

/** Something you did by hand: a tick, a finished meditation timer, a typed WPM entry. */
export interface Mark {
  id: string;
  habitId: string;
  day: Day;
  createdAt: number;
  source: 'manual' | 'timer' | 'typing';
  wpm?: number;
  acc?: number;
  minutes?: number;
}

/** Compact extract of Study Desk's data for one day (seconds per subject, cards per module). */
export interface ExternalDay {
  day: Day;
  focus: Record<string, number>;
  lecture: Record<string, number>;
  reviews: Record<string, number>;
}

/** One Monkeytype test. */
export interface TypingResult {
  ts: number;
  wpm: number;
  acc: number;
  sec: number;
  mode: string;
}

export interface Reward {
  id: string;
  name: string;
  price: number;
  archived?: boolean;
}

export interface Purchase {
  id: string;
  at: number;
  price: number;
  kind: 'reward' | 'freeze';
  rewardId?: string;
  /** For a freeze: the habit it protects. */
  habitId?: string;
  name: string;
}

export interface Rules {
  tz: string;
  /** Streak length → bonus Koban, for daily habits (days) and per-week habits (weeks). */
  milestones: Record<number, number>;
  weekMilestones: Record<number, number>;
  perfectWeek: number;
  /** Price of the 1st, 2nd … freeze bought in a month; its length is the monthly limit. */
  freezePrices: number[];
}

export const DEFAULT_RULES: Rules = {
  tz: 'Europe/Zurich',
  milestones: { 7: 25, 30: 100, 100: 400 },
  weekMilestones: { 4: 25, 12: 100, 52: 400 },
  perfectWeek: 75,
  freezePrices: [150, 300],
};

export interface Facts {
  habits: Habit[];
  marks: Mark[];
  external: Record<Day, ExternalDay>;
  typing: TypingResult[];
  purchases: Purchase[];
}
