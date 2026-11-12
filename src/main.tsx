import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/roboto-mono';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/apple.css';
import './styles/streak.css';
import { App } from './App';
import { initStore } from './core/store';
import { startSync } from './core/sync';
import { startTypingSync } from './core/typingSync';
import { applyLook, watchSystemTheme } from './lib/look';

// keep data on iPhone even under storage pressure (installed web apps are exempt anyway)
void navigator.storage?.persist?.();
applyLook();
watchSystemTheme();
void initStore().then(() => {
  void startSync();
  startTypingSync();
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
