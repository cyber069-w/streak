/** Settings → Monkeytype: ApeKey and the typing goal. */
import { useState } from 'react';
import { saveSettings, useApp } from '../core/store';
import { refreshTyping, useTypingStatus } from '../core/typingSync';
import { Section } from '../components/Section';
import { Row } from '../components/ui';

export function MonkeytypeSection() {
  const { settings } = useApp();
  const st = useTypingStatus();
  const [key, setKey] = useState('');
  const [goal, setGoal] = useState(String(settings.wpmGoal));
  const [start, setStart] = useState(String(settings.wpmStart));
  const saveKey = async () => {
    await saveSettings({ apeKey: key.trim() });
    setKey('');
    await refreshTyping();
  };
  return (
    <Section title="Monkeytype" id="monkeytype">
      {settings.apeKey ? (
        <Row title="ApeKey" desc={st.error ? undefined : st.at ? 'Saved and working.' : 'Saved.'}>
          <button className="btn btn-sm btn-danger" onClick={() => void saveSettings({ apeKey: undefined })}>Remove</button>
        </Row>
      ) : (
        <div className="setting" style={{ display: 'block' }}>
          <div className="setting-text" style={{ marginBottom: 10 }}>
            <b>ApeKey</b>
            <span>monkeytype.com → Account settings → Ape keys → Generate, then switch it to <b>active</b> and paste it here. It syncs encrypted to your other devices.</span>
          </div>
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <input className="input" type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder="Paste your ApeKey" />
            <button className="btn btn-primary" disabled={!key.trim()} onClick={() => void saveKey()}>Save</button>
          </div>
        </div>
      )}
      {st.error && <div className="notice bad" style={{ margin: '8px 0' }}>{st.error}</div>}
      <div className="fields" style={{ paddingTop: 12 }}>
        <label className="field">Started at (WPM)<input inputMode="numeric" value={start} onChange={(e) => setStart(e.target.value)} onBlur={() => Number(start) > 0 && void saveSettings({ wpmStart: Number(start) })} /></label>
        <label className="field">Goal (WPM)<input inputMode="numeric" value={goal} onChange={(e) => setGoal(e.target.value)} onBlur={() => Number(goal) > 0 && void saveSettings({ wpmGoal: Number(goal) })} /></label>
      </div>
    </Section>
  );
}
