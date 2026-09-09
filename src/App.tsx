import { useState } from 'react';

type Section = 'home' | 'search' | 'create' | 'earn' | 'wallet' | 'profile';

const sections: Array<{ id: Section; label: string; icon: string }> = [
  { id: 'home', label: 'Home', icon: '⌂' },
  { id: 'search', label: 'Search', icon: '⌕' },
  { id: 'create', label: 'Create', icon: '+' },
  { id: 'earn', label: 'Earn', icon: '◇' },
  { id: 'wallet', label: 'Wallet', icon: '◫' },
  { id: 'profile', label: 'Profile', icon: '○' },
];

function App() {
  const [section, setSection] = useState<Section>('home');

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">Sphere</div>
        <div className="topbar-actions">
          <button aria-label="Notifications">♡</button>
          <button aria-label="Messages">✉</button>
        </div>
      </header>

      <main className="content">
        {section === 'home' && <Home />}
        {section === 'search' && <Panel title="Search" text="Search people, posts and topics." />}
        {section === 'create' && <Panel title="Create" text="Your image post composer will connect to the Worker API here." />}
        {section === 'earn' && <Panel title="Earn" text="Reward providers are not configured yet. No fake offers or balances are shown." />}
        {section === 'wallet' && <Panel title="Wallet" text="Your server-authoritative wallet and transaction history will appear here." />}
        {section === 'profile' && <Panel title="Profile" text="Authenticated profile data will be loaded from D1." />}
      </main>

      <nav className="bottom-nav" aria-label="Primary navigation">
        {sections.map((item) => (
          <button key={item.id} className={section === item.id ? 'active' : ''} onClick={() => setSection(item.id)}>
            <span className="nav-icon">{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

function Home() {
  return (
    <section>
      <div className="section-heading">
        <div>
          <p className="eyebrow">Social</p>
          <h1>For you</h1>
        </div>
        <button className="quiet-button">Following</button>
      </div>
      <div className="empty-state">
        <div className="empty-mark">S</div>
        <h2>Your feed starts here</h2>
        <p>Connect the API and persistent D1 data to load real posts. Nothing in this screen is mocked.</p>
      </div>
    </section>
  );
}

function Panel({ title, text }: { title: string; text: string }) {
  return (
    <section>
      <div className="section-heading">
        <div>
          <p className="eyebrow">Sphere</p>
          <h1>{title}</h1>
        </div>
      </div>
      <div className="empty-state compact">
        <h2>Ready for backend wiring</h2>
        <p>{text}</p>
      </div>
    </section>
  );
}

export default App;
