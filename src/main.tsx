import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import SphereFinish from './SphereFinish';
import Landing from './Landing';
import { api, User } from './api';

function Root() {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  useEffect(() => {
    api.session().then(r => setUser(r.user)).catch(() => setUser(null)).finally(() => setReady(true));
  }, []);
  if (!ready) return <div className="app-shell"><div className="loading"><span className="loading-mark">S</span><span>Loading Sphere</span></div></div>;
  return user ? <SphereFinish user={user} onLogout={() => api.logout().finally(() => setUser(null))} /> : <Landing onAuthenticated={() => api.session().then(r => setUser(r.user))} />;
}

createRoot(document.getElementById('root')!).render(<StrictMode><Root /></StrictMode>);
