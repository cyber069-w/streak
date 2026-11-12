/**
 * The four looks from Study Desk (Settings → Display there): Leather and Night (flat warm panels, light / dark),
 * Glass (frosted panels over leather) and Apple (neutral grouped panels, system font) – the last two follow the
 * device or a forced light/dark. Streak keeps its own gold accent in all of them. Stored per device.
 */
export type Surface = 'flat' | 'glass' | 'apple';
export type Theme = 'system' | 'light' | 'dark';
export type Look = 'leather' | 'night' | 'glass' | 'apple';

export const LOOKS: Record<Look, { surface: Surface; theme?: Theme; label: string }> = {
  leather: { surface: 'flat', theme: 'light', label: 'Leather' },
  night: { surface: 'flat', theme: 'dark', label: 'Night' },
  glass: { surface: 'glass', label: 'Glass' },
  apple: { surface: 'apple', label: 'Apple' },
};

const read = <T extends string>(key: string, fallback: T): T => {
  try {
    return (localStorage.getItem(key) as T) || fallback;
  } catch {
    return fallback;
  }
};
const write = (key: string, v: string) => {
  try {
    localStorage.setItem(key, v);
  } catch { /* private mode: the look just isn't remembered */ }
};

export const readSurface = () => read<Surface>('streak:surface', 'glass');
export const readTheme = () => read<Theme>('streak:theme', 'system');
export const lookOf = (surface: Surface, theme: Theme): Look => (surface === 'apple' ? 'apple' : surface === 'glass' ? 'glass' : theme === 'dark' ? 'night' : 'leather');

const isDark = (theme: Theme) => theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);

/** Put the saved look on <html> and colour the browser / status bar to match. */
export function applyLook(surface = readSurface(), theme = readTheme()) {
  const root = document.documentElement;
  root.dataset.surface = surface;
  if (theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = theme;
  const dark = isDark(theme);
  const color = surface === 'apple' ? (dark ? '#2b2b2e' : '#f2f2f7') : dark ? '#2a1a12' : '#a86948';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color);
}

export function saveLook(surface: Surface, theme: Theme) {
  write('streak:surface', surface);
  write('streak:theme', theme);
  applyLook(surface, theme);
}

/** Follow the device switching between light and dark (for "System"). */
export function watchSystemTheme() {
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => applyLook());
}
