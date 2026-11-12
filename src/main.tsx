import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/roboto-mono';
import './styles/app.css';
import { App } from './App';
import { initStore } from './core/store';

// keep data on iPhone even under storage pressure (installed web apps are exempt anyway)
void navigator.storage?.persist?.();
void initStore();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
