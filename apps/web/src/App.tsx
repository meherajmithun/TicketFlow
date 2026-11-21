import { useEffect, useState, type FormEvent } from 'react';

type Role = 'organizer' | 'customer';
type PublicUser = { id: string; email: string; role: Role };
type Session = { token: string; user: PublicUser };

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

async function authRequest(path: string, body: Record<string, string>) {
  const response = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await response.json() as { user?: PublicUser; token?: string; error?: { message?: string } };
  if (!response.ok) throw new Error(payload.error?.message ?? 'Something went wrong');
  return payload as Session;
}

const seats = Array.from({ length: 48 }, (_, index) => index);

function SeatPreview() {
  return (
    <div className="seat-preview" aria-hidden="true">
      <div className="preview-topline"><span>THE STAGE</span><span>YOUR SEAT AWAITS</span></div>
      <div className="stage" />
      <div className="seat-grid">
        {seats.map((seat) => (
          <span
            className={`seat ${[8, 13, 23, 28, 37].includes(seat) ? 'seat-selected' : ''}`}
            key={seat}
          />
        ))}
      </div>
      <div className="preview-legend"><span><i className="legend-dot" /> Available</span><span><i className="legend-dot selected" /> Your picks</span></div>
    </div>
  );
}

export function App() {
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [session, setSession] = useState<Session | null>(() => {
    const saved = localStorage.getItem('ticketflow-session');
    return saved ? JSON.parse(saved) as Session : null;
  });
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authError, setAuthError] = useState('');
  const [authBusy, setAuthBusy] = useState(false);

  useEffect(() => {
    if (session) localStorage.setItem('ticketflow-session', JSON.stringify(session));
    else localStorage.removeItem('ticketflow-session');
  }, [session]);

  function openAuth(mode: 'login' | 'register') {
    setAuthMode(mode);
    setAuthError('');
    setAuthOpen(true);
  }

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthBusy(true);
    setAuthError('');
    const form = new FormData(event.currentTarget);
    try {
      const sessionResult = await authRequest(
        authMode === 'login' ? '/auth/login' : '/auth/register',
        {
          email: String(form.get('email') ?? ''),
          password: String(form.get('password') ?? ''),
          ...(authMode === 'register' ? { role: String(form.get('role') ?? 'customer') } : {}),
        },
      );
      setSession(sessionResult);
      setAuthOpen(false);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Unable to continue');
    } finally {
      setAuthBusy(false);
    }
  }

  function searchEvents(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmittedQuery(query.trim());
    document.getElementById('events')?.scrollIntoView({ behavior: 'smooth' });
  }

  return (
    <div className="site-shell">
      <header className="site-header">
        <a className="brand" href="#top" aria-label="TicketFlow home">
          <span className="brand-mark"><span /><span /><span /><span /></span>
          <span>ticketflow<span className="brand-period">.</span></span>
        </a>
        <nav aria-label="Main navigation">
          <a href="#events">Events</a>
          <a href="#how-it-works">How it works</a>
        </nav>
        {session ? (
          <div className="account-menu">
            <span className="account-greeting">Hi, {session.user.email.split('@')[0]}</span>
            <span className="role-pill">{session.user.role}</span>
            <button className="text-button" onClick={() => setSession(null)}>Sign out</button>
          </div>
        ) : (
          <div className="account-actions">
            <button className="text-button" onClick={() => openAuth('login')}>Sign in</button>
            <button className="header-link header-button" onClick={() => openAuth('register')}>Join TicketFlow <span aria-hidden="true">↗</span></button>
          </div>
        )}
      </header>

      <main id="top">
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-copy">
            <div className="eyebrow"><span className="eyebrow-line" /> A BETTER WAY TO BE THERE</div>
            <h1 id="hero-title">Find your place<br />in the <em>moment.</em></h1>
            <p>Good nights start with a great seat. Discover events, pick your spot, and keep every ticket in one place.</p>
            <form className="search" onSubmit={searchEvents} role="search">
              <label htmlFor="event-search">What are you looking for?</label>
              <div className="search-row">
                <span className="search-icon" aria-hidden="true">⌕</span>
                <input id="event-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search events or cities" />
                <button type="submit">Search <span aria-hidden="true">→</span></button>
              </div>
            </form>
          </div>
          <div className="hero-visual">
            <div className="orbit orbit-one" /><div className="orbit orbit-two" />
            <SeatPreview />
            <div className="visual-caption">A PLACE FOR EVERYONE <span>↗</span></div>
          </div>
        </section>

        <section className="events-section" id="events" aria-labelledby="events-title">
          <div className="section-heading"><div><span className="section-kicker">DISCOVER</span><h2 id="events-title">Upcoming events</h2></div><span className="section-line" /></div>
          <div className="empty-events">
            <div className="empty-symbol" aria-hidden="true">✳</div>
            <div>
              <h3>{submittedQuery ? `No events found for “${submittedQuery}”` : 'The calendar is getting ready.'}</h3>
              <p>{submittedQuery ? 'Try another event name or city when events are available.' : 'Events will appear here as soon as organizers publish them.'}</p>
            </div>
          </div>
        </section>

        <section className="how-section" id="how-it-works" aria-labelledby="how-title">
          <div><span className="section-kicker">THE FLOW</span><h2 id="how-title">From “let’s go”<br />to front row.</h2></div>
          <div className="steps">
            <div><span>01</span><h3>Find an event</h3><p>Browse what’s happening and choose your date.</p></div>
            <div><span>02</span><h3>Pick your seat</h3><p>See the venue map and hold the spot you want.</p></div>
            <div><span>03</span><h3>Keep your ticket</h3><p>Pay securely and find your booking in one place.</p></div>
          </div>
        </section>
      </main>
      <footer className="site-footer"><span>ticketflow<span className="brand-period">.</span></span><span>Made for the moments that matter.</span></footer>
      {authOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setAuthOpen(false); }}>
          <section className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title">
            <button className="modal-close" aria-label="Close account dialog" onClick={() => setAuthOpen(false)}>×</button>
            <span className="section-kicker">YOUR TICKETFLOW</span>
            <h2 id="auth-title">{authMode === 'login' ? 'Welcome back.' : 'Make room for more moments.'}</h2>
            <p className="auth-intro">{authMode === 'login' ? 'Sign in to keep your tickets and bookings together.' : 'Create an account to discover events or publish your own.'}</p>
            <div className="auth-tabs" role="tablist" aria-label="Account action">
              <button className={authMode === 'login' ? 'active' : ''} onClick={() => { setAuthMode('login'); setAuthError(''); }}>Sign in</button>
              <button className={authMode === 'register' ? 'active' : ''} onClick={() => { setAuthMode('register'); setAuthError(''); }}>Create account</button>
            </div>
            <form className="auth-form" onSubmit={submitAuth}>
              <label htmlFor="auth-email">Email address</label>
              <input id="auth-email" name="email" type="email" autoComplete="email" required placeholder="you@example.com" />
              <label htmlFor="auth-password">Password</label>
              <input id="auth-password" name="password" type="password" autoComplete={authMode === 'login' ? 'current-password' : 'new-password'} minLength={5} required placeholder="At least 5 characters" />
              {authMode === 'register' && <>
                <label htmlFor="auth-role">I am joining as</label>
                <select id="auth-role" name="role" defaultValue="customer">
                  <option value="customer">Customer — discover and book events</option>
                  <option value="organizer">Organizer — create and manage events</option>
                </select>
              </>}
              {authError && <p className="auth-error" role="alert">{authError}</p>}
              <button className="auth-submit" disabled={authBusy}>{authBusy ? 'Please wait…' : authMode === 'login' ? 'Sign in →' : 'Create account →'}</button>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
