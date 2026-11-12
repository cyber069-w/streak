import { useEffect } from 'react';
import { Icon } from './components/Icon';
import { settleTimer } from './components/MeditationTimer';
import { usePath } from './lib/router';
import { Settings } from './screens/Settings';
import { Shop } from './screens/Shop';
import { Streaks } from './screens/Streaks';
import { Today } from './screens/Today';
import { Typing } from './screens/Typing';

const TABS = [
  { path: '/', label: 'Today', icon: 'today', screen: Today },
  { path: '/streaks', label: 'Streaks', icon: 'streaks', screen: Streaks },
  { path: '/typing', label: 'Typing', icon: 'typing', screen: Typing },
  { path: '/shop', label: 'Shop', icon: 'shop', screen: Shop },
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
