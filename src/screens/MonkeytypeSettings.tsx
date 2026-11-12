/** Settings → Monkeytype: ApeKey and the typing goal. */
import { useState } from 'react';
import { saveSettings, useApp } from '../core/store';
import { refreshTyping, useTypingStatus } from '../core/typingSync';
import { Section } from '../components/Section';

export function MonkeytypeSection() {
  const { settings } = useApp();
  const st = useTypingStatus();
  const [key, setKey] = useState('');
  const [goal, setGoal] = useState(String(settings.wpmGoal));
  const [start, setStart] = useState(String(settings.wpmStart));
  const saveKey = async () => {
    await saveSettings({ apeKey: key.trim() });
    setKey('');
    await refreshTyping(true);
  };
  return (
    <Section title="Monkeytype" id="monkeytype">
      <p className="muted small">
        monkeytype.com → Account settings → Ape keys → Generate, then switch the key to <b>active</b> and paste it here. It syncs encrypted to your
        other devices, so you paste it once.
      </p>
      {settings.apeKey ? (
        <div className="row">
          <span className="grow small">ApeKey saved{st.error ? '' : st.at ? ' · working' : ''}</span>
          <button className="btn small" onClick={() => void saveSettings({ apeKey: undefined })}>Remove</button>
        </div>
      ) : (
        <div className="row">
          <input className="grow" type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder="ApeKey"
            style={{ minHeight: 42, padding: '8px 12px', borderRadius: 12, border: '1px solid var(--line-2)', background: 'transparent', fontSize: 16 }} />
          <button className="btn primary" disabled={!key.trim()} onClick={() => void saveKey()}>Save</button>
        </div>
      )}
      {st.error && <p className="small" style={{ color: 'var(--bad)' }}>{st.error}</p>}
      <div className="row">
        <label className="field grow">Started at (WPM)<input inputMode="numeric" value={start} onChange={(e) => setStart(e.target.value)} onBlur={() => Number(start) > 0 && void saveSettings({ wpmStart: Number(start) })} /></label>
        <label className="field grow">Goal (WPM)<input inputMode="numeric" value={goal} onChange={(e) => setGoal(e.target.value)} onBlur={() => Number(goal) > 0 && void saveSettings({ wpmGoal: Number(goal) })} /></label>
      </div>
    </Section>
  );
}
