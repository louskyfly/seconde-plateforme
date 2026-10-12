import React, { useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Navigate, useSearchParams } from 'react-router-dom';
import App from './App';
import './index.css';

const BASENAME = '/seconde-plateforme';

function Root() {
  const [searchParams] = useSearchParams();
  const redirect = searchParams.get('redirect');
  
  useEffect(() => {
    if (redirect) {
      // Nettoie l'URL après redirection
      window.history.replaceState({}, '', BASENAME + '/');
    }
  }, [redirect]);

  if (redirect) {
    return <Navigate to={redirect} replace />;
  }

  return <App />;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter basename={BASENAME}>
      <Root />
    </BrowserRouter>
  </React.StrictMode>
);