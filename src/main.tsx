import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/roboto-mono';
import './styles/app.css';
import { App } from './App';
import { initStore } from './core/store';
import { startSync } from './core/sync';
import { startTypingSync } from './core/typingSync';
import { applyTheme } from './screens/Settings';

// keep data on iPhone even under storage pressure (installed web apps are exempt anyway)
void navigator.storage?.persist?.();
applyTheme();
void initStore().then(() => {
  void startSync();
  startTypingSync();
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
