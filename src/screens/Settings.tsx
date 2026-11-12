/** Settings: habits, sync (also unlocks Study Desk data), backup, look. Rewards are edited in the Shop. */
import { useState } from 'react';
import { importBackup, makeBackup, parseBackup } from '../core/backup';
import { connectSync, disconnectSync, PasswordMismatchError, syncNow, useSyncStatus } from '../core/sync';
import { Icon } from '../components/Icon';
import { Section } from '../components/Section';
import { PageHead, Row, Seg } from '../components/ui';
import { HabitsSection } from './HabitEditor';
import { MonkeytypeSection } from './MonkeytypeSettings';
import { LOOKS, lookOf, readSurface, readTheme, saveLook, type Look, type Surface, type Theme } from '../lib/look';

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
      <Section title="Device sync" id="sync">
        <Row
          title={<span className={`sync-status ${st.phase}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}><span className="sync-dot" aria-hidden="true" />{st.repo}</span>}
          desc={`${st.phase === 'syncing' ? 'Syncing…' : `Last sync ${ago(st.lastSync)}`}${st.devices ? ` · ${Object.values(st.devices).map((d) => d.name).join(', ')}` : ''}`}
        >
          <button className="btn btn-sm" onClick={() => void syncNow()} disabled={st.phase === 'syncing'}><Icon name="refresh" size={16} /> Sync now</button>
        </Row>
        <Row title="Study Desk data" desc={st.studyDesk?.error ?? (st.studyDesk?.at ? `Read ${ago(st.studyDesk.at)} – read-only, CFA and Japanese tick themselves.` : 'Not read yet.')} />
        {st.error && <div className="notice bad" style={{ margin: '8px 0' }}>{st.error}</div>}
        {msg && <p className="small muted">{msg}</p>}
        <Row title="This device" desc="Disconnecting keeps your data here and on GitHub.">
          <button className="btn btn-sm btn-danger" onClick={() => void disconnectSync()}>Disconnect</button>
        </Row>
      </Section>
    );
  }
  return (
    <Section title="Device sync" id="sync">
      <p className="muted small" style={{ margin: '4px 0 14px' }}>
        Use the same private repository, token and sync password as in Study Desk. Streak keeps its own encrypted file (<code>streak.enc</code>) next to
        Study Desk’s and only ever <i>reads</i> Study Desk’s data.
      </p>
      <div className="stack" style={{ ['--gap' as string]: '12px' }}>
      <label className="field">Repository<input value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="owner/study-sync" autoCapitalize="off" autoCorrect="off" spellCheck={false} /></label>
      <label className="field">GitHub token<input value={token} onChange={(e) => setToken(e.target.value)} type="password" autoComplete="off" placeholder="github_pat_…" /></label>
      <label className="field">Sync password<input value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete="off" /></label>
      <div className="row">
        <button className="btn btn-primary" disabled={busy} onClick={() => void connect()}>{busy ? 'Connecting…' : 'Connect'}</button>
        {mismatch && <button className="btn" disabled={busy} onClick={() => void connect(true)}>Start Streak’s file fresh</button>}
      </div>
      {msg && <div className="notice bad">{msg}</div>}
      </div>
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
      <Row title="Export" desc="A JSON file with everything (including your Monkeytype key – keep it private).">
        <button className="btn btn-sm" onClick={download}><Icon name="download" size={16} /> Export</button>
      </Row>
      <Row title="Import" desc="Merges a backup into this device; it never deletes anything.">
        <label className="btn btn-sm"><Icon name="upload" size={16} /> Import<input type="file" accept="application/json,.json" hidden onChange={(e) => void upload(e.target.files?.[0])} /></label>
      </Row>
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
    <Section title="Display">
      <Row title="Look" desc="The same looks as Study Desk. Leather and Night: flat warm panels. Glass: frosted panels over leather. Apple: neutral panels, system font.">
        <Seg label="Look" value={look} options={(Object.keys(LOOKS) as Look[]).map((l) => [l, LOOKS[l].label])}
          onChange={(l) => set(LOOKS[l].surface, LOOKS[l].theme ?? (surface === 'flat' ? 'system' : theme))} />
      </Row>
      {surface !== 'flat' && (
        <Row title="Appearance" desc="Light or dark – System follows your device.">
          <Seg label="Appearance" value={theme} options={[['system', 'System'], ['light', 'Light'], ['dark', 'Dark']]} onChange={(t) => set(surface, t)} />
        </Row>
      )}
    </Section>
  );
}

export function Settings() {
  return (
    <div className="page">
      <PageHead title="Settings" sub="Habits, sync, Monkeytype, backup and how Streak looks." />
      <div className="stack">
        <HabitsSection />
        <SyncSection />
        <MonkeytypeSection />
        <LookSection />
        <BackupSection />
        <p className="faint small center">Streak · offline · no ads · no tracking. Icons: Tabler Icons (MIT).</p>
      </div>
    </div>
  );
}
