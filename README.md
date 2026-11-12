# Streak

**Live:** https://cyber069-w.github.io/streak/

A private habit tracker with streaks and a reward system (Koban), next to Study Desk. Installable web app (PWA) for
iPhone and Mac: works offline, no backend, no accounts, no tracking. Data lives in IndexedDB on each device and syncs
encrypted through your own private GitHub repo – the same one Study Desk uses.

- **Today** – one tap ticks a habit; Study Desk (CFA, Japanese) and Monkeytype (Typing) tick themselves.
- **Streaks** – current and best streak per habit, a year heatmap (done / missed / rest / freeze).
- **Typing** – Monkeytype WPM, accuracy, weekly best, progress to your goal.
- **Week** – what held, what slipped, Koban earned and spent.
- **Shop** – your own rewards, streak freezes, purchase history.
- **Settings** – habits, schedules, rest days, rewards, sync, Monkeytype key, backup.

The rules (rest days, per-week habits, freezes, anti-cheating, Koban) are in [PLAN.md](PLAN.md) and in
`src/core/engine.ts`, which is covered by unit tests.

## Setup (once)

### 1. Put the app on GitHub Pages
1. Create a new **public** repository on GitHub, e.g. `streak` (Pages on a private repo needs a paid plan – your data
   does *not* go here, only the app's code).
2. Push this folder to it:
   ```bash
   git remote add origin https://github.com/<you>/streak.git
   git push -u origin main
   ```
3. On GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions.**
4. Every push to `main` runs the tests and the build and publishes the app to `https://<you>.github.io/streak/`
   (`.github/workflows/deploy.yml`, the same workflow as Study Desk).

### 2. Connect sync (on each device)
Streak uses **the same private repo, token and sync password as Study Desk**.

1. Open Streak → gear icon (Settings) → **Sync**.
2. Repository: the same `owner/name` as in Study Desk's device sync.
3. GitHub token: the same fine-grained token (it needs **Contents: Read and write** on that repo). If you don't have
   it any more: GitHub → Settings → Developer settings → Fine-grained tokens → Generate → *Only select repositories*
   → your sync repo → Permissions → Contents: Read and write.
4. Sync password: the same as in Study Desk.

Streak then keeps its own encrypted file `streak.enc` next to Study Desk's `progress.enc`. It **only reads**
`progress.enc` (focus sessions and card reviews) and never writes it. If Study Desk isn't synced yet, Streak works
locally and the auto-ticks start once Study Desk's data is in the repo.

### 3. Monkeytype (optional)
monkeytype.com → Account settings → **Ape keys** → Generate → switch the key to **active** → paste it in Streak's
Settings → Monkeytype. While the app is open, Streak asks Monkeytype for your last result every 5 minutes (a cheap
call, 60 an hour), so a new test shows up right away. The full result list is limited to 30 calls a day per ApeKey
(Study Desk's Mac job uses one), so Streak loads it only once after new tests came in, or when you tap Refresh –
at most 10 times a day per device. Results sync to your other devices.

### 4. Install on the iPhone
Open the Pages URL in **Safari** → Share → **Add to Home Screen**. Streak then opens full-screen like an app and
works offline. On the Mac: Safari → File → **Add to Dock** (or Chrome → Install).

Limits of a web app on iPhone: it can't run while closed – no reminders, and the meditation chime only plays while
Streak is open (the screen stays on during the timer; if you lock the phone the session still counts).

## Backup
Settings → Backup → **Export** saves everything as JSON (including your ApeKey – keep it private). **Import** merges a
backup into the device; it never deletes anything.

## Development
```bash
export PATH=$HOME/.local/node/bin:$PATH   # Node ≥ 22.12
npm ci
npm run dev        # http://localhost:5173
npm test           # unit tests (streak engine, sync, Study Desk reader, shop rules, Monkeytype)
npm run build      # typecheck + production build
swift scripts/make-icons.swift public/icons          # app icons
node scripts/build-icons.mjs <tabler>/icons/outline  # bundled Tabler icons
```

Code map: `src/core/day.ts` (Zurich days, DST-safe) · `engine.ts` (streaks, freezes, Koban, levels, badges) ·
`shop.ts` · `store.ts` (IndexedDB + React) · `kvSync.ts`, `sync.ts`, `github.ts`, `lib/crypto.ts` (adapted from Study
Desk) · `studyDesk.ts` (read-only extract) · `screens/` · `components/`.
