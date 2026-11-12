# Build prompt – "Streak" habit & reward tracker

Paste this into Claude Code (Opus, effort: high, start in plan mode) from inside
`~/Claude Code/streak-app/`. Working name "Streak" – rename it if you like.

---

Build me a personal habit tracker with streaks and a reward system. It is for one
person (me, a university student at HSG). It is a NEW, separate app, but it lives
next to my existing study app and should reuse its architecture.

## Reuse my existing app – read this first
My study app "Study Desk" is in `../nihongo-app` (Vite + React + TypeScript PWA,
GitHub Pages, IndexedDB, encrypted sync through my private GitHub repo).
Before planning, read:
- `../nihongo-app/FEATURES.md`, `README.md`, `HANDOVER.md`
- `src/core/github.ts`, `sync.ts`, `syncMerge.ts`, `kvSync.ts`, `lib/crypto` (sync + encryption)
- `src/core/focus.ts`, `focusStore.ts`, `stats.ts` (focus sessions with subjects, day logs, streaks)
- `.github/workflows/deploy.yml` (deploy to GitHub Pages)
Copy/adapt the sync, crypto and deploy setup instead of inventing a new one.
Match Study Desk's frosted-glass look so the two apps feel like siblings,
but give Streak its own accent colour. Do NOT change anything inside `../nihongo-app`.

## Platform (must-have)
- Installable PWA that works offline on my **iPhone** (home screen) and my Mac.
- No backend, no accounts, no tracking, no ads. Data in IndexedDB on each device,
  synced between devices through my own private GitHub repo, encrypted
  (same approach as Study Desk).
- JSON export/import backup.
- UI in English. Fast one-thumb use on the phone: ticking off a habit = one tap.

## Habits (all editable in settings; these are the defaults)
| Habit | Schedule | How it's completed |
|---|---|---|
| Typing | daily | Auto from Monkeytype (see below), ≥10 min or ≥5 tests; manual fallback: enter WPM + accuracy |
| Japanese | daily | Auto from Study Desk: Japanese focus time ≥15 min or reviewed cards that day; manual tick fallback |
| CFA | 30 min weekdays, longer weekends; rest on Mondays and on my "long Wednesday" (every 3rd week – make the rhythm configurable with a start date) | Auto from Study Desk focus sessions with subject "CFA" |
| Python | 3× per week | Auto from Study Desk subject "Python", or manual |
| Vocab | daily | manual tick |
| Meditation | daily, morning, 10 min | built-in 10-min timer (gentle sound at the end) completes it |
| Journal | daily, before bed | manual tick |
| Gym (uni gym) | 1× per week | manual tick |

Habit types needed: daily, specific weekdays, X times per week, with planned rest
days that never break a streak. Each habit can have a minimum ("counts if ≥ 5 min").

### Reading Study Desk data
Study Desk syncs its data to my private GitHub repo. Find out (from the code) where
and in what format focus sessions and day logs are stored and whether Streak can
read them with the same token/passphrase. If it can, read them read-only to
auto-complete habits. If that's not cleanly possible, tell me in the plan and
propose the simplest alternative (e.g. Study Desk writing a small daily summary
file). Never write into Study Desk's data.

### Monkeytype
Check the official Monkeytype API docs for personal API keys ("ApeKeys") and
whether results can be fetched from the browser (CORS). If yes: I paste my key
once in settings, Streak pulls my recent results and shows WPM, accuracy, a
weekly-best chart and progress toward 60 WPM (current: ~43 WPM, 95%). If the
browser can't call it, say so and keep the manual WPM entry.

## Reward system (important – this is the motivation part)
Currency: **Koban** (gold coins).
- Earn Koban for every completed habit; more for harder ones (CFA, gym) than easy
  ones (journal). Bonus for streak milestones (7, 30, 100 days) and for a "perfect
  week". Auto-tracked completions and manual ticks earn the same.
- **Shop**: I create my own rewards with a price, e.g. "30 min YouTube guilt-free",
  "takeaway dinner", "new game", "evening off". Buying one logs it in a history.
- **Streak freezes are NOT free and can't be abused**:
  - they can only be bought in the shop, at a high price that rises with each one
    bought in the same month;
  - max 1 active freeze per habit, max 2 per month in total;
  - a freeze must be bought BEFORE the missed day – it can never be applied
    retroactively;
  - it is used automatically on the first missed day.
- Anti-cheating: past days can only be edited up to yesterday; manual ticks
  after midnight count for the day they're entered, not the day before.
- Levels/XP from total Koban earned (never decreases when spending), with a few
  badges. Keep it tasteful – no confetti on every tap, a small animation on
  milestones is fine.

## Screens
1. **Today** – checklist of today's habits (auto-completed ones shown as done with
   their source), streak number per habit, Koban balance, meditation timer.
2. **Streaks** – per habit: current & best streak, GitHub-style year heatmap
   (rest days and freezes visibly different from misses).
3. **Typing** – Monkeytype stats and charts.
4. **Shop** – rewards, freezes, purchase history.
5. **Week** – weekly review: which habits held, which slipped, Koban earned/spent.
6. **Settings** – habits, schedules, rest days, rewards, sync, Monkeytype key, backup.

## Quality
- TypeScript strict, unit tests for the streak logic (rest days, X-per-week,
  freezes, timezone Europe/Zurich, day boundary at midnight, DST change).
- `npm test` + build run in the GitHub Action before deploy, like Study Desk.
- README with setup steps for me (GitHub Pages, token, passphrase, installing on iPhone).

## How to work
Start in plan mode. Show me the plan (data model, how Study Desk data is read,
Monkeytype findings, screens) and wait for my OK before writing code.
Then build in stages: streak engine + tests → Today/Streaks → sync + PWA →
reward shop → Monkeytype → Week view. Commit after each stage.
