import { useEffect } from 'react';
import { Icon } from './components/Icon';
import { settleTimer } from './components/MeditationTimer';
import { usePath } from './lib/router';
import { Settings } from './screens/Settings';
import { Streaks } from './screens/Streaks';
import { Today } from './screens/Today';

const TABS = [
  { path: '/', label: 'Today', icon: 'today', screen: Today },
  { path: '/streaks', label: 'Streaks', icon: 'streaks', screen: Streaks },
];

export function App() {
  const path = usePath();
  useEffect(() => settleTimer(), []);
  const tab = TABS.find((t) => t.path === path) ?? (path === '/settings' ? null : TABS[0]);
  const Screen = tab ? tab.screen : Settings;
  return (
    <>
      <main><Screen /></main>
      <nav className="nav" aria-label="Main">
        {TABS.map((t) => (
          <a key={t.path} href={`#${t.path}`} className={t === tab ? 'active' : ''} aria-current={t === tab ? 'page' : undefined}>
            <Icon name={t.icon} size={24} />
            {t.label}
          </a>
        ))}
      </nav>
    </>
  );
}
