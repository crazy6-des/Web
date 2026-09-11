import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import App from './App';
import Landing from './Landing';
import { api } from './api';

function Root() {
  const [ready, setReady] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    api.session().then(() => setAuthenticated(true)).catch(() => setAuthenticated(false)).finally(() => setReady(true));
  }, []);

  if (!ready) return <div className="app-shell"><div className="loading"><span className="loading-mark">S</span><span>Loading Sphere</span></div></div>;
  return authenticated ? <App /> : <Landing onAuthenticated={() => setAuthenticated(true)} />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
