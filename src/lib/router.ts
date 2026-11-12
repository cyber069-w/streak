/** A tiny hash router: #/m/hiragana → "/m/hiragana". Hash URLs work on any static host (GitHub Pages). */
import { useSyncExternalStore } from 'react';

const read = () => (location.hash.replace(/^#/, '') || '/').replace(/\/+$/, '') || '/';

function subscribe(cb: () => void) {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
}

export function usePath(): string {
  return useSyncExternalStore(subscribe, read, () => '/');
}

export function navigate(path: string) {
  if (read() === path) return;
  location.hash = path;
  window.scrollTo({ top: 0 });
}

/** Match "/m/:id/:tool" against a path; returns params or null. */
export function match(pattern: string, path: string): Record<string, string> | null {
  const p = pattern.split('/').filter(Boolean);
  const s = path.split('/').filter(Boolean);
  if (p.length !== s.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(':')) params[p[i].slice(1)] = decodeURIComponent(s[i]);
    else if (p[i] !== s[i]) return null;
  }
  return params;
}
