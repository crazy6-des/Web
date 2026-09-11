import { FormEvent, useState } from 'react';
import { api, ApiError } from './api';
import './landing.css';

type Mode = 'login' | 'signup' | 'forgot';

export default function Landing({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [mode, setMode] = useState<Mode | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const open = (next: Mode) => {
    setMode(next);
    setError('');
    setAgreed(false);
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!agreed) {
      setError('Please accept the Sphere community terms before continuing.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      if (mode === 'forgot') {
        await api.forgotPassword(email);
        setError('If that account exists, a reset email has been sent.');
        return;
      }
      if (mode === 'login') await api.login({ email, password });
      else await api.signup({ username, email, password });
      onAuthenticated();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Unable to connect to Sphere.');
    } finally {
      setBusy(false);
    }
  }

  if (mode) {
    return (
      <main className="landing-auth">
        <button className="landing-back" onClick={() => setMode(null)} aria-label="Back to Sphere home">← Sphere</button>
        <section className="auth-panel">
          <div className="mini-brand"><span>S</span> Sphere</div>
          <p className="landing-kicker">{mode === 'login' ? 'Welcome back' : mode === 'signup' ? 'Join the community' : 'Account recovery'}</p>
          <h1>{mode === 'login' ? 'Come back to your people.' : mode === 'signup' ? 'Make your corner of Sphere.' : 'Reset your password.'}</h1>
          <p className="auth-subcopy">Your account, conversations, posts and settings stay connected to Sphere's server-side platform.</p>
          <form onSubmit={submit} className="landing-form">
            {mode === 'signup' && <label>Username<input value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" required minLength={3} maxLength={30} placeholder="yourname" /></label>}
            <label>Email<input value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" type="email" required placeholder="you@example.com" /></label>
            {mode !== 'forgot' && <label>Password<input value={password} onChange={e => setPassword(e.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} type="password" required minLength={8} placeholder="At least 8 characters" /></label>}
            <label className="consent-row"><input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} /><span><strong>I agree to the Sphere community terms.</strong><small>Be respectful, protect people's privacy, and don't abuse the platform. See our Terms, Privacy and Community Standards below.</small></span></label>
            {error && <div className={mode === 'forgot' && error.startsWith('If ') ? 'landing-notice' : 'landing-error'}>{error}</div>}
            <button className="landing-primary" disabled={busy || !agreed}>{busy ? 'Working…' : mode === 'login' ? 'Log in' : mode === 'signup' ? 'Create account' : 'Send reset email'}</button>
          </form>
          <div className="auth-switches">
            {mode === 'login' && <button onClick={() => open('forgot')}>Forgot password?</button>}
            {mode === 'signup' ? <button onClick={() => open('login')}>Already on Sphere? Log in</button> : mode !== 'forgot' ? <button onClick={() => open('signup')}>New here? Create an account</button> : <button onClick={() => open('login')}>Back to log in</button>}
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="landing-page">
      <header className="landing-nav">
        <div className="landing-logo"><span>S</span><strong>Sphere</strong></div>
        <div className="landing-nav-actions"><button onClick={() => open('login')}>Log in</button><button className="landing-nav-cta" onClick={() => open('signup')}>Join Sphere</button></div>
      </header>

      <section className="landing-hero">
        <div className="hero-copy">
          <p className="landing-kicker">A social space with room to be yourself</p>
          <h1>Find your people.<br /><em>Share what matters.</em></h1>
          <p className="hero-text">Sphere brings posts, conversations, discovery and your community into one calm, fast web experience. No noisy clutter. Just people and things worth coming back to.</p>
          <div className="hero-actions"><button className="landing-primary hero-button" onClick={() => open('signup')}>Create your account</button><button className="landing-secondary" onClick={() => open('login')}>I already have an account</button></div>
          <div className="hero-trust"><span>✓ Real accounts</span><span>✓ Server-backed posts</span><span>✓ Your controls</span></div>
        </div>
        <div className="hero-stage" aria-hidden="true">
          <div className="orbit orbit-one" /><div className="orbit orbit-two" />
          <div className="social-card card-main"><div className="card-top"><span className="avatar-dot">S</span><span><b>@sphere</b><small>just now</small></span><i>•••</i></div><h3>There is always room for one more good conversation.</h3><div className="fake-image"><span>S</span></div><div className="card-actions"><span>♡ 248</span><span>◯ 31</span><span>⌑</span></div></div>
          <div className="social-card card-float"><span className="pulse-dot" /><div><b>New connection</b><small>Someone followed your work</small></div></div>
        </div>
      </section>

      <section className="landing-features">
        <article><span>01</span><h2>A home that feels alive</h2><p>See fresh posts, replies and people worth discovering without turning the interface into a wall of noise.</p></article>
        <article><span>02</span><h2>People before metrics</h2><p>Profiles, conversations, follows, saves and messages are designed to make relationships the reason you return.</p></article>
        <article><span>03</span><h2>Built for the web</h2><p>Fast navigation, responsive layouts and lightweight media keep Sphere comfortable on phones, tablets and desktops.</p></article>
      </section>

      <section className="landing-manifesto"><p className="landing-kicker">The Sphere standard</p><h2>Useful social should feel human.</h2><p>We are building the social layer first: identity, discovery, conversation and community. Earning features can come later, without compromising the core experience.</p></section>

      <footer className="landing-footer">
        <div><div className="landing-logo"><span>S</span><strong>Sphere</strong></div><p>Social, made useful.</p></div>
        <div className="policy-grid"><section><b>Community</b><a href="#community">Community Standards</a><a href="#safety">Safety & reporting</a></section><section><b>Account</b><a href="#privacy">Privacy</a><a href="#terms">Terms</a></section><section><b>Product</b><a href="#features">About Sphere</a><a href="#access">Accessibility</a></section></div>
        <p className="footer-note">By creating an account, you agree to use Sphere responsibly and respect other members. Account and social activity are handled through the Sphere backend.</p>
      </footer>
    </main>
  );
}
