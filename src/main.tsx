import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Navigate, useSearchParams } from 'react-router-dom';
import App from './App';
import { initClickRipple } from './lib/ripple';
import { SeasonDecor } from './components/SeasonDecor';
import './index.css';

/** Le site est servi sous /seconde-plateforme/ sur GitHub Pages. */
const BASENAME = import.meta.env.BASE_URL.replace(/\/$/, '');

// Service worker (pages HTML en « réseau d'abord »).
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js').catch(() => {});
  });
}

initClickRipple();

/**
 * GitHub Pages ne connaît pas les routes de l'application : public/404.html
 * renvoie vers /?redirect=/chemin, et on reprend ici la route demandée.
 */
function Root() {
  const [searchParams] = useSearchParams();
  const redirect = searchParams.get('redirect');

  if (redirect && redirect.startsWith('/')) {
    return <Navigate to={redirect} replace />;
  }
  return <App />;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter basename={BASENAME}>
      <div className="liquid-bg" aria-hidden="true">
        <span />
      </div>
      <SeasonDecor />
      <div className="app-root">
        <Root />
      </div>
    </BrowserRouter>
  </React.StrictMode>
);
