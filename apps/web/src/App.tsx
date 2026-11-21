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

type Venue = { id: string; name: string; city: string; address: string };
type OrganizerEvent = {
  id: string; name: string; description: string; startsAt: string; status: 'draft' | 'published' | 'cancelled';
  venue: Venue; categories: Array<{ name: string; basePriceCents: number }>; seats: Array<{ available: boolean }>;
};
type BrowseEvent = { id: string; name: string; description: string; startsAt: string; venue: Venue; categories: Array<{ name: string; basePriceCents: number }>; seats: Array<{ available: boolean }> };

async function apiRequest<T>(path: string, token: string, options: RequestInit = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, ...options.headers },
  });
  const payload = await response.json() as T & { error?: { message?: string } };
  if (!response.ok) throw new Error(payload.error?.message ?? 'Could not complete that action');
  return payload;
}

async function publicRequest<T>(path: string) {
  const response = await fetch(`${API_URL}${path}`);
  const payload = await response.json() as T & { error?: { message?: string } };
  if (!response.ok) throw new Error(payload.error?.message ?? 'Could not load events');
  return payload;
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

function OrganizerDashboard({ session }: { session: Session }) {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [events, setEvents] = useState<OrganizerEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [venueForm, setVenueForm] = useState({ name: '', city: '', address: '' });
  const [eventForm, setEventForm] = useState({ name: '', venueId: '', startsAt: '', description: '', strategy: 'base', status: 'draft' });
  const [categories, setCategories] = useState([{ name: 'General', price: '2500' }]);
  const [rowPlan, setRowPlan] = useState('A:General, B:General, C:General');
  const [seatsPerRow, setSeatsPerRow] = useState('12');

  async function loadDashboard() {
    try {
      setLoading(true);
      const [venuePayload, eventPayload] = await Promise.all([
        apiRequest<{ venues: Venue[] }>('/venues', session.token),
        apiRequest<{ events: OrganizerEvent[] }>('/events/organizer', session.token),
      ]);
      setVenues(venuePayload.venues);
      setEvents(eventPayload.events);
      setEventForm((current) => ({ ...current, venueId: current.venueId || venuePayload.venues[0]?.id || '' }));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not load your studio');
    } finally { setLoading(false); }
  }

  useEffect(() => { void loadDashboard(); }, [session.token]);

  async function createVenue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      await apiRequest<{ venue: Venue }>('/venues', session.token, { method: 'POST', body: JSON.stringify(venueForm) });
      setVenueForm({ name: '', city: '', address: '' }); setMessage('Venue saved.'); await loadDashboard();
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : 'Could not save venue'); }
    finally { setBusy(false); }
  }

  async function createEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    const rows = rowPlan.split(',').map((entry) => {
      const [label, category] = entry.split(':').map((value) => value.trim());
      return { label, category: category || categories[0]?.name || 'General' };
    }).filter((row) => row.label);
    try {
      await apiRequest<{ event: OrganizerEvent }>('/events/organizer', session.token, { method: 'POST', body: JSON.stringify({
        venueId: eventForm.venueId, name: eventForm.name, description: eventForm.description,
        startsAt: new Date(eventForm.startsAt).toISOString(), pricingStrategy: eventForm.strategy, status: eventForm.status,
        seatMap: { rows, seatsPerRow: Number(seatsPerRow) },
        categories: categories.map((category) => ({ name: category.name.trim(), basePriceCents: Number(category.price) })),
      }) });
      setMessage('Event saved.'); setEventForm((current) => ({ ...current, name: '', description: '', startsAt: '' })); await loadDashboard();
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : 'Could not save event'); }
    finally { setBusy(false); }
  }

  async function publishEvent(eventId: string) {
    setBusy(true); setError(''); setMessage('');
    try {
      await apiRequest<{ event: OrganizerEvent }>(`/events/organizer/${eventId}/status`, session.token, { method: 'PATCH', body: JSON.stringify({ status: 'published' }) });
      setMessage('Event published. Customers can see it now.'); await loadDashboard();
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : 'Could not publish event'); }
    finally { setBusy(false); }
  }

  return (
    <div className="studio-shell" id="studio">
      <div className="studio-intro">
        <div><span className="section-kicker">ORGANIZER STUDIO</span><h1>Put something<br /><em>on the calendar.</em></h1><p>Shape the room, set the price, and give people a reason to show up.</p></div>
        <div className="studio-mark"><span>THE</span><strong>BACK<br />STAGE</strong><i>↗</i></div>
      </div>
      <div className="studio-grid">
        <aside className="studio-sidebar">
          <div className="sidebar-label">YOUR VENUES <span>{venues.length.toString().padStart(2, '0')}</span></div>
          {venues.length === 0 ? <p className="sidebar-empty">No venues yet.<br />Start with the room where it happens.</p> : venues.map((venue) => <div className="venue-card" key={venue.id}><strong>{venue.name}</strong><span>{venue.city} · {venue.address}</span></div>)}
          <form className="venue-form" onSubmit={createVenue}>
            <span className="form-label">ADD A VENUE</span>
            <input required placeholder="Venue name" value={venueForm.name} onChange={(event) => setVenueForm({ ...venueForm, name: event.target.value })} />
            <input required placeholder="City" value={venueForm.city} onChange={(event) => setVenueForm({ ...venueForm, city: event.target.value })} />
            <input required placeholder="Address" value={venueForm.address} onChange={(event) => setVenueForm({ ...venueForm, address: event.target.value })} />
            <button className="outline-button" disabled={busy}>Save venue <span>+</span></button>
          </form>
        </aside>
        <section className="studio-content">
          <div className="studio-section-heading"><div><span className="section-kicker">MAKE IT REAL</span><h2>New event</h2></div><span className="studio-rule" /></div>
          {venues.length === 0 && <div className="studio-notice">Add a venue first. Every event needs a room.</div>}
          <form className="event-form" onSubmit={createEvent}>
            <div className="form-field form-field-wide"><label htmlFor="event-name">Event name</label><input id="event-name" required disabled={!venues.length} placeholder="The name people will remember" value={eventForm.name} onChange={(event) => setEventForm({ ...eventForm, name: event.target.value })} /></div>
            <div className="form-row"><div className="form-field"><label htmlFor="event-venue">Venue</label><select id="event-venue" required disabled={!venues.length} value={eventForm.venueId} onChange={(event) => setEventForm({ ...eventForm, venueId: event.target.value })}>{venues.map((venue) => <option key={venue.id} value={venue.id}>{venue.name} · {venue.city}</option>)}</select></div><div className="form-field"><label htmlFor="event-start">Date & time</label><input id="event-start" required disabled={!venues.length} type="datetime-local" value={eventForm.startsAt} onChange={(event) => setEventForm({ ...eventForm, startsAt: event.target.value })} /></div></div>
            <div className="form-field form-field-wide"><label htmlFor="event-description">Short description <span>optional</span></label><textarea id="event-description" disabled={!venues.length} placeholder="What should guests know?" value={eventForm.description} onChange={(event) => setEventForm({ ...eventForm, description: event.target.value })} /></div>
            <div className="map-builder"><div className="builder-heading"><div><span className="form-label">SEAT MAP</span><p>Give each row a category: <b>A:VIP, B:General</b></p></div><div className="seat-total"><strong>{(rowPlan.split(',').filter((row) => row.trim()).length * Number(seatsPerRow || 0)).toString().padStart(2, '0')}</strong><span>SEATS</span></div></div><div className="form-row"><div className="form-field"><label htmlFor="row-plan">Rows & categories</label><input id="row-plan" required disabled={!venues.length} value={rowPlan} onChange={(event) => setRowPlan(event.target.value)} /></div><div className="form-field form-field-small"><label htmlFor="seats-row">Seats / row</label><input id="seats-row" required min="1" max="100" type="number" disabled={!venues.length} value={seatsPerRow} onChange={(event) => setSeatsPerRow(event.target.value)} /></div></div></div>
            <div className="category-builder"><div className="builder-heading"><div><span className="form-label">SEAT CATEGORIES</span><p>Prices are in your local currency’s smallest unit.</p></div><button type="button" className="add-category" onClick={() => setCategories([...categories, { name: '', price: '' }])}>+ Add category</button></div>{categories.map((category, index) => <div className="category-row" key={index}><span className="category-index">0{index + 1}</span><input aria-label={`Category ${index + 1} name`} required disabled={!venues.length} placeholder="Category name" value={category.name} onChange={(event) => setCategories(categories.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))} /><input aria-label={`Category ${index + 1} price`} required disabled={!venues.length} min="0" type="number" placeholder="Price" value={category.price} onChange={(event) => setCategories(categories.map((item, itemIndex) => itemIndex === index ? { ...item, price: event.target.value } : item))} /><button type="button" className="remove-category" disabled={categories.length === 1} onClick={() => setCategories(categories.filter((_, itemIndex) => itemIndex !== index))}>×</button></div>)}</div>
            <div className="event-actions"><select aria-label="Event status" disabled={!venues.length} value={eventForm.status} onChange={(event) => setEventForm({ ...eventForm, status: event.target.value })}><option value="draft">Save as draft</option><option value="published">Publish now</option></select><button className="primary-button" disabled={busy || !venues.length}>{busy ? 'Saving…' : 'Save event →'}</button></div>
            {message && <p className="studio-success" role="status">{message}</p>}{error && <p className="auth-error" role="alert">{error}</p>}
          </form>
          <div className="studio-section-heading event-list-heading"><div><span className="section-kicker">YOUR PROGRAMME</span><h2>Created events</h2></div><span className="studio-rule" /></div>
          {loading ? <p className="sidebar-empty">Loading your programme…</p> : events.length === 0 ? <div className="event-empty"><span>✳</span><div><strong>Your calendar is open.</strong><p>Build your first event above and it will appear here.</p></div></div> : <div className="event-list">{events.map((event) => <article className="event-card" key={event.id}><div className="event-date"><strong>{new Date(event.startsAt).toLocaleDateString(undefined, { day: '2-digit' })}</strong><span>{new Date(event.startsAt).toLocaleDateString(undefined, { month: 'short' }).toUpperCase()}</span></div><div className="event-details"><span className={`event-status ${event.status}`}>{event.status}</span><h3>{event.name}</h3><p>{event.venue.name} · {event.venue.city}</p></div><div className="event-count"><strong>{event.seats.length}</strong><span>SEATS</span>{event.status === 'draft' && <button className="publish-button" disabled={busy} onClick={() => void publishEvent(event.id)}>Publish</button>}</div></article>)}</div>}
        </section>
      </div>
    </div>
  );
}

export function App() {
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [publicEvents, setPublicEvents] = useState<BrowseEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [searchFocused, setSearchFocused] = useState(false);
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

  useEffect(() => {
    void publicRequest<{ events: BrowseEvent[] }>('/events')
      .then((payload) => setPublicEvents(payload.events))
      .catch(() => setPublicEvents([]))
      .finally(() => setEventsLoading(false));
  }, []);

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
    setSearchFocused(false);
    document.getElementById('events')?.scrollIntoView({ behavior: 'smooth' });
  }

  const normalizedQuery = query.trim().toLowerCase();
  const matchingEvents = publicEvents.filter((event) => `${event.name} ${event.venue.city} ${event.venue.name}`.toLowerCase().includes(normalizedQuery));
  const suggestedEvents = normalizedQuery ? matchingEvents : publicEvents;
  const visibleEvents = submittedQuery ? publicEvents.filter((event) => `${event.name} ${event.venue.city} ${event.venue.name}`.toLowerCase().includes(submittedQuery.toLowerCase())) : publicEvents;

  return (
    <div className="site-shell">
      <header className="site-header">
        <a className="brand" href="#top" aria-label="TicketFlow home">
          <span className="brand-mark"><span /><span /><span /><span /></span>
          <span>ticketflow<span className="brand-period">.</span></span>
        </a>
        <nav aria-label="Main navigation">
          {session?.user.role === 'organizer' ? <a href="#studio">Studio</a> : <><a href="#events">Events</a><a href="#how-it-works">How it works</a></>}
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
        {session?.user.role === 'organizer' ? <OrganizerDashboard session={session} /> : <>
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-copy">
            <div className="eyebrow"><span className="eyebrow-line" /> A BETTER WAY TO BE THERE</div>
            <h1 id="hero-title">Find your place<br />in the <em>moment.</em></h1>
            <p>Good nights start with a great seat. Discover events, pick your spot, and keep every ticket in one place.</p>
            <form className="search" onSubmit={searchEvents} role="search">
              <label htmlFor="event-search">What are you looking for?</label>
              <div className="search-row">
                <span className="search-icon" aria-hidden="true">⌕</span>
                <input id="event-search" value={query} onFocus={() => setSearchFocused(true)} onChange={(event) => { setQuery(event.target.value); setSearchFocused(true); }} placeholder="Search events or cities" />
                <button type="submit">Search <span aria-hidden="true">→</span></button>
              </div>
              {searchFocused && <div className="search-suggestions" role="listbox" aria-label="Available events">{suggestedEvents.length ? suggestedEvents.slice(0, 5).map((event) => <button type="button" role="option" key={event.id} onMouseDown={(clickEvent) => clickEvent.preventDefault()} onClick={() => { setQuery(event.name); setSubmittedQuery(event.name); setSearchFocused(false); document.getElementById('events')?.scrollIntoView({ behavior: 'smooth' }); }}><span className="suggestion-icon">↗</span><span><strong>{event.name}</strong><small>{event.venue.city} · {new Date(event.startsAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</small></span></button>) : <p className="no-suggestions">No published events match yet.</p>}</div>}
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
          {eventsLoading ? <div className="empty-events"><div className="empty-symbol" aria-hidden="true">↗</div><div><h3>Finding the next good night.</h3><p>Loading published events.</p></div></div> : visibleEvents.length ? <div className="public-event-grid">{visibleEvents.map((event) => <article className="public-event-card" key={event.id}><div className="public-event-top"><span className="event-status published">UPCOMING</span><span>{new Date(event.startsAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }).toUpperCase()}</span></div><h3>{event.name}</h3><p>{event.venue.name} · {event.venue.city}</p><div className="public-event-meta"><span>{event.seats.filter((seat) => seat.available).length} seats available</span><span>From {Math.min(...event.categories.map((category) => category.basePriceCents))}</span></div></article>)}</div> : <div className="empty-events"><div className="empty-symbol" aria-hidden="true">✳</div><div><h3>{submittedQuery ? `No events found for “${submittedQuery}”` : 'The calendar is getting ready.'}</h3><p>{submittedQuery ? 'Try another event name or city when events are available.' : 'Published events will appear here as soon as organizers add them.'}</p></div></div>}
        </section>

        <section className="how-section" id="how-it-works" aria-labelledby="how-title">
          <div><span className="section-kicker">THE FLOW</span><h2 id="how-title">From “let’s go”<br />to front row.</h2></div>
          <div className="steps">
            <div><span>01</span><h3>Find an event</h3><p>Browse what’s happening and choose your date.</p></div>
            <div><span>02</span><h3>Pick your seat</h3><p>See the venue map and hold the spot you want.</p></div>
            <div><span>03</span><h3>Keep your ticket</h3><p>Pay securely and find your booking in one place.</p></div>
          </div>
        </section>
        </>}
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
