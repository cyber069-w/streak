/** Badges as the Shop shows them: icon, colour, what earns them and how far you are. Pure. */
import type { Day } from './day';
import type { Report } from './engine';
import type { Mark, Purchase, TypingResult } from './types';

export interface BadgeView {
  id: string;
  name: string;
  desc: string;
  icon: string;
  color: string;
  earned: Day | null;
  value: number;
  goal: number;
}

const META: Record<string, { desc: string; icon: string; color: string }> = {
  streak7: { desc: 'Keep one habit going for 7 days', icon: 'flame', color: 'orange' },
  streak30: { desc: 'Keep one habit going for 30 days', icon: 'flame', color: 'red' },
  streak100: { desc: 'Keep one habit going for 100 days', icon: 'award', color: 'purple' },
  perfect1: { desc: 'Every due habit done for a whole week', icon: 'calendar-check', color: 'green' },
  perfect4: { desc: 'Four perfect weeks', icon: 'medal', color: 'teal' },
  wpm60: { desc: 'Reach 60 WPM in a typing test', icon: 'keyboard', color: 'blue' },
  meditate100: { desc: 'Meditate on 100 days', icon: 'meditation', color: 'indigo' },
  reward1: { desc: 'Treat yourself in the shop', icon: 'gift', color: 'pink' },
};

export function badgeViews(report: Report, typing: TypingResult[], marks: Mark[], purchases: Purchase[]): BadgeView[] {
  const bestDays = Math.max(0, ...report.habits.filter((r) => r.unit === 'days').map((r) => r.best));
  const bestWpm = Math.max(0, ...typing.map((t) => t.wpm), ...marks.filter((m) => m.source === 'typing').map((m) => m.wpm ?? 0));
  const meditations = report.habits
    .filter((r) => r.habit.versions.some((v) => v.sources.some((s) => s.kind === 'timer')))
    .reduce((n, r) => n + Object.values(r.days).filter((d) => d.status === 'done').length, 0);
  const value: Record<string, [number, number]> = {
    streak7: [bestDays, 7], streak30: [bestDays, 30], streak100: [bestDays, 100],
    perfect1: [report.perfectWeeks.length, 1], perfect4: [report.perfectWeeks.length, 4],
    wpm60: [Math.round(bestWpm), 60], meditate100: [meditations, 100],
    reward1: [purchases.filter((p) => p.kind === 'reward').length, 1],
  };
  return report.badges.map((b) => {
    const [v, goal] = value[b.id] ?? [0, 1];
    const m = META[b.id] ?? { desc: '', icon: 'star', color: 'yellow' };
    return { id: b.id, name: b.name, earned: b.earned, ...m, value: Math.min(v, goal), goal };
  });
}
