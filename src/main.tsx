import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { initClickRipple } from './lib/ripple';
import { SeasonDecor } from './components/SeasonDecor';
import './index.css';

// Register service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

initClickRipple();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <div className="liquid-bg" aria-hidden="true">
        <span />
      </div>
      <SeasonDecor />
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
