/** App shell like Study Desk's: sidebar on wide screens, bottom tab bar on phones. */
import { useEffect, type ReactNode } from 'react';
import { Icon } from './components/Icon';
import { settleTimer } from './components/MeditationTimer';
import { useApp } from './core/store';
import { useSyncStatus } from './core/sync';
import { usePath } from './lib/router';
import { Settings } from './screens/Settings';
import { Shop } from './screens/Shop';
import { Streaks } from './screens/Streaks';
import { Today } from './screens/Today';
import { Typing } from './screens/Typing';
import { Week } from './screens/Week';

const NAV = [
  { path: '/', label: 'Today', icon: 'today', screen: Today },
  { path: '/streaks', label: 'Streaks', icon: 'streaks', screen: Streaks },
  { path: '/typing', label: 'Typing', icon: 'typing', screen: Typing },
  { path: '/week', label: 'Week', icon: 'week', screen: Week },
  { path: '/shop', label: 'Shop', icon: 'shop', screen: Shop },
  { path: '/settings', label: 'Settings', icon: 'settings', screen: Settings },
];

const timeAgo = (ms: number) => {
  const s = Math.round((Date.now() - ms) / 1000);
  return s < 60 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86_400 ? `${Math.round(s / 3600)} h ago` : new Date(ms).toLocaleDateString('en-GB');
};

function SyncLine() {
  const s = useSyncStatus();
  if (s.phase === 'off') return null;
  const text = s.phase === 'syncing' ? 'Syncing…' : s.phase === 'error' ? 'Sync problem – see Settings' : s.lastSync ? `Synced ${timeAgo(s.lastSync)}` : 'Sync on';
  return (
    <a className={`sidebar-sync sync-status ${s.phase}`} href="#/settings">
      <span className="sync-dot" aria-hidden="true" /> {text}
    </a>
  );
}

function Shell({ path, children }: { path: string; children: ReactNode }) {
  const syncError = useSyncStatus().phase === 'error';
  const active = (p: string) => path === p;
  return (
    <div className="shell">
      <aside className="sidebar">
        <a className="brand" href="#/">
          <span className="seal seal-logo" aria-hidden="true"><img src="icons/streak-logo.svg" alt="" /></span>
          <span>
            <div className="brand-name">Streak</div>
            <div className="brand-sub">Habit tracker</div>
          </span>
        </a>
        <nav className="nav" aria-label="Main">
          {NAV.filter((n) => n.path !== '/settings').map((n) => (
            <a key={n.path} href={`#${n.path}`} className={`nav-item${active(n.path) ? ' active' : ''}`} aria-current={active(n.path) ? 'page' : undefined}>
              <Icon name={n.icon} />
              {n.label}
            </a>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <nav className="nav" aria-label="Settings">
            <a href="#/settings" className={`nav-item${active('/settings') ? ' active' : ''}`} aria-current={active('/settings') ? 'page' : undefined}>
              <Icon name="settings" />
              Settings
            </a>
          </nav>
          <div className="sidebar-foot">
            <SyncLine />
            Offline · no ads · your data stays yours
          </div>
        </div>
      </aside>
      <main className="main" key={path}>{children}</main>
      <nav className="bottom-nav" aria-label="Main">
        {NAV.map((n) => (
          <a key={n.path} href={`#${n.path}`} className={active(n.path) ? 'active' : ''} aria-current={active(n.path) ? 'page' : undefined}>
            <Icon name={n.icon} size={22} />
            {n.label}
            {n.path === '/settings' && syncError && <span className="nav-dot nav-alert" aria-label="Sync problem" />}
          </a>
        ))}
      </nav>
    </div>
  );
}

export function App() {
  const ready = useApp().ready;
  const path = usePath();
  useEffect(() => settleTimer(), []);
  if (!ready)
    return (
      <div className="state" aria-busy="true">
        <div>
          <div className="loading-bar" style={{ margin: '0 auto 14px' }} />
          Loading your habits…
        </div>
      </div>
    );
  const known = NAV.some((n) => n.path === path);
  const Screen = (NAV.find((n) => n.path === path) ?? NAV[0]).screen;
  return (
    <Shell path={known ? path : '/'}>
      <Screen />
    </Shell>
  );
}
