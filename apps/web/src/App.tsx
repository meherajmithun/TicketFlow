import { useState, type FormEvent } from 'react';

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
        <a className="header-link" href="#events">Explore events <span aria-hidden="true">↗</span></a>
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
    </div>
  );
}
