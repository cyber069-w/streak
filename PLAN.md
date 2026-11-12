# Streak – build plan

Status: **approved 12 Nov 2026** – defaults for all questions accepted; Python habit dropped.

---

## 1. What I found

### Study Desk data – Streak can read it ✅
- Study Desk keeps **one encrypted file, `progress.enc`**, in your private sync repo (`src/core/sync.ts`).
  Format (`lib/crypto.ts`): `"NHSY" | v1 | salt(16) | iv(12) | AES-256-GCM(gzip(JSON))`, key = PBKDF2-SHA-256
  (310 000 rounds) from your sync password. The salt is in the file header, so **the same repo + token + password are
  enough for Streak to decrypt it.**
- Inside (`SyncData`, `core/syncMerge.ts`) there are exactly the two things Streak needs:
  - `focus.sessions[]` – `FocusSession { subject, kind: 'study'|'lecture', day, start, end, effectiveSec, manual, at }`.
    Subjects are your Study Desk names: **`CFA`, `Japanisch`**.
  - `days[deviceId][]` – `DayLog { date, reviews, modules: { hiragana|katakana|vocab|kanji|grammar|numbers|listening|speaking: { reviews, ms } } }`,
    one log per device; Study Desk adds them up (`combineDays`). Streak does the same → "Japanese cards reviewed that day".
- Focus sync is on Study Desk's `main` (deployed), not only on the work branch.
- **Read-only, guaranteed:** Streak gets its own GitHub client for that file that has *no write method at all*, and a
  unit test checks that no request to `progress.enc` is ever anything but a GET. Streak writes only its own file,
  **`streak.enc`**, in the same repo (own salt, same password). Study Desk ignores unknown files.
- To avoid re-downloading: Streak remembers the file's `sha` and skips download + decrypt when it hasn't changed.
- Caveat: Streak only sees what Study Desk has already synced (Study Desk syncs ~20 s after studying and when you leave
  the app). So right after a CFA session, CFA may tick a minute later, not instantly.
- **No changes to Study Desk are needed.** (The fallback "Study Desk writes a daily summary file" isn't necessary.)

### Monkeytype – the browser can call it directly ✅
- Official docs (api.monkeytype.com/docs): auth header `Authorization: ApeKey <key>`; `GET /results` returns up to
  1000 results (`wpm, acc, timestamp, testDuration, mode, mode2…`) with `onOrAfterTimestamp`.
- **CORS:** I tested a preflight from a foreign origin: `access-control-allow-origin: *` and `authorization` is an
  allowed header → works from GitHub Pages and the iPhone PWA.
- **Rate limit is the real constraint: `/results` = 30 calls per day per user with ApeKeys** (shared across all your
  keys, and Study Desk's Mac job already uses 1/day). Streak therefore:
  - fetches incrementally (only results newer than the last one it has),
  - at most once per 30 min when the app opens + a manual "Refresh" button, **hard cap 10 calls/day per device**,
  - stores the results in the synced file, so the Mac doesn't need to fetch what the iPhone already fetched.
- The ApeKey must be switched to **active** on monkeytype.com (status 471 otherwise – Streak will say so).
- Manual fallback stays: enter WPM + accuracy → Typing done for today.

### What gets copied from Study Desk (adapted, not reinvented)
`github.ts` (unchanged), `lib/crypto.ts` (unchanged), `sync.ts` (engine, triggers, status – app id `streak-app`, file
`streak.enc`), `kvSync.ts` merge rules (item-by-item, newest wins, deletion tombstones) as the merge for every Streak
collection, `lib/stable.ts`, `deploy.yml` (test + build every push, deploy `main` to Pages), `vite-plugin-pwa` setup,
the frosted-glass surface CSS. Same versions: Vite 8, React 19, TS 6 strict, `idb`, Vitest.

---

## 2. Core rules (the streak engine)

**One pure function** decides everything: `evaluate(habits, marks, external, purchases, today) → per habit per day:
done | missed | rest | frozen | pending`, plus streaks, Koban earned and badges. No stored "streak counters" that can
drift between devices – the engine recomputes from raw facts. This is what the tests target.

- **Days** are `YYYY-MM-DD` in **Europe/Zurich**, computed with `Intl.DateTimeFormat` from timestamps (not the
  device's timezone). Day stepping is done on calendar dates, so DST (29 Mar / 25 Oct 2026, 28 Mar 2027) can't make a
  day vanish or count twice. Day boundary = midnight Zurich.
- **Schedules:** `daily` · `weekdays` (e.g. Tue–Sun) · `perWeek` (N times per Mon–Sun week).
  **Rest rules:** rest weekdays, a **cycle rest** ("every 3rd Wednesday from <start date>"), and one-off planned rest
  dates. Rest days never break and never add to a streak.
- **Minimum per day** can differ by weekday (CFA: 30 min Mon–Fri, longer Sat/Sun).
- **Streak length:** daily/weekday habits count *completed due days* in a row; per-week habits count *weeks* in a row
  ("Gym: 6 weeks"). Today (or this week) still open = "pending", never breaks the streak until it's over.
- **A day is done** if any source says so: Study Desk focus minutes for the habit's subjects, Japanese cards reviewed,
  Monkeytype (≥ 10 min or ≥ 5 tests), meditation timer finished, or a manual tick / manual WPM entry.

### Anti-cheating (enforced in the engine, not only the UI)
- A manual tick always belongs to **the day it is made** (00:30 → the new day).
- **Editing:** today and yesterday can be changed; anything older is locked. A mark with `day < (day it was created) − 1`
  is ignored.
- Study Desk sessions: a session counts for day D only if it was recorded by the end of D+1 (uses its `at` stamp), so a
  back-dated Study Desk entry can't repair an old streak.
- **Schedule edits take effect tomorrow** (each habit keeps a history of schedule versions), so you can't turn today
  into a rest day after missing it. One-off rest dates can only be set for tomorrow or later.
- Deleting a habit archives it (history and Koban stay).

### Freezes
- Bought in the shop for **one habit**. Price rises within a calendar month: 1st = 150, 2nd = 300 Koban.
- Max **1 unused freeze per habit**, max **2 bought per month** in total.
- Covers only days **after the purchase day** (bought today at 10:00 → can cover tomorrow onwards, never today or
  earlier). Used automatically on the habit's first missed due day; shown as ❄︎ on the heatmap.
- Per-week habits: the freeze covers one failed week and must be bought before that week starts (see question 3).

---

## 3. Koban, XP, levels, badges

- **Earned per completed day** (defaults, all editable): Journal 5 · Vocab 5 · Meditation 8 · Typing 8 · Japanese 10 ·
  CFA 20 (weekends 25) · Gym 30. Auto and manual completions earn the same.
- **Bonuses:** streak milestones 7 / 30 / 100 days → 25 / 100 / 400 (per-week habits: 4 / 12 / 52 weeks);
  **perfect week** (every due habit done, rest days fine, freezes don't count as perfect) → 75.
- Rough economy: a full normal week ≈ 450–500 Koban. Example rewards: 30 min YouTube 40 · evening off 150 ·
  takeaway 250 · new game 1200.
- Earnings are **derived** from completions (Koban values keep a history too, so changing a price doesn't rewrite the
  past). Spending = purchases (synced by id, never double-counted). Balance = earned − spent.
- **XP = all Koban ever earned** (never drops when spending). Level = `floor(sqrt(XP / 50)) + 1`
  (L2 at 50, L5 at 800, L10 at ~4 000 ≈ 2 months).
- **Badges** (few): first 7-day streak · 30-day · 100-day · first perfect week · 4 perfect weeks · 60 WPM reached ·
  100 meditations · first reward bought.
- Animation: a small coin/level pop on milestones and level-ups only; ticking a habit = a quiet check + the Koban count
  ticking up.

---

## 4. Data model (IndexedDB on each device, synced in `streak.enc`)

```ts
type Day = string;              // 'YYYY-MM-DD' in Europe/Zurich
type Weekday = 1|2|3|4|5|6|7;   // ISO, Mon = 1

interface Habit {
  id: string; name: string; icon: string; order: number; archived?: boolean; createdDay: Day;
  versions: HabitVersion[];      // schedule/rules history; each applies from `from` (≥ tomorrow when edited)
}
interface HabitVersion {
  from: Day;
  schedule: { kind: 'daily' } | { kind: 'weekdays'; days: Weekday[] } | { kind: 'perWeek'; times: number };
  rest: { weekdays: Weekday[]; cycle?: { weekday: Weekday; everyWeeks: number; start: Day }; dates: Day[] };
  minimum?: { unit: 'min' | 'tests' | 'cards'; byWeekday: Partial<Record<Weekday, number>>; default: number };
  sources: Source[];             // any one satisfied = done
  koban: { default: number; byWeekday?: Partial<Record<Weekday, number>> };
}
type Source =
  | { kind: 'manual' }
  | { kind: 'studyDeskFocus'; subjects: string[]; lectures: boolean }   // e.g. ['CFA']
  | { kind: 'studyDeskReviews'; modules: string[]; minCards: number }  // Japanese modules
  | { kind: 'monkeytype'; minMinutes: number; minTests: number }
  | { kind: 'timer'; minutes: number };                                // meditation

interface Mark {                 // manual tick, finished timer, manual WPM entry
  id: string; habitId: string; day: Day; createdAt: number; source: 'manual' | 'timer' | 'typing';
  wpm?: number; acc?: number; minutes?: number;
}
interface ExternalDay {          // compact extract of Study Desk per day (merged by max)
  day: Day; focusSec: Record<string, number>; reviews: Record<string, number>;
}
interface TypingResult { ts: number; wpm: number; acc: number; sec: number; mode: string }
interface Reward { id: string; name: string; price: number; archived?: boolean }
interface Purchase {
  id: string; at: number; price: number;
  kind: 'reward' | 'freeze'; rewardId?: string; habitId?: string;   // freeze: which habit
}
interface Settings {
  timezone: 'Europe/Zurich'; wpmGoal: 60; apeKey?: string;
  milestoneBonus: Record<number, number>; perfectWeekBonus: number; freezePrices: [150, 300];
}
```

Synced collections (item-by-item merge from Study Desk's `kvSync`): `habits`, `marks`, `external`, `typing`,
`rewards`, `purchases`, `settings`. Device-only: sync config, Monkeytype call counter, theme, `progress.enc` sha.
Backup = the same JSON, exported/imported from Settings (import merges, never wipes).

---

## 5. Default habits

| Habit | Schedule | Rest | Done when | Koban |
|---|---|---|---|---|
| Typing | daily | – | Monkeytype ≥ 10 min or ≥ 5 tests · manual WPM + acc | 8 |
| Japanese | daily | – | Study Desk `Japanisch` (study) ≥ 15 min · or ≥ 1 Japanese card reviewed · manual tick | 10 |
| CFA | daily | Mondays; every 3rd Wednesday from *start date* | Study Desk `CFA` ≥ 30 min Tue–Fri, ≥ 60 min Sat/Sun | 20 / 25 |
| Vocab | daily | – | manual tick | 5 |
| Meditation | daily (morning) | – | 10-min timer finished | 8 |
| Journal | daily (evening) | – | manual tick | 5 |
| Gym | 1× per week | – | manual tick | 30 |

"Morning" / "evening" set the order on Today (meditation at the top in the morning, journal at the top at night); they
are not enforced time windows.

---

## 6. Screens (phone first, one thumb)

Bottom tab bar: **Today · Streaks · Typing · Week · Shop**; Settings behind the gear on Today.

1. **Today** – Koban balance + level bar at the top; one row per due habit: icon, name, 🔥 streak, and a big tap
   target on the right. One tap = done (tap again = undo, until tomorrow ends). Auto-done rows show their source
   ("CFA · 42 min from Study Desk", "Typing · 7 tests, 48 WPM"). Per-week habits show "0 / 1 this week". Rest days
   listed greyed at the bottom ("Rest day"). Meditation row opens the **10-min timer** (big ring, start/pause, gentle
   chime at the end, screen kept awake). Small "Yesterday" switch to fix yesterday.
2. **Streaks** – per habit: current + best streak, and a GitHub-style year heatmap: done = accent shades, missed =
   red-tinted, rest = hatched grey, freeze = ice blue, before habit start = empty. Tap a cell → that day's details.
3. **Typing** – latest WPM / accuracy, progress bar 43 → 60 WPM, weekly-best WPM line chart (SVG, no chart library),
   tests and minutes per day, last 10 results, "Refresh" (shows calls left today), manual entry.
4. **Shop** – balance; your rewards (add/edit/archive, price); **Freezes** card (pick habit, current price, "1 of 2
   this month", the rules in one line); purchase history.
5. **Week** – Mon–Sun grid per habit (✓ / ✗ / rest / ❄︎), which held and which slipped, Koban earned vs spent,
   perfect-week status, compare with last week; arrows to previous weeks.
6. **Settings** – habits (add, edit, reorder, archive; schedule, rest days incl. the CFA cycle start date, minimums,
   sources, Koban), rewards, Koban values and bonuses, **Sync** (repo, token, password – one form, also unlocks Study
   Desk data), **Monkeytype** ApeKey, backup export/import, about.

**Look:** Study Desk's frosted-glass surface (blurred panels over a soft warm backdrop, same radius, spacing and type),
light + dark, but with Streak's own accent: **Koban gold** (warm gold on light, softer amber on dark). Its own app icon
(a gold coin with a flame). Self-hosted Tabler icons like Study Desk.

### iPhone limits to know
- A web app can't run while it's closed: no reminders, and **the meditation chime only plays if Streak is open** (I keep
  the screen awake during the timer). If you lock the phone, the session still counts when you come back after 10 min.
- No background sync: Streak syncs on open, ~20 s after changes and when you switch away – same as Study Desk.

---

## 7. Build stages (one commit each)

1. **Project + streak engine + tests** – Vite/React/TS scaffold copied from Study Desk, `git init`, `core/day.ts`
   (Zurich days), `core/engine.ts` (schedules, rest rules incl. cycle, per-week, minimums, freezes, anti-cheat, Koban,
   bonuses, levels, badges). Tests: rest days, cycle rest, X-per-week, minimums by weekday, freeze rules (bought before,
   max 1 per habit, 2 per month, rising price, auto-use), midnight boundary (23:59 vs 00:00), DST spring/autumn, ticks
   after midnight, locked days, schedule changes from tomorrow.
2. **Today + Streaks screens** – IndexedDB store, manual ticks, meditation timer, heatmap, glass look + gold accent.
3. **Sync + PWA** – GitHub/crypto/sync copied over, `streak.enc`, read-only Study Desk reader (+ test that it never
   writes), auto-completion, backup export/import, manifest + icons + offline, `deploy.yml`, README (GitHub Pages,
   token, password, installing on iPhone).
4. **Reward shop** – rewards, purchases, freezes, history, levels/badges UI, milestone animation.
5. **Monkeytype** – ApeKey settings, fetcher with daily budget, Typing screen + charts, Typing auto-completion.
6. **Week view** – weekly review, then a final pass: `npm test`, build, click through every screen at phone and Mac
   size, light/dark, offline.

Each stage: `npm test` + `npm run build` green before the commit.

**Your steps (later, in the README):** create a new **public** GitHub repo for the app (Pages on a private repo needs a
paid plan; your data stays in the private sync repo), turn on Pages → Source: GitHub Actions, then in Streak's settings
enter the same sync repo, token and password as in Study Desk, and paste your ApeKey.

---

## 8. Questions (default in bold – "OK" means the defaults)

1. **Sync repo:** is Study Desk sync already connected on your iPhone and Mac? Default: **Streak uses the same private
   repo, token and password** (one form, file `streak.enc` next to `progress.enc`). If sync isn't set up yet, Streak
   works locally and Study Desk auto-ticks start once it is.
2. **"Past days only up to yesterday":** I read this as **today and yesterday are editable, older days locked.** (The
   other reading – "any past day, just not the future" – would allow repairing old streaks.)
3. **Freeze for per-week habits (Gym):** **must be bought before the week starts** (Sunday night at the latest).
   Alternative: before the last day of the week (Sunday) – easier, but you'd already know you'll miss.
4. **CFA:** weekends = **60 min**? And the date of a "long Wednesday" so I can anchor the every-3rd-week cycle
   (default: **the cycle stays off until you set the date in Settings**).
5. **Streak counting:** **completed due days** (rest days skipped, so CFA's streak grows by 5–6 a week), or calendar
   days (rest days count too)?
6. **Vocab:** **manual tick** as written – or should Study Desk vocab reviews auto-tick it (then "Japanese" would need
   something other than cards, e.g. only focus time)?
7. **Japanese focus:** count **study sessions only**, or HSG Japanese lectures too?
