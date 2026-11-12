/** Settings: habits, sync (also unlocks Study Desk data), backup, look. Rewards are edited in the Shop. */
import { useState } from 'react';
import { importBackup, makeBackup, parseBackup } from '../core/backup';
import { connectSync, disconnectSync, PasswordMismatchError, syncNow, useSyncStatus } from '../core/sync';
import { Icon } from '../components/Icon';
import { Section } from '../components/Section';
import { HabitsSection } from './HabitEditor';
import { MonkeytypeSection } from './MonkeytypeSettings';
import { LOOKS, lookOf, readSurface, readTheme, saveLook, type Look, type Surface, type Theme } from '../lib/look';
import { navigate } from '../lib/router';

const ago = (ms?: number) => {
  if (!ms) return 'never';
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86_400) return `${Math.round(s / 3600)} h ago`;
  return new Date(ms).toLocaleDateString('en-GB');
};


function SyncSection() {
  const st = useSyncStatus();
  const [repo, setRepo] = useState('');
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [mismatch, setMismatch] = useState(false);

  const connect = async (startFresh = false) => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await connectSync(repo, token, password, startFresh);
      setMsg(`Connected.${r.studyDesk ? ' Study Desk data found.' : ' No Study Desk data in this repo yet.'}${r.publicRepo ? ' Warning: this repository is public – the files are encrypted, but a private repo is better.' : ''}`);
      setToken('');
      setPassword('');
      setMismatch(false);
    } catch (e) {
      setMismatch(e instanceof PasswordMismatchError && /other devices/.test((e as Error).message));
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (st.phase !== 'off') {
    return (
      <Section title="Sync" id="sync">
        <div className="row">
          <Icon name="cloud" />
          <div className="grow">
            <div style={{ fontWeight: 600 }}>{st.repo}</div>
            <div className="muted small">
              {st.phase === 'syncing' ? 'Syncing…' : `Last sync ${ago(st.lastSync)}`}
              {st.devices && ` · ${Object.values(st.devices).map((d) => d.name).join(', ')}`}
            </div>
          </div>
          <button className="btn small" onClick={() => void syncNow()} disabled={st.phase === 'syncing'}><Icon name="refresh" size={16} /> Sync</button>
        </div>
        {st.error && <p className="small" style={{ color: 'var(--bad)' }}>{st.error}</p>}
        <div className="small">
          <b>Study Desk:</b>{' '}
          {st.studyDesk?.error ? <span style={{ color: 'var(--bad)' }}>{st.studyDesk.error}</span> : st.studyDesk?.at ? `read ${ago(st.studyDesk.at)} (read-only)` : 'not read yet'}
        </div>
        {msg && <p className="small muted">{msg}</p>}
        <div><button className="btn small" onClick={() => void disconnectSync()}>Disconnect this device</button></div>
      </Section>
    );
  }
  return (
    <Section title="Sync" id="sync">
      <p className="muted small">
        Use the same private repository, token and sync password as in Study Desk. Streak keeps its own encrypted file (<code>streak.enc</code>) next to
        Study Desk’s and only ever <i>reads</i> Study Desk’s data.
      </p>
      <label className="field">Repository<input value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="owner/study-sync" autoCapitalize="off" autoCorrect="off" spellCheck={false} /></label>
      <label className="field">GitHub token<input value={token} onChange={(e) => setToken(e.target.value)} type="password" autoComplete="off" placeholder="github_pat_…" /></label>
      <label className="field">Sync password<input value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete="off" /></label>
      <div className="row">
        <button className="btn primary" disabled={busy} onClick={() => void connect()}>{busy ? 'Connecting…' : 'Connect'}</button>
        {mismatch && <button className="btn" disabled={busy} onClick={() => void connect(true)}>Start Streak’s file fresh</button>}
      </div>
      {msg && <p className="small" style={{ color: 'var(--bad)' }}>{msg}</p>}
    </Section>
  );
}

function BackupSection() {
  const [msg, setMsg] = useState<string | null>(null);
  const download = () => {
    const b = makeBackup();
    const url = URL.createObjectURL(new Blob([JSON.stringify(b, null, 1)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `streak-backup-${b.exportedAt.slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const upload = async (file: File | undefined) => {
    if (!file) return;
    try {
      await importBackup(parseBackup(await file.text()));
      setMsg('Backup merged into this device.');
      void syncNow();
    } catch (e) {
      setMsg((e as Error).message);
    }
  };
  return (
    <Section title="Backup">
      <p className="muted small">A JSON file with everything (including your Monkeytype key – keep it private). Importing merges; it never deletes.</p>
      <div className="row">
        <button className="btn" onClick={download}><Icon name="download" size={18} /> Export</button>
        <label className="btn"><Icon name="upload" size={18} /> Import<input type="file" accept="application/json,.json" hidden onChange={(e) => void upload(e.target.files?.[0])} /></label>
      </div>
      {msg && <p className="small muted">{msg}</p>}
    </Section>
  );
}

function LookSection() {
  const [surface, setSurface] = useState<Surface>(readSurface);
  const [theme, setTheme] = useState<Theme>(readTheme);
  const look = lookOf(surface, theme);
  const set = (s: Surface, t: Theme) => {
    setSurface(s);
    setTheme(t);
    saveLook(s, t);
  };
  return (
    <Section title="Look">
      <p className="muted small">The same looks as Study Desk. Leather and Night: flat warm panels. Glass: frosted panels over leather. Apple: neutral panels and the system font.</p>
      <div className="seg" role="radiogroup" aria-label="Look">
        {(Object.keys(LOOKS) as Look[]).map((l) => (
          <button key={l} role="radio" aria-checked={look === l} className={look === l ? 'on' : ''}
            onClick={() => set(LOOKS[l].surface, LOOKS[l].theme ?? (surface === 'flat' ? 'system' : theme))}>
            {LOOKS[l].label}
          </button>
        ))}
      </div>
      {surface !== 'flat' && (
        <>
          <span className="small muted">Appearance – System follows your device</span>
          <div className="seg" role="radiogroup" aria-label="Appearance">
            {(['system', 'light', 'dark'] as const).map((t) => (
              <button key={t} role="radio" aria-checked={theme === t} className={theme === t ? 'on' : ''} onClick={() => set(surface, t)}>{t[0].toUpperCase() + t.slice(1)}</button>
            ))}
          </div>
        </>
      )}
    </Section>
  );
}

export function Settings() {
  return (
    <div className="page stack">
      <header className="page-head">
        <button className="icon-btn" onClick={() => navigate('/')} aria-label="Back"><Icon name="left" /></button>
        <h1>Settings</h1>
      </header>
      <HabitsSection />
      <SyncSection />
      <MonkeytypeSection />
      <BackupSection />
      <LookSection />
      <p className="muted small" style={{ textAlign: 'center' }}>Streak · no accounts, no tracking. Icons: Tabler Icons (MIT).</p>
    </div>
  );
}
