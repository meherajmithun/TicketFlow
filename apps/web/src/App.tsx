import { useLayoutEffect, useEffect, useState, useCallback, useRef, type FormEvent } from "react";

// ─── Theme helpers ────────────────────────────────────────────
function getInitialTheme(): "dark" | "light" {
  try {
    const saved = localStorage.getItem("ticketflow-theme") as "dark" | "light" | null;
    if (saved === "dark" || saved === "light") return saved;
  } catch { /* ignore */ }
  return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

type Role = "organizer" | "customer";
type PublicUser = { id: string; email: string; role: Role };
type Session = { token: string; user: PublicUser };
type AppNotification = {
  id: string;
  type: "booking_confirmed" | "booking_cancelled";
  message: string;
  readAt: string | null;
  createdAt: string;
};
type CustomerBooking = { id: string; eventId: string; eventName: string; startsAt: string; status: "held" | "pending_payment" | "confirmed" | "expired" | "cancelled"; totalCents: number; seats: Array<{ id: string; rowLabel: string; seatNumber: number }> };

// In development Vite proxies /api → API server (no CORS, same origin).
// In production set VITE_API_URL to the deployed API origin, e.g. https://api.ticketflow.app
const API_URL = import.meta.env.VITE_API_URL?.trim().replace(/\/+$/, "") || "/api";

async function authRequest(path: string, body: Record<string, string>) {
  const response = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as {
    user?: PublicUser;
    token?: string;
    error?: { message?: string };
  };
  if (!response.ok)
    throw new Error(payload.error?.message ?? "Something went wrong");
  return payload as Session;
}

type Venue = { id: string; name: string; city: string; address: string };
type OrganizerEvent = {
  id: string;
  name: string;
  description: string;
  posterUrl: string;
  highlights: string;
  category: string;
  startsAt: string;
  endsAt: string;
  status: "draft" | "published" | "cancelled";
  pricingStrategy: "base" | "early_bird";
  venue: Venue;
  categories: Array<{ name: string; basePriceCents: number }>;
  seats: Array<{
    id: string;
    rowLabel: string;
    categoryName: string;
    available: boolean;
  }>;
};
type BrowseSeat = {
  id: string;
  rowLabel: string;
  seatNumber: number;
  categoryName: string;
  basePriceCents: number;
  available: boolean;
  status: "available" | "held" | "booked";
};
type BrowseEvent = {
  id: string;
  name: string;
  description: string;
  posterUrl: string;
  highlights: string;
  category: string;
  status: "published";
  startsAt: string;
  endsAt: string;
  venue: Venue;
  categories: Array<{ name: string; basePriceCents: number }>;
  seats: BrowseSeat[];
};
type SeatRowPlan = { label: string; category: string };
const eventCategories = ["Concert", "Sports", "Stand-up", "Workshop", "Festival", "Conference", "Exhibition", "Competition", "Fundraiser", "Other"];

// ─── Category SVG icons ───────────────────────────────────────
const categoryIcons: Record<string, string> = {
  Concert: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`,
  Sports: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M4.93 4.93c4.68 4.68 9.37 4.68 14.14 0M4.93 19.07c4.68-4.68 9.37-4.68 14.14 0M2 12h20M12 2a15.3 15.3 0 0 1 4 10A15.3 15.3 0 0 1 12 22 15.3 15.3 0 0 1 8 12 15.3 15.3 0 0 1 12 2z"/></svg>`,
  "Stand-up": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"/><path d="M18.5 8.5A2.5 2.5 0 0 0 16 6h-8a2.5 2.5 0 0 0-2.5 2.5v5H8v9h8v-9h2.5V8.5z"/><path d="M8 11.5l-2 4.5M16 11.5l2 4.5"/></svg>`,
  Workshop: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>`,
  Festival: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
  Conference: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  Exhibition: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>`,
  Competition: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2z"/></svg>`,
  Fundraiser: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`,
  Other: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>`,
};
type DiscoveryStatus = "all" | "live" | "upcoming" | "ended";
type DiscoverySort = "soonest" | "latest" | "ending" | "name_asc" | "name_desc";
function eventPhase(event: BrowseEvent): "Live" | "Upcoming" | "Ended" {
  const now = Date.now();
  if (Date.parse(event.endsAt) <= now) return "Ended";
  return Date.parse(event.startsAt) <= now ? "Live" : "Upcoming";
}

// ─── Countdown hook ───────────────────────────────────────────────────────────
function useCountdown(targetDate: string) {
  const calc = useCallback(
    () => Math.max(0, Date.parse(targetDate) - Date.now()),
    [targetDate],
  );
  const [timeLeft, setTimeLeft] = useState(calc);
  useEffect(() => {
    if (!targetDate) return;
    const timer = setInterval(() => setTimeLeft(calc()), 1000);
    return () => clearInterval(timer);
  }, [targetDate, calc]);
  return {
    days: Math.floor(timeLeft / 86_400_000),
    hours: Math.floor((timeLeft % 86_400_000) / 3_600_000),
    mins: Math.floor((timeLeft % 3_600_000) / 60_000),
    secs: Math.floor((timeLeft % 60_000) / 1000),
    expired: timeLeft === 0,
  };
}

// ─── QR pattern generator (no external library) ──────────────────────────────
function generateQRPattern(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++)
    hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
  const h = (hash >>> 0) * 2654435761;
  const bits = Array.from({ length: 49 }, (_, i) => ((h >> (i % 32)) & 1 ? "█" : "░"));
  return Array.from({ length: 7 }, (_, r) => bits.slice(r * 7, r * 7 + 7).join("")).join("\n");
}

// ─── Card countdown badge ─────────────────────────────────────────────────────
function CountdownBadge({ startsAt }: { startsAt: string }) {
  const { days, hours, mins, expired } = useCountdown(startsAt);
  if (expired || Date.parse(startsAt) <= Date.now()) return null;
  return (
    <div className="card-countdown" aria-label="Starts in">
      {days > 0 && (
        <div className="card-countdown-block">
          <strong>{days}</strong>
          <span>d</span>
        </div>
      )}
      <div className="card-countdown-block">
        <strong>{String(hours).padStart(2, "0")}</strong>
        <span>h</span>
      </div>
      <div className="card-countdown-block">
        <strong>{String(mins).padStart(2, "0")}</strong>
        <span>m</span>
      </div>
    </div>
  );
}

function formatPrice(amount: number) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(
    amount,
  );
}

async function apiRequest<T>(
  path: string,
  token: string,
  options: RequestInit = {},
) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });
  const payload = (await response.json()) as T & {
    error?: { message?: string };
  };
  if (!response.ok)
    throw new Error(payload.error?.message ?? "Could not complete that action");
  return payload;
}

async function publicRequest<T>(path: string) {
  const response = await fetch(`${API_URL}${path}`);
  const payload = (await response.json()) as T & {
    error?: { message?: string };
  };
  if (!response.ok)
    throw new Error(payload.error?.message ?? "Could not load events");
  return payload;
}

function EventDetailsModal({
  event,
  onClose,
}: {
  event: BrowseEvent;
  onClose: () => void;
}) {
  const [posterFailed, setPosterFailed] = useState(false);
  const availableSeats = event.seats.filter((seat) => seat.available).length;

  return (
    <div
      className="modal-backdrop event-story-backdrop"
      role="presentation"
      onMouseDown={(mouseEvent) => {
        if (mouseEvent.target === mouseEvent.currentTarget) onClose();
      }}
    >
      <article
        className="event-story-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="event-story-title"
      >
        <button className="modal-close" aria-label="Close event details" onClick={onClose}>×</button>
        <div className={`event-story-poster ${event.posterUrl && !posterFailed ? "has-poster" : ""}`}>
          {event.posterUrl && !posterFailed ? (
            <img src={event.posterUrl} alt={`${event.name} poster`} onError={() => setPosterFailed(true)} />
          ) : (
            <div className="event-story-placeholder" aria-hidden="true">
              <span>LIVE / {new Date(event.startsAt).getFullYear()}</span>
              <strong>{event.name}</strong>
              <i>↗</i>
            </div>
          )}
          <time dateTime={event.startsAt}>
            <strong>{new Date(event.startsAt).toLocaleDateString(undefined, { day: "2-digit" })}</strong>
            <span>{new Date(event.startsAt).toLocaleDateString(undefined, { month: "short" }).toUpperCase()}</span>
          </time>
        </div>
        <div className="event-story-copy">
          <span className="section-kicker">{event.category.toUpperCase()} · {eventPhase(event).toUpperCase()}</span>
          <h2 id="event-story-title">{event.name}</h2>
          <p className="event-story-venue">{event.venue.name} · {event.venue.city}</p>
          <p className="event-story-time">
            {new Date(event.startsAt).toLocaleString(undefined, { dateStyle: "full", timeStyle: "short" })} – {new Date(event.endsAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
          </p>
          <section>
            <h3>About this event</h3>
            <p>{event.description || "The organizer has not added a full description yet."}</p>
          </section>
          <div className="event-story-facts">
            <span><strong>{availableSeats}</strong> seats available</span>
            <span><strong>{event.categories.length}</strong> ticket {event.categories.length === 1 ? "category" : "categories"}</span>
            <span><strong>{formatPrice(Math.min(...event.categories.map((category) => category.basePriceCents)))}</strong> starting price</span>
          </div>
        </div>
      </article>
    </div>
  );
}

function PublicEventCard({ event, onOpen, onBook, onCity }: { event: BrowseEvent; onOpen: () => void; onBook?: () => void; onCity: (city: string) => void }) {
  const phase = eventPhase(event);
  const price = Math.min(...event.categories.map((category) => category.basePriceCents));
  const startDate = new Date(event.startsAt);
  return (
    <article className="discovery-card">
      <button className="discovery-poster" type="button" onClick={onOpen} aria-label={`View ${event.name}`}>
        <span className="discovery-poster-fallback"><small>{event.category}</small><strong>{event.name}</strong></span>
        {event.posterUrl && <img src={event.posterUrl} alt="" loading="lazy" onError={(imageEvent) => { imageEvent.currentTarget.hidden = true; }} />}
        <time className="discovery-date" dateTime={event.startsAt}>
          <strong>{startDate.toLocaleDateString(undefined, { day: "numeric" })}</strong>
          <span className="discovery-date-copy">
            <small className="discovery-date-month">{startDate.toLocaleDateString(undefined, { month: "short" })}</small>
            <small className="discovery-date-weekday">{startDate.toLocaleDateString(undefined, { weekday: "short" })}</small>
          </span>
        </time>
        <span className={`discovery-phase ${phase.toLowerCase()}`}>{phase === "Live" && <i />} {phase}</span>
        {phase === "Upcoming" && <CountdownBadge startsAt={event.startsAt} />}
      </button>
      <div className="discovery-card-copy">
        <button className="discovery-card-title" type="button" onClick={onOpen}>{event.name}</button>
        <div className="discovery-card-details">
          <span>⌖ {event.venue.name} · <button type="button" onClick={() => onCity(event.venue.city)}>{event.venue.city}</button></span>
          <span>◷ {new Date(event.startsAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</span>
        </div>
        <div className="discovery-card-bottom">
          <span>{price === 0 ? <>Admission <strong>Free</strong></> : <>Starts from <strong>৳{formatPrice(price)}</strong></>}</span>
          <div className="discovery-card-actions">
            <button type="button" onClick={phase === "Ended" ? onOpen : onBook}>{phase === "Ended" ? "View event" : "Book now"} <span aria-hidden="true">→</span></button>
          </div>
        </div>
      </div>
    </article>
  );
}

function EventBookingPage({ event, onBack, onChooseSeats }: { event: BrowseEvent; onBack: () => void; onChooseSeats: () => void }) {
  const price = Math.min(...event.categories.map((category) => category.basePriceCents));
  const highlights = event.highlights.split(/\n+/).map((item) => item.trim()).filter(Boolean);
  const available = event.seats.filter((seat) => seat.available).length;
  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [event.id]);

  return <div className="event-booking-page">
    <div className="event-page-hero">
      <button type="button" className="event-page-back" onClick={onBack}>← All events</button>
      <div className="event-page-poster">{event.posterUrl ? <img src={event.posterUrl} alt={`${event.name} poster`} /> : <div className="event-page-poster-fallback"><span>{event.category}</span><strong>{event.name}</strong></div>}</div>
    </div>
    <div className="event-page-layout">
      <div className="event-page-content">
        <span className="section-kicker">{event.category.toUpperCase()} · {eventPhase(event).toUpperCase()}</span>
        <h1>{event.name}</h1>
        <div className="event-page-meta"><div><span>DATE & TIME</span><strong>{new Date(event.startsAt).toLocaleString(undefined, { dateStyle: "full", timeStyle: "short" })}</strong><small>Ends {new Date(event.endsAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</small></div><div><span>VENUE</span><strong>{event.venue.name}</strong><small>{event.venue.city} · {event.venue.address}</small></div></div>
        <section className="event-page-section"><span className="section-kicker">ABOUT THE EVENT</span><h2>What to expect</h2><p>{event.description || "The organizer has not added a full description yet."}</p></section>
        {highlights.length > 0 && <section className="event-page-section"><span className="section-kicker">HIGHLIGHTS</span><h2>What you’ll experience</h2><ul>{highlights.map((item) => <li key={item}>{item}</li>)}</ul></section>}
        <section className="event-page-section"><span className="section-kicker">TICKETS</span><h2>Choose your place</h2><div className="event-page-categories">{event.categories.map((category) => <div key={category.name}><strong>{category.name}</strong><span>৳{formatPrice(category.basePriceCents)} / seat</span></div>)}</div></section>
        <div className="event-page-venue"><span>⌖ EVENT VENUE</span><strong>{event.venue.name}</strong><p>{event.venue.address}, {event.venue.city}</p></div>
      </div>
      <aside className="event-page-sidebar"><div className="event-page-ticket-card"><span>Tickets from</span><strong>৳{formatPrice(price)}</strong><small>{event.categories.length} ticket types · {available} seats available</small><button type="button" onClick={onChooseSeats}>Choose seats <span aria-hidden="true">→</span></button><small>Seats are held for 5 minutes during checkout</small></div></aside>
    </div>
  </div>;
}

function BookingModal({
  event,
  session,
  onClose,
  onHeld,
  onSignIn,
  onBookAnother,
}: {
  event: BrowseEvent;
  session: Session | null;
  onClose: () => void;
  onHeld: () => void;
  onSignIn: () => void;
  onBookAnother: () => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [hold, setHold] = useState<{
    id: string;
    expiresAt: string;
    totalCents: number;
    status: "held" | "pending_payment" | "confirmed";
  } | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [paymentProvider, setPaymentProvider] = useState<"stripe" | "paypal">(
    "stripe",
  );
  const lowestPrice = Math.min(...event.categories.map((category) => category.basePriceCents));
  const availableSeats = event.seats.filter((seat) => seat.available).length;
  useEffect(() => {
    if (!hold) return undefined;
    const timer = window.setInterval(
      () =>
        setSecondsLeft(
          Math.max(
            0,
            Math.ceil((new Date(hold.expiresAt).getTime() - Date.now()) / 1000),
          ),
        ),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [hold]);
  const selectedSeats = event.seats.filter((seat) =>
    selected.includes(seat.id),
  );
  const seatRows = event.seats.reduce<Record<string, BrowseSeat[]>>(
    (rows, seat) => {
      (rows[seat.rowLabel] ??= []).push(seat);
      return rows;
    },
    {},
  );
  const categoryByName = new Map(
    event.categories.map((category) => [category.name.toLowerCase(), category]),
  );
  async function holdSeats() {
    if (!selected.length) return;
    if (!session) {
      onSignIn();
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await apiRequest<{
        booking: {
          id: string;
          expiresAt: string;
          totalCents: number;
          status: "held";
        };
      }>("/bookings/holds", session.token, {
        method: "POST",
        body: JSON.stringify({ eventId: event.id, seatIds: selected }),
      });
      setHold(result.booking);
      setSecondsLeft(300);
      onHeld();
    } catch (requestError) {
      setSelected([]);
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Those seats are no longer available",
      );
      onHeld();
    } finally {
      setBusy(false);
    }
  }
  async function cancelHold() {
    if (!session || !hold) return;
    setBusy(true);
    setError("");
    try {
      await apiRequest(`/bookings/${hold.id}/cancel`, session.token, {
        method: "POST",
      });
      setHold(null);
      setSelected([]);
      onHeld();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not release the hold",
      );
    } finally {
      setBusy(false);
    }
  }
  async function transitionToPayment() {
    if (!session || !hold) return;
    setBusy(true);
    setError("");
    try {
      const result = await apiRequest<{
        booking: { status: "pending_payment" };
      }>(`/bookings/${hold.id}/payment`, session.token, { method: "POST" });
      setHold((current) =>
        current ? { ...current, status: result.booking.status } : current,
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "That booking step is no longer available",
      );
    } finally {
      setBusy(false);
    }
  }
  async function payNow() {
    if (!session || !hold) return;
    setBusy(true);
    setError("");
    try {
      const result = await apiRequest<{ payment: { status: "succeeded" } }>(
        `/bookings/${hold.id}/pay`,
        session.token,
        {
          method: "POST",
          body: JSON.stringify({
            provider: paymentProvider,
            idempotencyKey: `booking-${hold.id}`,
          }),
        },
      );
      if (result.payment.status === "succeeded")
        setHold((current) =>
          current ? { ...current, status: "confirmed" } : current,
        );
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Payment could not be completed",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(mouseEvent) => {
        if (mouseEvent.target === mouseEvent.currentTarget) onClose();
      }}
    >
      <section
        className="booking-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="booking-title"
      >
        <button
          className="modal-close"
          aria-label="Close seat selection"
          onClick={onClose}
        >
          ×
        </button>
        <div className="booking-event-hero">
          {event.posterUrl && <img src={event.posterUrl} alt="" />}
          <div className="booking-event-hero-copy">
            <span className="section-kicker">{event.category.toUpperCase()} · TICKETS</span>
            <h2 id="booking-title">{event.name}</h2>
            <p className="booking-meta">{event.venue.name} · {event.venue.city} · {new Date(event.startsAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</p>
          </div>
          {!hold && <aside className="booking-ticket-summary">
            <span>Tickets from</span><strong>{formatPrice(lowestPrice)}</strong>
            <small>{availableSeats} seats available · {event.categories.length} ticket types</small>
            <button type="button" onClick={() => document.getElementById("booking-seat-selection")?.scrollIntoView({ behavior: "smooth", block: "start" })}>Choose seats <span aria-hidden="true">→</span></button>
            <small className="secure-checkout">Secure checkout</small>
          </aside>}
        </div>
        {hold ? (
          <div className="hold-confirmation">
            <span className="hold-icon">
              {hold.status === "confirmed" ? "✓" : "!"}
            </span>
            <div>
              {hold.status === "confirmed" ? (
                <>
                  <strong>Booking confirmed.</strong>
                  <p>Your seats are secured for this event.</p>
                  <button
                    className="primary-button compact-button"
                    onClick={onBookAnother}
                  >
                    Book another seat →
                  </button>
                </>
              ) : hold.status === "pending_payment" ? (
                <>
                  <strong>Payment pending.</strong>
                  <p>Choose a mock provider to complete this booking.</p>
                  <label className="provider-choice">
                    Payment provider
                    <select
                      value={paymentProvider}
                      onChange={(event) =>
                        setPaymentProvider(
                          event.target.value as "stripe" | "paypal",
                        )
                      }
                    >
                      <option value="stripe">Mock Stripe</option>
                      <option value="paypal">Mock PayPal</option>
                    </select>
                  </label>
                  <button
                    className="primary-button compact-button"
                    disabled={busy}
                    onClick={() => void payNow()}
                  >
                    {busy ? "Processing…" : "Pay now →"}
                  </button>
                </>
              ) : (
                <>
                  <strong>Your seats are held.</strong>
                  <p>
                    Complete payment within{" "}
                    <b>
                      {Math.floor(secondsLeft / 60)}:
                      {String(secondsLeft % 60).padStart(2, "0")}
                    </b>
                    .
                  </p>
                  <button
                    className="primary-button compact-button"
                    disabled={busy}
                    onClick={() => void transitionToPayment()}
                  >
                    Continue to payment →
                  </button>
                </>
              )}
              <button
                className="release-button"
                disabled={busy || hold.status === "confirmed"}
                onClick={() => void cancelHold()}
              >
                Cancel booking
              </button>
            </div>
          </div>
        ) : (
          <>
            <div id="booking-seat-selection" className="booking-stage">THE STAGE · SELECT YOUR SEATS</div>
            <div className="category-legend" aria-label="Seat category prices">
              <div className="category-legend-heading">
                <span className="form-label">SEAT CATEGORIES</span>
                <span>Price per seat</span>
              </div>
              <div className="category-legend-list">
                {event.categories.map((category) => (
                  <div className="category-legend-item" key={category.name}>
                    <span className="category-dot" />{" "}
                    <strong>{category.name}</strong>
                    <span>{formatPrice(category.basePriceCents)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="seat-status-legend" aria-label="Seat availability">
              <span>
                <i className="seat-status-dot available" />
                Available
              </span>
              <span>
                <i className="seat-status-dot selected" />
                Your selection
              </span>
              <span>
                <i className="seat-status-dot held" aria-hidden="true">H</i>
                Held temporarily
              </span>
              <span>
                <i className="seat-status-dot booked" aria-hidden="true">×</i>
                Booked
              </span>
            </div>
            <p className="seat-scroll-hint">Swipe sideways to see every seat <span aria-hidden="true">→</span></p>
            <div className="seat-picker" aria-label="Seat selection">
              {Object.entries(seatRows).map(([row, seats]) => {
                const category = categoryByName.get(
                  seats[0]?.categoryName.toLowerCase(),
                );
                return (
                  <div className="seat-row" key={row}>
                    <div className="seat-row-label">
                      <strong>{row}</strong>
                      <span>{category?.name ?? seats[0]?.categoryName}</span>
                      <small>
                        {category
                          ? formatPrice(category.basePriceCents)
                          : formatPrice(seats[0]?.basePriceCents ?? 0)}{" "}
                        / seat
                      </small>
                    </div>
                    <div>
                      {seats.map((seat) => (
                        <button
                          type="button"
                          aria-label={`Row ${row} ${seat.categoryName} seat ${seat.seatNumber}, ${formatPrice(seat.basePriceCents)} per seat, ${seat.status === "held" ? "held temporarily" : seat.status}`}
                          title={seat.status === "available" ? "Available" : seat.status === "held" ? "Held temporarily" : "Booked"}
                          className={`picker-seat ${seat.status} ${seat.status === "available" ? "" : "unavailable"} ${selected.includes(seat.id) ? "chosen" : ""}`}
                          disabled={seat.status !== "available"}
                          key={seat.id}
                          onClick={() =>
                            setSelected((current) =>
                              current.includes(seat.id)
                                ? current.filter((id) => id !== seat.id)
                                : [...current, seat.id],
                            )
                          }
                        >
                          <span>{seat.seatNumber}</span>
                          {seat.status !== "available" && (
                            <small aria-hidden="true">{seat.status === "booked" ? "×" : "H"}</small>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="booking-footer">
              <div>
                <span>
                  {selectedSeats.length} seat
                  {selectedSeats.length === 1 ? "" : "s"} selected
                </span>
                {selectedSeats.length > 0 && (
                  <strong>
                    {formatPrice(
                      selectedSeats.reduce(
                        (total, seat) => total + seat.basePriceCents,
                        0,
                      ),
                    )}{" "}
                    total
                  </strong>
                )}
              </div>
              <div className="booking-action">
                <button
                  className="primary-button"
                  disabled={busy || !selected.length}
                  onClick={() => void holdSeats()}
                >
                  {busy
                    ? "Holding…"
                    : session
                      ? "Hold seats →"
                      : "Sign in to hold seats →"}
                </button>
                {!session && (
                  <small className="booking-login-hint">
                    Sign in with a customer account to book these seats.
                  </small>
                )}
              </div>
            </div>
            {error && (
              <p className="auth-error" role="alert">
                {error}
              </p>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function OrganizerDashboard({ session }: { session: Session }) {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [events, setEvents] = useState<OrganizerEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [venueForm, setVenueForm] = useState({
    name: "",
    city: "",
    address: "",
  });
  const [eventForm, setEventForm] = useState({
    name: "",
    venueId: "",
    category: "Other",
    startsAt: "",
    endsAt: "",
    description: "",
    posterUrl: "",
    highlights: "",
    strategy: "base",
    status: "draft",
  });
  const [categories, setCategories] = useState([
    { name: "General", price: "2500" },
  ]);
  const [rowPlan, setRowPlan] = useState<SeatRowPlan[]>([
    { label: "A", category: "General" },
    { label: "B", category: "General" },
    { label: "C", category: "General" },
  ]);
  const [seatsPerRow, setSeatsPerRow] = useState("12");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activePanel, setActivePanel] = useState<"create" | "venues" | "drafts" | "running" | "delivered">("create");
  const [editingVenueId, setEditingVenueId] = useState<string | null>(null);

  async function loadDashboard() {
    try {
      setLoading(true);
      const [venuePayload, eventPayload] = await Promise.all([
        apiRequest<{ venues: Venue[] }>("/venues", session.token),
        apiRequest<{ events: OrganizerEvent[] }>(
          "/events/organizer",
          session.token,
        ),
      ]);
      setVenues(venuePayload.venues);
      setEvents(eventPayload.events);
      setEventForm((current) => ({
        ...current,
        venueId: current.venueId || venuePayload.venues[0]?.id || "",
      }));
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not load your studio",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDashboard();
  }, [session.token]);

  async function createVenue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await apiRequest<{ venue: Venue }>(editingVenueId ? `/venues/${editingVenueId}` : "/venues", session.token, {
        method: editingVenueId ? "PATCH" : "POST",
        body: JSON.stringify(venueForm),
      });
      setVenueForm({ name: "", city: "", address: "" });
      setEditingVenueId(null);
      setMessage("Venue saved.");
      await loadDashboard();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not save venue",
      );
    } finally {
      setBusy(false);
    }
  }

  function editVenue(venue: Venue) { setEditingVenueId(venue.id); setVenueForm({ name: venue.name, city: venue.city, address: venue.address }); setActivePanel("venues"); }
  async function deleteVenue(venue: Venue) { if (!window.confirm(`Delete ${venue.name}?`)) return; setBusy(true); setError(""); try { await apiRequest(`/venues/${venue.id}`, session.token, { method: "DELETE" }); setMessage("Venue deleted."); await loadDashboard(); } catch (requestError) { setError(requestError instanceof Error ? requestError.message : "Could not delete venue"); } finally { setBusy(false); } }

  async function createEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    const rows = rowPlan
      .filter((row) => row.label.trim())
      .map((row) => ({ label: row.label.trim(), category: row.category }));
    try {
      const payload = {
        venueId: eventForm.venueId,
        name: eventForm.name,
        description: eventForm.description,
        posterUrl: eventForm.posterUrl,
        highlights: eventForm.highlights,
        category: eventForm.category,
        startsAt: new Date(eventForm.startsAt).toISOString(),
        ...(eventForm.endsAt ? { endsAt: new Date(eventForm.endsAt).toISOString() } : {}),
        pricingStrategy: eventForm.strategy,
        status: eventForm.status,
        seatMap: { rows, seatsPerRow: Number(seatsPerRow) },
        categories: categories.map((category) => ({
          name: category.name.trim(),
          basePriceCents: Number(category.price),
        })),
      };
      await apiRequest<{ event: OrganizerEvent }>(
        editingId ? `/events/organizer/${editingId}` : "/events/organizer",
        session.token,
        { method: editingId ? "PATCH" : "POST", body: JSON.stringify(payload) },
      );
      setMessage(editingId ? "Event updated." : "Event saved.");
      setEditingId(null);
      setEventForm((current) => ({
        ...current,
        name: "",
        description: "",
        posterUrl: "",
        highlights: "",
        category: "Other",
        startsAt: "",
        endsAt: "",
        status: "draft",
      }));
      await loadDashboard();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not save event",
      );
    } finally {
      setBusy(false);
    }
  }

  function editEvent(event: OrganizerEvent) {
    const date = new Date(event.startsAt);
    const localDate = new Date(
      date.getTime() - date.getTimezoneOffset() * 60000,
    )
      .toISOString()
      .slice(0, 16);
    const labels = [...new Set(event.seats.map((seat) => seat.rowLabel))];
    const firstCategory = event.categories[0]?.name ?? "General";
    setEditingId(event.id);
    setEventForm({
      name: event.name,
      venueId: event.venue.id,
      category: event.category,
      startsAt: localDate,
      endsAt: new Date(Date.parse(event.endsAt) - new Date(event.endsAt).getTimezoneOffset() * 60000).toISOString().slice(0, 16),
      description: event.description,
      posterUrl: event.posterUrl,
      highlights: event.highlights,
      strategy: event.pricingStrategy,
      status: event.status === "published" ? "published" : "draft",
    });
    setCategories(
      event.categories.map((category) => ({
        name: category.name,
        price: String(category.basePriceCents),
      })),
    );
    setRowPlan(
      labels.length
        ? labels.map((label) => ({
            label,
            category:
              event.seats.find((seat) => seat.rowLabel === label)
                ?.categoryName ?? firstCategory,
          }))
        : [{ label: "A", category: firstCategory }],
    );
    setSeatsPerRow(
      String(
        labels.length
          ? Math.max(1, Math.round(event.seats.length / labels.length))
          : 12,
      ),
    );
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function publishEvent(eventId: string) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await apiRequest<{ event: OrganizerEvent }>(
        `/events/organizer/${eventId}/status`,
        session.token,
        { method: "PATCH", body: JSON.stringify({ status: "published" }) },
      );
      setMessage("Event published. Customers can see it now.");
      await loadDashboard();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not publish event",
      );
    } finally {
      setBusy(false);
    }
  }

  function updateCategoryName(index: number, name: string) {
    const previousName = categories[index]?.name ?? "";
    setCategories(
      categories.map((category, categoryIndex) =>
        categoryIndex === index ? { ...category, name } : category,
      ),
    );
    if (previousName)
      setRowPlan((rows) =>
        rows.map((row) =>
          row.category === previousName ? { ...row, category: name } : row,
        ),
      );
  }

  function addSeatRow() {
    const nextLabel =
      rowPlan.length < 26
        ? String.fromCharCode(65 + rowPlan.length)
        : `R${rowPlan.length + 1}`;
    setRowPlan([
      ...rowPlan,
      { label: nextLabel, category: categories[0]?.name ?? "" },
    ]);
  }

  return (
    <div className="studio-shell" id="studio">
      <div className="studio-intro">
        <div>
          <span className="section-kicker">ORGANIZER STUDIO</span>
          <h1>
            Put something
            <br />
            <em>on the calendar.</em>
          </h1>
          <p>
            Shape the room, set the price, and give people a reason to show up.
          </p>
        </div>
        <div className="studio-mark">
          <span>THE</span>
          <strong>
            BACK
            <br />
            STAGE
          </strong>
          <i>↗</i>
        </div>
      </div>
      <nav className="studio-nav" aria-label="Organizer workspace">
        <button className={activePanel === "create" ? "active" : ""} onClick={() => setActivePanel("create")}>Create event</button>
        <button className={activePanel === "venues" ? "active" : ""} onClick={() => setActivePanel("venues")}>Venues <span>{venues.length}</span></button>
        <button className={activePanel === "drafts" ? "active" : ""} onClick={() => setActivePanel("drafts")}>Drafts <span>{events.filter((event) => event.status === "draft").length}</span></button>
        <button className={activePanel === "running" ? "active" : ""} onClick={() => setActivePanel("running")}>Running events <span>{events.filter((event) => event.status === "published" && new Date(event.endsAt) > new Date()).length}</span></button>
        <button className={activePanel === "delivered" ? "active" : ""} onClick={() => setActivePanel("delivered")}>Delivered events <span>{events.filter((event) => event.status === "published" && new Date(event.endsAt) <= new Date()).length}</span></button>
      </nav>
      {activePanel !== "create" && <section className="workspace-panel">
        <div className="workspace-panel-heading"><div><span className="section-kicker">{activePanel === "venues" ? "YOUR PLACES" : activePanel === "drafts" ? "PRIVATE WORKSPACE" : activePanel === "running" ? "LIVE PROGRAMME" : "DELIVERED PROGRAMME"}</span><h2>{activePanel === "venues" ? "Venues" : activePanel === "drafts" ? "Draft events" : activePanel === "running" ? "Running events" : "Delivered events"}</h2>{activePanel === "drafts" && <p>Only you can see these events. Publish one when it is ready for customers.</p>}</div><span className="studio-rule" /></div>
        {activePanel === "venues" ? <div className="venue-management"><div className="venue-management-list">{venues.map((venue) => <article className="managed-venue" key={venue.id}><div><strong>{venue.name}</strong><span>{venue.city} · {venue.address}</span></div><div><button className="edit-button" onClick={() => editVenue(venue)}>Edit</button><button className="danger-button" disabled={busy} onClick={() => void deleteVenue(venue)}>Delete</button></div></article>)}</div><form className="venue-form venue-management-form" onSubmit={createVenue}><span className="form-label">{editingVenueId ? "EDIT VENUE" : "ADD A VENUE"}</span><input required placeholder="Venue name" value={venueForm.name} onChange={(event) => setVenueForm({ ...venueForm, name: event.target.value })} /><input required placeholder="City" value={venueForm.city} onChange={(event) => setVenueForm({ ...venueForm, city: event.target.value })} /><input required placeholder="Address" value={venueForm.address} onChange={(event) => setVenueForm({ ...venueForm, address: event.target.value })} /><button className="outline-button" disabled={busy}>{editingVenueId ? "Save changes" : "Add venue"} <span>+</span></button></form></div> : <div className="managed-event-list">{events.filter((event) => activePanel === "drafts" ? event.status === "draft" : activePanel === "running" ? event.status === "published" && new Date(event.endsAt) > new Date() : event.status === "published" && new Date(event.endsAt) <= new Date()).map((event) => <article className="managed-event" key={event.id}><div className="event-date"><strong>{new Date(event.startsAt).toLocaleDateString(undefined, { day: "2-digit" })}</strong><span>{new Date(event.startsAt).toLocaleDateString(undefined, { month: "short" }).toUpperCase()}</span></div><div className="managed-event-details"><span className={`event-status ${activePanel === "delivered" ? "past" : event.status}`}>{activePanel === "delivered" ? "delivered" : event.status}</span><h3>{event.name}</h3><p>{event.venue.name} · {event.venue.city}</p></div><div className="managed-event-stats"><strong>{event.seats.filter((seat) => seat.available).length}</strong><span>AVAILABLE / {event.seats.length}</span><button className="edit-button" onClick={() => { editEvent(event); setActivePanel("create"); }}>Manage event</button>{activePanel === "drafts" && <button className="publish-button" disabled={busy} onClick={() => void publishEvent(event.id)}>Publish</button>}</div></article>)}</div>}
      </section>}
      <div className={`studio-grid ${activePanel !== "create" ? "studio-grid-hidden" : ""}`}>
        <section className="studio-content">
          <div className="studio-section-heading">
            <div>
              <span className="section-kicker">
                {editingId ? "EDIT YOUR EVENT" : "MAKE IT REAL"}
              </span>
              <h2>{editingId ? "Shape it again." : "New event"}</h2>
            </div>
            {editingId && (
              <button
                type="button"
                className="outline-button"
                onClick={() => setEditingId(null)}
              >
                Cancel edit
              </button>
            )}
            <span className="studio-rule" />
          </div>
          {venues.length === 0 && (
            <div className="studio-notice">
              Add a venue first. Every event needs a room.
            </div>
          )}
          <form className="event-form" onSubmit={createEvent}>
            <div className="form-field form-field-wide">
              <label htmlFor="event-name">Event name</label>
              <input
                id="event-name"
                required
                disabled={!venues.length}
                placeholder="The name people will remember"
                value={eventForm.name}
                onChange={(event) =>
                  setEventForm({ ...eventForm, name: event.target.value })
                }
              />
            </div>
            <div className="form-row">
              <div className="form-field">
                <label htmlFor="event-venue">Venue</label>
                <select
                  id="event-venue"
                  required
                  disabled={!venues.length}
                  value={eventForm.venueId}
                  onChange={(event) =>
                    setEventForm({ ...eventForm, venueId: event.target.value })
                  }
                >
                  {venues.map((venue) => (
                    <option key={venue.id} value={venue.id}>
                      {venue.name} · {venue.city}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label htmlFor="event-start">Date & time</label>
                <input
                  id="event-start"
                  required
                  disabled={!venues.length}
                  type="datetime-local"
                  value={eventForm.startsAt}
                  onChange={(event) =>
                    setEventForm({ ...eventForm, startsAt: event.target.value })
                  }
                />
              </div>
            </div>
            <div className="form-row">
              <div className="form-field">
                <label htmlFor="event-category">Event category</label>
                <select id="event-category" disabled={!venues.length} value={eventForm.category} onChange={(event) => setEventForm({ ...eventForm, category: event.target.value })}>
                  {eventCategories.map((category) => <option key={category} value={category}>{category}</option>)}
                </select>
              </div>
              <div className="form-field">
                <label htmlFor="event-end">End date & time <span>optional</span></label>
                <input id="event-end" type="datetime-local" disabled={!venues.length} min={eventForm.startsAt || undefined} value={eventForm.endsAt} onChange={(event) => setEventForm({ ...eventForm, endsAt: event.target.value })} />
                <small className="field-hint">If blank, the event lasts three hours.</small>
              </div>
            </div>
            <div className="form-field form-field-wide">
              <label htmlFor="event-description">
                Event description <span>optional</span>
              </label>
              <textarea
                id="event-description"
                disabled={!venues.length}
                placeholder="Tell guests what the event is about, who it is for, and why they should attend."
                value={eventForm.description}
                onChange={(event) =>
                  setEventForm({
                    ...eventForm,
                    description: event.target.value,
                  })
                }
              />
            </div>
            <div className="form-row event-media-fields">
              <div className="form-field">
                <label htmlFor="event-poster">
                  Event poster <span>optional</span>
                </label>
                <input
                  id="event-poster-file"
                  className="poster-file-input"
                  type="file"
                  aria-label="Upload event poster"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={!venues.length}
                  onChange={(changeEvent) => {
                    const file = changeEvent.target.files?.[0];
                    if (!file) return;
                    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 2_000_000) {
                      setError("Use a JPG, PNG, or WebP poster under 2 MB.");
                      changeEvent.target.value = "";
                      return;
                    }
                    const reader = new FileReader();
                    reader.onload = () => { setEventForm((current) => ({ ...current, posterUrl: String(reader.result) })); setError(""); };
                    reader.onerror = () => setError("Could not read that poster image.");
                    reader.readAsDataURL(file);
                  }}
                />
                <small className="field-hint">Upload a JPG, PNG, or WebP under 2 MB, or paste a public image URL.</small>
                <input
                  id="event-poster"
                  type="url"
                  disabled={!venues.length}
                  placeholder="https://example.com/event-poster.jpg"
                  value={eventForm.posterUrl.startsWith("data:") ? "" : eventForm.posterUrl}
                  onChange={(event) =>
                    setEventForm({ ...eventForm, posterUrl: event.target.value })
                  }
                />
              </div>
              <div className="form-field">
                <label htmlFor="event-highlights">
                  Learning and highlights <span>optional</span>
                </label>
                <textarea
                  id="event-highlights"
                  disabled={!venues.length}
                  placeholder={"Meet startup founders\nLearn practical fundraising lessons\nBuild new connections"}
                  value={eventForm.highlights}
                  onChange={(event) =>
                    setEventForm({ ...eventForm, highlights: event.target.value })
                  }
                />
                <small className="field-hint">Add one attendee takeaway per line.</small>
              </div>
            </div>
            {eventForm.posterUrl && (
              <div className="poster-preview">
                <span className="form-label">POSTER PREVIEW</span>
                <img src={eventForm.posterUrl} alt="Event poster preview" />
                <button type="button" className="edit-button" onClick={() => setEventForm({ ...eventForm, posterUrl: "" })}>Remove poster</button>
              </div>
            )}
            <div className="category-builder legacy-category-builder">
              <div className="builder-heading">
                <div>
                  <span className="form-label">SEAT CATEGORIES</span>
                  <p>
                    Add the ticket levels and price for each seat. Rows can use
                    these categories above.
                  </p>
                </div>
                <button
                  type="button"
                  className="add-category"
                  disabled={!venues.length}
                  onClick={() =>
                    setCategories([...categories, { name: "", price: "" }])
                  }
                >
                  + Add category
                </button>
              </div>
              {categories.map((category, index) => (
                <div className="category-row" key={index}>
                  <span className="category-index">0{index + 1}</span>
                  <div className="category-input">
                    <label htmlFor={`category-name-${index}`}>
                      Category name
                    </label>
                    <input
                      id={`category-name-${index}`}
                      aria-label={`Category ${index + 1} name`}
                      required
                      disabled={!venues.length}
                      placeholder="e.g. VVIP"
                      value={category.name}
                      onChange={(event) =>
                        updateCategoryName(index, event.target.value)
                      }
                    />
                  </div>
                  <div className="category-input">
                    <label htmlFor={`category-price-${index}`}>
                      Price / seat
                    </label>
                    <input
                      id={`category-price-${index}`}
                      aria-label={`Category ${index + 1} price`}
                      required
                      disabled={!venues.length}
                      min="0"
                      type="number"
                      placeholder="5000"
                      value={category.price}
                      onChange={(event) =>
                        setCategories(
                          categories.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, price: event.target.value }
                              : item,
                          ),
                        )
                      }
                    />
                  </div>
                  <button
                    type="button"
                    className="remove-category"
                    aria-label={`Remove category ${index + 1}`}
                    disabled={categories.length === 1}
                    onClick={() =>
                      setCategories(
                        categories.filter(
                          (_, itemIndex) => itemIndex !== index,
                        ),
                      )
                    }
                  >
                    ×
                  </button>
                </div>
              ))}
              <div className="category-preview">
                <span className="form-label">CUSTOMER PRICE BOARD</span>
                <div>
                  {categories
                    .filter((category) => category.name.trim())
                    .map((category) => (
                      <span className="category-chip" key={category.name}>
                        <strong>{category.name}</strong>
                        <small>
                          {category.price
                            ? formatPrice(Number(category.price))
                            : "—"}{" "}
                          / seat
                        </small>
                      </span>
                    ))}
                </div>
              </div>
            </div>
            <div className="category-builder setup-step">
              <div className="setup-step-heading">
                <span className="setup-step-number">01</span>
                <div>
                  <span className="form-label">DEFINE CATEGORIES</span>
                  <p>
                    Name your ticket levels and set the price customers will
                    see.
                  </p>
                </div>
              </div>
              <div className="builder-heading">
                <span className="setup-step-caption">YOUR PRICE LEVELS</span>
                <button
                  type="button"
                  className="add-category"
                  disabled={!venues.length}
                  onClick={() =>
                    setCategories([...categories, { name: "", price: "" }])
                  }
                >
                  + Add category
                </button>
              </div>
              {categories.map((category, index) => (
                <div className="category-row" key={index}>
                  <span className="category-index">0{index + 1}</span>
                  <div className="category-input">
                    <label htmlFor={`category-name-${index}`}>
                      Category name
                    </label>
                    <input
                      id={`category-name-${index}`}
                      aria-label={`Category ${index + 1} name`}
                      required
                      disabled={!venues.length}
                      placeholder="e.g. VVIP"
                      value={category.name}
                      onChange={(event) =>
                        updateCategoryName(index, event.target.value)
                      }
                    />
                  </div>
                  <div className="category-input">
                    <label htmlFor={`category-price-${index}`}>
                      Price / seat
                    </label>
                    <input
                      id={`category-price-${index}`}
                      aria-label={`Category ${index + 1} price`}
                      required
                      disabled={!venues.length}
                      min="0"
                      type="number"
                      placeholder="5000"
                      value={category.price}
                      onChange={(event) =>
                        setCategories(
                          categories.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, price: event.target.value }
                              : item,
                          ),
                        )
                      }
                    />
                  </div>
                  <button
                    type="button"
                    className="remove-category"
                    aria-label={`Remove category ${index + 1}`}
                    disabled={categories.length === 1}
                    onClick={() =>
                      setCategories(
                        categories.filter(
                          (_, itemIndex) => itemIndex !== index,
                        ),
                      )
                    }
                  >
                    ×
                  </button>
                </div>
              ))}
              <div className="category-preview">
                <span className="form-label">CUSTOMER PRICE BOARD</span>
                <div>
                  {categories
                    .filter((category) => category.name.trim())
                    .map((category) => (
                      <span className="category-chip" key={category.name}>
                        <strong>{category.name}</strong>
                        <small>
                          {category.price
                            ? formatPrice(Number(category.price))
                            : "—"}{" "}
                          / seat
                        </small>
                      </span>
                    ))}
                </div>
              </div>
            </div>
            <div className="map-builder setup-step">
              <div className="setup-step-heading">
                <span className="setup-step-number">02</span>
                <div>
                  <span className="form-label">MAP YOUR ROWS</span>
                  <p>
                    Add rows and assign each one to a category. Customers will
                    see this structure when choosing seats.
                  </p>
                </div>
                <div className="seat-total">
                  <strong>
                    {(
                      rowPlan.filter((row) => row.label.trim()).length *
                      Number(seatsPerRow || 0)
                    )
                      .toString()
                      .padStart(2, "0")}
                  </strong>
                  <span>SEATS</span>
                </div>
              </div>
              <div className="row-builder-heading">
                <span className="setup-step-caption">ROWS & CATEGORIES</span>
                <button
                  type="button"
                  className="add-category"
                  disabled={!venues.length}
                  onClick={addSeatRow}
                >
                  + Add row
                </button>
              </div>
              <div className="row-plan-list">
                {rowPlan.map((row, index) => (
                  <div className="row-plan-row" key={index}>
                    <span className="category-index">0{index + 1}</span>
                    <div className="category-input">
                      <label htmlFor={`row-label-${index}`}>Row label</label>
                      <input
                        id={`row-label-${index}`}
                        required
                        disabled={!venues.length}
                        maxLength={10}
                        placeholder="A"
                        value={row.label}
                        onChange={(event) =>
                          setRowPlan(
                            rowPlan.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, label: event.target.value }
                                : item,
                            ),
                          )
                        }
                      />
                    </div>
                    <div className="category-input">
                      <label htmlFor={`row-category-${index}`}>Category</label>
                      <select
                        id={`row-category-${index}`}
                        required
                        disabled={!venues.length || !categories.length}
                        value={row.category}
                        onChange={(event) =>
                          setRowPlan(
                            rowPlan.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, category: event.target.value }
                                : item,
                            ),
                          )
                        }
                      >
                        {categories.map((category, categoryIndex) => (
                          <option key={categoryIndex} value={category.name}>
                            {category.name || "Unnamed category"}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      type="button"
                      className="remove-category"
                      aria-label={`Remove row ${row.label || index + 1}`}
                      disabled={rowPlan.length === 1}
                      onClick={() =>
                        setRowPlan(
                          rowPlan.filter((_, itemIndex) => itemIndex !== index),
                        )
                      }
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
              <div className="form-row row-seat-count">
                <div className="form-field form-field-small">
                  <label htmlFor="seats-row">Seats / row</label>
                  <input
                    id="seats-row"
                    required
                    min="1"
                    max="100"
                    type="number"
                    disabled={!venues.length}
                    value={seatsPerRow}
                    onChange={(event) => setSeatsPerRow(event.target.value)}
                  />
                </div>
                <small className="field-hint">
                  Each row creates {seatsPerRow || 0} seats. Add as many rows as
                  your venue needs.
                </small>
              </div>
            </div>
            <div className="event-actions">
              <label className="strategy-select">
                Pricing{" "}
                <select
                  aria-label="Pricing strategy"
                  disabled={!venues.length}
                  value={eventForm.strategy}
                  onChange={(event) =>
                    setEventForm({ ...eventForm, strategy: event.target.value })
                  }
                >
                  <option value="base">Base price</option>
                  <option value="early_bird">Early bird · 10% off</option>
                </select>
              </label>
              <div className="status-choice" aria-label="Event status">
                <button
                  type="button"
                  className={
                    eventForm.status === "draft"
                      ? "active draft-choice"
                      : "draft-choice"
                  }
                  disabled={!venues.length}
                  onClick={() =>
                    setEventForm({ ...eventForm, status: "draft" })
                  }
                >
                  Save as draft
                </button>
                <button
                  type="button"
                  className={
                    eventForm.status === "published"
                      ? "active publish-choice"
                      : "publish-choice"
                  }
                  disabled={!venues.length}
                  onClick={() =>
                    setEventForm({ ...eventForm, status: "published" })
                  }
                >
                  Publish now
                </button>
              </div>
              <button
                className="primary-button"
                disabled={busy || !venues.length}
              >
                {busy
                  ? "Saving…"
                  : eventForm.status === "published"
                    ? "Publish event →"
                    : "Save draft →"}
              </button>
            </div>
            {message && (
              <p className="studio-success" role="status">
                {message}
              </p>
            )}
            {error && (
              <p className="auth-error" role="alert">
                {error}
              </p>
            )}
          </form>
          <div className="studio-section-heading event-list-heading">
            <div>
              <span className="section-kicker">YOUR PROGRAMME</span>
              <h2>Created events</h2>
            </div>
            <span className="studio-rule" />
          </div>
          {loading ? (
            <p className="sidebar-empty">Loading your programme…</p>
          ) : events.length === 0 ? (
            <div className="event-empty">
              <span>✳</span>
              <div>
                <strong>Your calendar is open.</strong>
                <p>Build your first event above and it will appear here.</p>
              </div>
            </div>
          ) : (
            <div className="event-list">
              {events.map((event) => (
                <article className="event-card" key={event.id}>
                  <div className="event-date">
                    <strong>
                      {new Date(event.startsAt).toLocaleDateString(undefined, {
                        day: "2-digit",
                      })}
                    </strong>
                    <span>
                      {new Date(event.startsAt)
                        .toLocaleDateString(undefined, { month: "short" })
                        .toUpperCase()}
                    </span>
                  </div>
                  <div className="event-details">
                    <span className={`event-status ${event.status}`}>
                      {event.status}
                    </span>
                    <h3>{event.name}</h3>
                    <p>
                      {event.venue.name} · {event.venue.city}
                    </p>
                  </div>
                  <div className="event-count">
                    <strong>{event.seats.length}</strong>
                    <span>SEATS</span>
                    <button
                      className="edit-button"
                      disabled={busy}
                      onClick={() => editEvent(event)}
                    >
                      Edit
                    </button>
                    {event.status === "draft" && (
                      <button
                        className="publish-button"
                        disabled={busy}
                        onClick={() => void publishEvent(event.id)}
                      >
                        Publish
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export function App() {
  const [isDark, setIsDark] = useState<"dark" | "light">(getInitialTheme);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", isDark);
    localStorage.setItem("ticketflow-theme", isDark);
  }, [isDark]);

  const toggleTheme = () => setIsDark((t) => (t === "dark" ? "light" : "dark"));

  const [query, setQuery] = useState("");
  const [publicEvents, setPublicEvents] = useState<BrowseEvent[]>([]);
  const [homeEvents, setHomeEvents] = useState<BrowseEvent[]>([]);
  const [pastEvents, setPastEvents] = useState<BrowseEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const eventRequestVersion = useRef(0);
  const [eventTotal, setEventTotal] = useState(0);
  const [eventsOpen, setEventsOpen] = useState(
    () => window.location.hash === "#events",
  );
  const [guideOpen, setGuideOpen] = useState(
    () => window.location.hash === "#how-it-works",
  );
  const [searchFocused, setSearchFocused] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<BrowseEvent | null>(null);
  const [eventPage, setEventPage] = useState<BrowseEvent | null>(null);
  const [bookingEvent, setBookingEvent] = useState<BrowseEvent | null>(null);

  const [cityFilter, setCityFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<DiscoveryStatus>("all");
  const [categoryFilter, setCategoryFilter] = useState("All categories");
  const [sortOrder, setSortOrder] = useState<DiscoverySort>("soonest");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [session, setSession] = useState<Session | null>(() => {
    const saved = localStorage.getItem("ticketflow-session");
    return saved ? (JSON.parse(saved) as Session) : null;
  });
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileTab, setProfileTab] = useState<"menu" | "profile" | "tickets" | "orders" | "cart">("menu");
  const [customerBookings, setCustomerBookings] = useState<CustomerBooking[]>([]);
  const [recentlyViewed, setRecentlyViewed] = useState<BrowseEvent[]>(() => {
    try {
      const saved = localStorage.getItem("ticketflow-recent");
      return saved ? (JSON.parse(saved) as BrowseEvent[]) : [];
    } catch {
      return [];
    }
  });
  const [profileMessage, setProfileMessage] = useState("");
  const [profileBusy, setProfileBusy] = useState(false);
  const [toast, setToast] = useState<{ message: string; type?: "error" } | null>(null);

  useEffect(() => {
    if (session)
      localStorage.setItem("ticketflow-session", JSON.stringify(session));
    else localStorage.removeItem("ticketflow-session");
  }, [session]);

  useEffect(() => {
    if (session?.user.role !== "customer") {
      setNotifications([]);
      return;
    }
    void apiRequest<{ notifications: AppNotification[] }>(
      "/notifications",
      session.token,
    )
      .then((payload) => setNotifications(payload.notifications))
      .catch(() => setNotifications([]));
  }, [session]);

  useEffect(() => {
    if (selectedEvent) {
      setRecentlyViewed((prev) => {
        const filtered = prev.filter((e) => e.id !== selectedEvent.id);
        const updated = [selectedEvent, ...filtered].slice(0, 5);
        localStorage.setItem("ticketflow-recent", JSON.stringify(updated));
        return updated;
      });
    }
  }, [selectedEvent]);

  function showToast(message: string, type?: "error") {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  }
  useEffect(() => {
    if (!profileOpen || !session || session.user.role !== "customer" || (profileTab !== "tickets" && profileTab !== "orders")) return;
    void apiRequest<{ bookings: CustomerBooking[] }>("/bookings", session.token).then((payload) => setCustomerBookings(payload.bookings)).catch(() => setCustomerBookings([]));
  }, [profileOpen, profileTab, session]);

  useEffect(() => {
    let navigationVersion = 0;
    const handleHistoryChange = () => {
      const version = ++navigationVersion;
      setBookingEvent(null);
      const bookingId = window.location.hash.match(/^#book\/([0-9a-f-]{36})$/i)?.[1];
      if (bookingId) {
        void publicRequest<{ event: BrowseEvent }>(`/events/${bookingId}`)
          .then(({ event }) => { if (version === navigationVersion) setEventPage(event); })
          .catch(() => { if (version === navigationVersion) setEventPage(null); });
      } else {
        setEventPage(null);
      }
      setEventsOpen(window.location.hash === "#events");
      setGuideOpen(window.location.hash === "#how-it-works");
    };
    handleHistoryChange();
    window.addEventListener("popstate", handleHistoryChange);
    window.addEventListener("hashchange", handleHistoryChange);
    return () => {
      window.removeEventListener("popstate", handleHistoryChange);
      window.removeEventListener("hashchange", handleHistoryChange);
    };
  }, []);

  async function readNotification(notificationId: string) {
    if (!session) return;
    await apiRequest(`/notifications/${notificationId}/read`, session.token, {
      method: "POST",
    });
    setNotifications((items) =>
      items.map((item) =>
        item.id === notificationId
          ? { ...item, readAt: new Date().toISOString() }
          : item,
      ),
    );
  }

  async function cancelCustomerBooking(bookingId: string) {
    if (!session || !window.confirm("Cancel this booking? The refund rule shown in How it works will apply.")) return;
    setProfileBusy(true);
    setProfileMessage("");
    try {
      const result = await apiRequest<{ cancellation: { refundCents: number } }>(`/bookings/${bookingId}/cancel`, session.token, { method: "POST" });
      setProfileMessage(result.cancellation.refundCents ? `Booking cancelled. Mock refund: ৳${formatPrice(result.cancellation.refundCents)}.` : "Booking cancelled. No refund applies.");
      const payload = await apiRequest<{ bookings: CustomerBooking[] }>("/bookings", session.token);
      setCustomerBookings(payload.bookings);
      void loadPublicEvents({ q: query.trim(), city: cityFilter.trim(), date: dateFilter, page });
    } catch (error) {
      setProfileMessage(error instanceof Error ? error.message : "Could not cancel booking");
    } finally {
      setProfileBusy(false);
    }
  }

  async function loadPublicEvents(
    filters: { q?: string; city?: string; date?: string; status?: DiscoveryStatus; category?: string; sort?: DiscoverySort; page?: number } = {},
  ) {
    const requestVersion = ++eventRequestVersion.current;
    setEventsLoading(true);
    const params = new URLSearchParams({
      page: String(filters.page ?? 1),
      pageSize: "16",
    });
    if (filters.q) params.set("q", filters.q);
    if (filters.city) params.set("city", filters.city);
    if (filters.date) params.set("date", filters.date);
    params.set("status", filters.status ?? statusFilter);
    params.set("category", filters.category ?? categoryFilter);
    params.set("sort", filters.sort ?? sortOrder);
    await publicRequest<{ events: BrowseEvent[]; total: number; totalPages: number; page: number }>(`/events?${params.toString()}`)
      .then((payload) => {
        if (requestVersion !== eventRequestVersion.current) return;
        setPublicEvents(payload.events);
        setEventTotal(payload.total);
        setTotalPages(payload.totalPages);
        setPage(payload.page);
        setSelectedEvent((current) =>
          current
            ? (payload.events.find(
                (event) => event.id === current.id,
              ) ?? current)
            : current,
        );
      })
      .catch(() => {
        if (requestVersion !== eventRequestVersion.current) return;
        setPublicEvents([]);
        setEventTotal(0);
      })
      .finally(() => { if (requestVersion === eventRequestVersion.current) setEventsLoading(false); });
  }

  useEffect(() => {
    void loadPublicEvents({ q: query.trim(), city: cityFilter.trim(), date: dateFilter, status: statusFilter, category: categoryFilter, sort: sortOrder, page: 1 });
  }, [statusFilter, categoryFilter, sortOrder]);

  useEffect(() => {
    void Promise.all([
      publicRequest<{ events: BrowseEvent[] }>("/events?status=live&pageSize=4"),
      publicRequest<{ events: BrowseEvent[] }>("/events?status=upcoming&pageSize=8"),
    ])
      .then(([live, upcoming]) => setHomeEvents([...live.events, ...upcoming.events].slice(0, 8)))
      .catch(() => setHomeEvents([]));
    void publicRequest<{ events: BrowseEvent[] }>("/events?status=ended&sort=latest&pageSize=8")
      .then(({ events }) => setPastEvents(events))
      .catch(() => setPastEvents([]));
  }, []);

  function openAuth(mode: "login" | "register") {
    setAuthMode(mode);
    setAuthError("");
    setAuthOpen(true);
  }

  function openBookEvent(event: BrowseEvent) {
    // Keep a landing-page entry immediately before the booking page so the
    // browser Back button stays inside TicketFlow, even from the events list.
    if (window.location.hash === "#top" || !window.location.hash) {
      window.history.replaceState({ view: "landing" }, "", "#top");
    } else {
      window.history.pushState({ view: "landing" }, "", "#top");
    }
    window.history.pushState({ view: "book-event" }, "", `#book/${event.id}`);
    setEventPage(event);
  }

  function leaveBookEvent() {
    if (window.history.state?.view === "book-event") {
      window.history.back();
    } else {
      window.history.replaceState({ view: "landing" }, "", "#top");
      setEventPage(null);
      setEventsOpen(false);
      setGuideOpen(false);
      window.scrollTo(0, 0);
    }
  }

  function openEvents() {
    setEventPage(null);
    setEventsOpen(true);
    setGuideOpen(false);
    if (window.location.hash !== "#events")
      window.history.pushState({ view: "events" }, "", "#events");
    window.setTimeout(() => document.getElementById("events")?.scrollIntoView({ behavior: "instant" }), 0);
  }

  function openPastEvents() {
    setQuery("");
    setCityFilter("");
    setDateFilter("");
    setCategoryFilter("All categories");
    setStatusFilter("ended");
    setSortOrder("latest");
    openEvents();
  }

  function openLanding() {
    setEventPage(null);
    setEventsOpen(false);
    setGuideOpen(false);
    if (window.location.hash)
      window.history.pushState({ view: "landing" }, "", "#top");
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  function openGuide() {
    setEventPage(null);
    setEventsOpen(false);
    setGuideOpen(true);
    if (window.location.hash !== "#how-it-works")
      window.history.pushState({ view: "guide" }, "", "#how-it-works");
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthBusy(true);
    setAuthError("");
    const form = new FormData(event.currentTarget);
    try {
      const sessionResult = await authRequest(
        authMode === "login" ? "/auth/login" : "/auth/register",
        {
          email: String(form.get("email") ?? ""),
          password: String(form.get("password") ?? ""),
          ...(authMode === "register" ? { role: "customer" } : {}),
        },
      );
      setSession(sessionResult);
      setAuthOpen(false);
    } catch (error) {
      setAuthError(
        error instanceof Error ? error.message : "Unable to continue",
      );
    } finally {
      setAuthBusy(false);
    }
  }

  function searchEvents(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    openEvents();
    setSearchFocused(false);
    void loadPublicEvents({
      q: query.trim(),
      city: cityFilter.trim(),
      date: dateFilter,
      page: 1,
    });
    document.getElementById("events")?.scrollIntoView({ behavior: "instant" });
  }

  function filterByCity(city: string) {
    openEvents();
    setQuery("");
    setCityFilter(city);
    setDateFilter("");
    void loadPublicEvents({ city, page: 1 });
    document.getElementById("events")?.scrollIntoView({ behavior: "instant" });
  }

  const normalizedQuery = query.trim().toLowerCase();
  const normalizedCity = cityFilter.trim().toLowerCase();
  const hasActiveFilters = Boolean(
    normalizedQuery || normalizedCity || dateFilter || statusFilter !== "all" || categoryFilter !== "All categories",
  );
  const matchesEventFilters = (event: BrowseEvent) => {
    const searchableText =
      `${event.name} ${event.description} ${event.venue.city} ${event.venue.name}`.toLowerCase();
    const matchesQuery =
      !normalizedQuery || searchableText.includes(normalizedQuery);
    const matchesCity =
      !normalizedCity ||
      event.venue.city.toLowerCase().includes(normalizedCity);
    const matchesDate =
      !dateFilter ||
      new Date(event.startsAt).toISOString().slice(0, 10) === dateFilter;
    return matchesQuery && matchesCity && matchesDate;
  };
  const visibleEvents = publicEvents.filter(
    (event) => event.status === "published" && matchesEventFilters(event),
  );
  function suggestionRank(event: BrowseEvent) {
    const title = event.name.toLowerCase();
    if (title === normalizedQuery) return 0;
    if (title.startsWith(normalizedQuery)) return 1;
    if (title.split(/[^\p{L}\p{N}]+/u).some(word => word.startsWith(normalizedQuery))) return 2;
    if ([event.venue.city, event.venue.name].some(field => field.toLowerCase().startsWith(normalizedQuery))) return 3;
    return normalizedQuery.length >= 3 && title.includes(normalizedQuery) ? 4 : Infinity;
  }
  const suggestedEvents = visibleEvents.map(event => ({ event, rank: suggestionRank(event) }))
    .filter(match => Number.isFinite(match.rank))
    .sort((a, b) => a.rank - b.rank || Date.parse(a.event.startsAt) - Date.parse(b.event.startsAt))
    .slice(0, 5).map(match => match.event);

  return (
    <div className="site-shell">
      <header className="site-header">
        <a
          className="brand"
          href="#top"
          aria-label="TicketFlow home"
          onClick={(event) => {
            event.preventDefault();
            openLanding();
          }}
        >
          <span className="brand-mark">
            <span />
            <span />
            <span />
            <span />
          </span>
          <span>Ticket<span className="brand-flow">Flow</span><span className="brand-period">.</span></span>
        </a>
        <nav aria-label="Main navigation">
          {session?.user.role === "organizer" ? (
            <a href="#studio">Studio</a>
          ) : (
            <>
              <button type="button" className={`nav-link explore-nav ${eventsOpen ? "active" : ""}`} onClick={openEvents}>
                Explore events
              </button>
              <button type="button" className={`nav-link guide-nav ${guideOpen ? "active" : ""}`} onClick={openGuide}>How it works</button>
            </>
          )}
        </nav>
        {session ? (
          <div className="account-menu">
            {session.user.role === "customer" && (
              <div className="notification-wrap">
                <button
                  className="notification-button"
                  aria-label="Notifications"
                  onClick={() => setNotificationsOpen((open) => !open)}
                >
                  ♢
                  {notifications.some(
                    (notification) => !notification.readAt,
                  ) && <i />}
                </button>
                {notificationsOpen && (
                  <div className="notification-panel">
                    <strong>Notifications</strong>
                    {notifications.length ? (
                      notifications.slice(0, 5).map((notification) => (
                        <button
                          className={notification.readAt ? "" : "unread"}
                          key={notification.id}
                          onClick={() => void readNotification(notification.id)}
                        >
                          <span>
                            {notification.type === "booking_confirmed"
                              ? "✓"
                              : "×"}
                          </span>
                          {notification.message}
                        </button>
                      ))
                    ) : (
                      <p>No notifications yet.</p>
                    )}
                  </div>
                )}
              </div>
            )}
            <button type="button" className="profile-trigger" aria-expanded={profileOpen} aria-label="Open account menu" onClick={() => { setProfileTab("menu"); setProfileOpen(true); }}>
              <span className="profile-avatar">{session.user.email.slice(0, 2).toUpperCase()}</span><span>{session.user.email.split("@")[0]}</span><span aria-hidden="true">⌄</span>
            </button>
            <button
              type="button"
              className="theme-toggle"
              aria-label={isDark === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              onClick={toggleTheme}
            >
              {isDark === "dark" ? "☀" : "☾"}
            </button>
          </div>
        ) : (
          <div className="account-actions">
            <button
              type="button"
              className="theme-toggle"
              aria-label={isDark === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              onClick={toggleTheme}
              title={isDark === "dark" ? "Light mode" : "Dark mode"}
            >
              {isDark === "dark" ? "☀" : "☾"}
            </button>
            <button className="text-button" onClick={() => openAuth("login")}>
              Sign in
            </button>
            <button
              className="header-link header-button"
              aria-label="Join TicketFlow"
              onClick={() => openAuth("register")}
            >
              <span className="join-label-long">Join TicketFlow</span><span className="join-label-short">Join</span> <span aria-hidden="true">↗</span>
            </button>
          </div>
        )}
      </header>

      <main id="top">
        {session?.user.role === "organizer" ? (
          <OrganizerDashboard session={session} />
        ) : eventPage ? (
          <EventBookingPage event={eventPage} onBack={leaveBookEvent} onChooseSeats={() => setBookingEvent(eventPage)} />
        ) : (
          <>
            {!eventsOpen && !guideOpen && (
              <div className="home-discovery">
                <section className="featured-event marketing-hero" aria-labelledby="marketing-hero-title">
                  <img src="/images/laeeb-stadium-hero.webp" alt="La’eeb mascot floating above a stadium crowd" />
                  <div className="featured-shade" />
                  <div className="featured-copy">
                    <span className="section-kicker">TICKETFLOW · FIND YOUR NEXT LIVE MOMENT</span>
                    <h1 id="marketing-hero-title">Be there when <em>it happens.</em></h1>
                    <p>Concerts, sports, festivals, and more across Bangladesh. Discover the event, choose your seat, and keep your ticket in one place.</p>
                    <div className="marketing-hero-actions">
                      <button className="hero-cta" type="button" onClick={openEvents}>Explore events <span aria-hidden="true">↗</span></button>
                      <button className="marketing-hero-secondary" type="button" onClick={openGuide}>How it works <span aria-hidden="true">→</span></button>
                    </div>
                    <div className="marketing-hero-note">Discover <span>·</span> Choose your seat <span>·</span> Enjoy the moment</div>
                    <small className="marketing-hero-credit">La’eeb, the Qatar 2022 mascot, shown as a sports tribute. TicketFlow is independent of FIFA.</small>
                  </div>
                </section>
                <section className="home-categories" aria-labelledby="categories-title">
                  <h2 id="categories-title">Browse your way</h2>
                  <div className="category-tiles">
                    {eventCategories.map((category) => (
                      <button
                        type="button"
                        key={category}
                        onClick={() => { setCategoryFilter(category); openEvents(); }}
                        className="category-tile-btn"
                        data-category={category.toLowerCase()}
                      >
                        <img
                          className="category-tile-image"
                          src={`/images/categories/${category.toLowerCase()}.webp`}
                          alt=""
                          loading="lazy"
                          decoding="async"
                        />
                        <span
                          className="category-tile-art"
                          aria-hidden="true"
                          dangerouslySetInnerHTML={{ __html: categoryIcons[category] ?? categoryIcons.Other }}
                        />
                        <strong>{category}</strong>
                        <i aria-hidden="true" className="category-tile-arrow">↗</i>
                      </button>
                    ))}
                  </div>
                </section>
                <section className="home-sale" aria-labelledby="sale-title">
                  <div className="home-sale-heading"><h2 id="sale-title">On sale now</h2><button type="button" onClick={() => { setStatusFilter("all"); setSortOrder("soonest"); openEvents(); }}>View all <span aria-hidden="true">→</span></button></div>
                  {homeEvents.length ? <div className="public-event-grid">{homeEvents.slice(0, 8).map((event) => <PublicEventCard key={event.id} event={event} onOpen={() => setSelectedEvent(event)} onBook={() => openBookEvent(event)} onCity={filterByCity} />)}</div> : <p className="home-empty">New events will appear here when organizers publish them.</p>}
                </section>
                <section className="home-past" aria-labelledby="past-title">
                  <div className="home-sale-heading"><h2 id="past-title">Past events</h2><button type="button" onClick={openPastEvents}>View all <span aria-hidden="true">→</span></button></div>
                  {pastEvents.length ? <div className="public-event-grid">{pastEvents.map((event) => <PublicEventCard key={event.id} event={event} onOpen={() => setSelectedEvent(event)} onCity={filterByCity} />)}</div> : <p className="home-empty">Completed events will appear here.</p>}
                </section>
              </div>
            )}

            {eventsOpen && (
              <section
                className="events-section"
                id="events"
                aria-labelledby="events-title"
              >
                <form
                  className="search events-search discovery-search"
                  onSubmit={searchEvents}
                  role="search"
                  onKeyDown={e => { if (e.key === "Escape") setSearchFocused(false); }}
                  onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) setSearchFocused(false); }}
                >
                  {/* ── Row 1: Search + filter chips ── */}
                  <div className="filter-bar">
                    <div className="filter-search-wrap">
                      <svg className="filter-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                      <input
                        id="event-search"
                        className="filter-search-input"
                        aria-label="Search events or venues"
                        value={query}
                        onChange={(event) => {
                          const value = event.target.value;
                          setQuery(value);
                          setSearchFocused(Boolean(value.trim()));
                        }}
                        placeholder="Search events, venues, cities…"
                      />
                      {query && (
                        <button type="button" className="filter-clear-x" aria-label="Clear search" onClick={() => { setQuery(""); setSearchFocused(false); }}>×</button>
                      )}
                    </div>
                    <div className="filter-chips">
                      <label className="filter-chip">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                        <select aria-label="Event status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as DiscoveryStatus)}>
                          <option value="all">All statuses</option>
                          <option value="live">Happening now</option>
                          <option value="upcoming">Upcoming</option>
                          <option value="ended">Ended</option>
                        </select>
                        <svg className="chip-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>
                      </label>
                      <label className="filter-chip">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
                        <select aria-label="Event category" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
                          <option value="All categories">Any type</option>
                          {eventCategories.map((category) => <option key={category}>{category}</option>)}
                        </select>
                        <svg className="chip-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>
                      </label>
                      <label className="filter-chip">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
                        <select aria-label="Sort events" value={sortOrder} onChange={(event) => setSortOrder(event.target.value as DiscoverySort)}>
                          <option value="soonest">Soonest first</option>
                          <option value="latest">Latest start</option>
                          <option value="ending">Ending soon</option>
                          <option value="name_asc">A → Z</option>
                          <option value="name_desc">Z → A</option>
                        </select>
                        <svg className="chip-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>
                      </label>
                    </div>
                  </div>
                  {/* ── Row 2: City + Date + Clear ── */}
                  <div className="filter-row2">
                    <label className="filter-inline-label">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                      <input
                        value={cityFilter}
                        onChange={(event) => setCityFilter(event.target.value)}
                        placeholder="Any city"
                        aria-label="Filter by city"
                      />
                    </label>
                    <label className="filter-inline-label">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                      <input
                        type="date"
                        value={dateFilter}
                        onChange={(event) => setDateFilter(event.target.value)}
                        aria-label="Filter by date"
                      />
                    </label>
                    {(query || cityFilter || dateFilter || statusFilter !== "all" || categoryFilter !== "All categories") && (
                      <button
                        type="button"
                        className="filter-clear-btn"
                        onClick={() => {
                          setQuery("");
                          setCityFilter("");
                          setDateFilter("");
                          setStatusFilter("all");
                          setCategoryFilter("All categories");
                          setSortOrder("soonest");
                          setSearchFocused(false);
                          void loadPublicEvents({ page: 1, status: "all", category: "All categories", sort: "soonest" });
                        }}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        Clear filters
                      </button>
                    )}
                  </div>
                  {searchFocused && normalizedQuery && (
                    <div
                      className="search-suggestions"
                      role="group"
                      aria-label="Available events"
                    >
                      {suggestedEvents.length ? (
                        suggestedEvents.map((event) => (
                          <button
                            type="button"
                            key={event.id}
                            onMouseDown={(clickEvent) =>
                              clickEvent.preventDefault()
                            }
                            onClick={() => {
                              setQuery(event.name);
                              setSearchFocused(false);
                              setSelectedEvent(event);
                            }}
                          >
                            <span className="suggestion-date">{new Date(event.startsAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
                            <span className="suggestion-copy"><strong>{event.name}</strong><small>{event.venue.name} · {event.venue.city}</small></span>
                            <i aria-hidden="true">↗</i>
                          </button>
                        ))
                      ) : (
                        <p className="no-suggestions">
                          No published events match yet.
                        </p>
                      )}
                    </div>
                  )}
                </form>
                <div className="section-heading">
                  <div>
                    <span className="section-kicker">DISCOVER TICKETFLOW</span>
                    <h2 id="events-title">All events</h2>
                  </div>
                  <span className="event-result-count">Showing {visibleEvents.length} of {eventTotal}</span>
                </div>
                {eventsLoading ? (
                  <div className="empty-events">
                    <div className="empty-symbol" aria-hidden="true">
                      ↗
                    </div>
                    <div>
                      <h3>Finding the next good night.</h3>
                      <p>Loading published events.</p>
                    </div>
                  </div>
                ) : visibleEvents.length ? (
                  <>
                    <div className="public-event-grid">
                      {visibleEvents.map((event) => (
                        <PublicEventCard key={event.id} event={event} onOpen={() => setSelectedEvent(event)} onBook={() => openBookEvent(event)} onCity={filterByCity} />
                      ))}
                    </div>
                    {totalPages > 1 && (
                      <div className="pagination">
                        <button
                          disabled={page === 1}
                          onClick={() =>
                            void loadPublicEvents({
                              q: query.trim(),
                              city: cityFilter.trim(),
                              date: dateFilter,
                              page: page - 1,
                            })
                          }
                        >
                          ← Previous
                        </button>
                        <span>
                          Page {page} of {totalPages}
                        </span>
                        <button
                          disabled={page === totalPages}
                          onClick={() =>
                            void loadPublicEvents({
                              q: query.trim(),
                              city: cityFilter.trim(),
                              date: dateFilter,
                              page: page + 1,
                            })
                          }
                        >
                          Next →
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="empty-events">
                    <div className="empty-symbol" aria-hidden="true">
                      ✳
                    </div>
                    <div>
                      <h3>
                        {hasActiveFilters
                          ? "No matching events found."
                          : "The calendar is getting ready."}
                      </h3>
                      <p>
                        {hasActiveFilters
                          ? "Try a different event name, city, or date."
                          : "Published events will appear here as soon as organizers add them."}
                      </p>
                    </div>
                  </div>
                )}
              </section>
            )}

            {guideOpen && (
              <section className="guide-page" id="how-it-works" aria-labelledby="how-title">
                <div className="guide-intro">
                  <span className="section-kicker">YOUR GUIDE TO TICKETFLOW</span>
                  <h1 id="how-title">A great seat starts <em>here.</em></h1>
                  <p>TicketFlow connects event organizers with people ready to attend. Explore the event, see its details, choose an available seat, and finish your booking in a few clear steps.</p>
                  <button className="hero-cta" onClick={openEvents}>Explore events <span aria-hidden="true">↗</span></button>
                </div>
                <div className="guide-steps">
                  <article><span>01 / DISCOVER</span><h2>Find your event</h2><p>Browse published upcoming events or search by name, city, and date. Open an event to see its schedule, venue, description, highlights, poster, and ticket prices.</p></article>
                  <article><span>02 / CHOOSE</span><h2>Pick your seats</h2><p>Sign in with a customer account, then choose available seats on the seat map. Held and booked seats are clearly marked so you know what is open.</p></article>
                  <article><span>03 / HOLD</span><h2>Take five minutes</h2><p>When you hold seats, they are reserved for five minutes. Complete checkout before the timer ends; otherwise the seats become available again.</p></article>
                  <article><span>04 / PAY</span><h2>Confirm your booking</h2><p>Choose one of the two mock payment providers and complete payment. A successful payment confirms your booking and sends an in-app notification.</p></article>
                </div>
                <div className="guide-note"><div><span className="section-kicker">GOOD TO KNOW</span><h2>Plans can change.</h2></div><p>You can cancel a booking. Confirmed bookings cancelled more than 24 hours before the event qualify for a full refund under the current demo rule; later cancellations do not. Payments and refunds in TicketFlow are simulated.</p></div>
                <div className="guide-organizers"><span className="section-kicker">FOR ORGANIZERS</span><h2>Publish when you are ready.</h2><p>Organizers create venues, define seat rows and prices, add event details, and save private drafts. Customers only see events after they are published. Organizer access is preconfigured by the site owner.</p></div>
              </section>
            )}
          </>
        )}
      </main>
      {!eventsOpen && !guideOpen && (
        <footer className="site-footer">
          <span className="footer-brand">Ticket<span className="brand-flow">Flow</span><span className="brand-period">.</span></span>
          <span className="footer-tagline">Made for the moments that matter.</span>
          <span className="footer-copy">&copy; {new Date().getFullYear()} TicketFlow. All rights reserved.</span>
        </footer>
      )}
      {profileOpen && session && <div className="profile-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setProfileOpen(false); }}>
        <aside className="profile-drawer" aria-label="Account menu">
          <div className="profile-drawer-head">
            <span className="profile-avatar large">{session.user.email.slice(0, 2).toUpperCase()}</span>
            <div><strong>{session.user.email.split("@")[0]}</strong><span>{session.user.email}</span></div>
            <button type="button" className="profile-close" aria-label="Close account menu" onClick={() => setProfileOpen(false)}>×</button>
          </div>
          {profileTab !== "menu" && <button type="button" className="profile-back" onClick={() => setProfileTab("menu")}>← Account menu</button>}
          {profileTab === "menu" ? <>
            <div className="profile-quick-actions">
              <button type="button" onClick={() => setProfileTab("profile")}><span>♙</span>Profile</button>
              {session.user.role === "customer" && <><button type="button" onClick={() => setProfileTab("tickets")}><span>▣</span>Tickets</button><button type="button" onClick={() => setProfileTab("orders")}><span>▤</span>Orders</button><button type="button" onClick={() => setProfileTab("cart")}><span>⌑</span>Cart</button></>}
            </div>
            <div className="profile-drawer-section"><span>BROWSE</span><button type="button" onClick={() => { setProfileOpen(false); openLanding(); }}>⌂ <strong>Home</strong></button><button type="button" onClick={() => { setProfileOpen(false); openEvents(); }}>▦ <strong>Events</strong></button><button type="button" onClick={() => { setProfileOpen(false); openGuide(); }}>◎ <strong>How it works</strong></button></div>
            {recentlyViewed.length > 0 && (
              <div className="profile-drawer-section">
                <span>RECENTLY VIEWED</span>
                {recentlyViewed.map((rv) => (
                  <button
                    key={rv.id}
                    type="button"
                    className="profile-recent"
                    onClick={() => { setProfileOpen(false); setSelectedEvent(rv); }}
                  >
                    {rv.posterUrl && <img src={rv.posterUrl} alt="" />}
                    <strong>{rv.name}</strong>
                  </button>
                ))}
              </div>
            )}
            <button type="button" className="profile-signout" onClick={() => { setProfileOpen(false); setSession(null); }}>Sign out →</button>
          </> : profileTab === "profile" ? (
            <div className="profile-panel">
              <h2>Your profile</h2>
              <p>Signed in as <strong>{session.user.email}</strong></p>
              <p>Account type: <strong>{session.user.role}</strong></p>
            </div>
          ) : profileTab === "cart" ? (
            <div className="profile-panel">
              <h2>Your cart</h2>
              <p>Seats are selected and held during checkout. Start with an event to choose yours.</p>
              <button className="primary-button" onClick={() => { setProfileOpen(false); openEvents(); }}>Browse events →</button>
            </div>
          ) : (
            <div className="profile-panel">
              <h2>{profileTab === "tickets" ? "Your tickets" : "Your orders"}</h2>
              {profileMessage && <p role="status">{profileMessage}</p>}
              {customerBookings.filter((booking) => profileTab === "orders" || booking.status === "confirmed").length ? (
                customerBookings
                  .filter((booking) => profileTab === "orders" || booking.status === "confirmed")
                  .map((booking) => (
                    <article className="profile-booking" key={booking.id}>
                      <span className="profile-booking-status">{booking.status.replace("_", " ")}</span>
                      <h3>{booking.eventName}</h3>
                      <p>{new Date(booking.startsAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</p>
                      <p>{booking.seats.map((seat) => `${seat.rowLabel}${seat.seatNumber}`).join(", ") || "No seats"}</p>
                      <strong>৳{formatPrice(booking.totalCents)}</strong>
                      {/* QR code + download for confirmed tickets */}
                      {booking.status === "confirmed" && (
                        <div className="qr-ticket-wrapper">
                          <span className="section-kicker">Your Ticket QR</span>
                          <pre className="qr-code-fallback" aria-label="QR code pattern">{generateQRPattern(`${booking.id}-${booking.eventName}`)}</pre>
                          <div className="qr-ticket-info">
                            {booking.seats.map((s) => `${s.rowLabel}${s.seatNumber}`).join(", ")} · ৳{formatPrice(booking.totalCents)}
                          </div>
                          <button
                            className="ticket-download-btn"
                            type="button"
                            onClick={() => {
                              const content = [
                                "TICKETFLOW TICKET",
                                "─".repeat(32),
                                `Event:    ${booking.eventName}`,
                                `Date:     ${new Date(booking.startsAt).toLocaleString()}`,
                                `Seats:    ${booking.seats.map((s) => `${s.rowLabel}${s.seatNumber}`).join(", ")}`,
                                `Total:    ৳${formatPrice(booking.totalCents)}`,
                                `Booking:  ${booking.id}`,
                                "─".repeat(32),
                                generateQRPattern(booking.id),
                              ].join("\n");
                              const blob = new Blob([content], { type: "text/plain" });
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement("a");
                              a.href = url;
                              a.download = `ticket-${booking.id.slice(0, 8)}.txt`;
                              a.click();
                              URL.revokeObjectURL(url);
                              showToast("✓ Ticket downloaded!");
                            }}
                          >
                            ⬇ Download ticket
                          </button>
                        </div>
                      )}
                      {profileTab === "orders" && ["held", "pending_payment", "confirmed"].includes(booking.status) && (
                        <button className="profile-cancel" disabled={profileBusy} onClick={() => void cancelCustomerBooking(booking.id)}>Cancel booking</button>
                      )}
                    </article>
                  ))
              ) : (
                <p>{profileTab === "tickets" ? "Confirmed tickets will appear here after checkout." : "Your booking history will appear here."}</p>
              )}
            </div>
          )}
        </aside>
      </div>}
      {authOpen && (
        <div
          className="modal-backdrop auth-page-backdrop"
          role="presentation"
        >
          <div className="auth-layout" role="dialog" aria-modal="true" aria-labelledby="auth-title">
            <aside className="auth-showcase">
              <div className="auth-showcase-head"><span className="auth-brand">Ticket<span>Flow</span>.</span><button onClick={() => setAuthOpen(false)}>Back to site ↗</button></div>
              <div className="auth-showcase-art" aria-hidden="true"><span>THE STAGE</span><div className="auth-art-seats">{Array.from({ length: 24 }, (_, index) => <i key={index} />)}</div></div>
              <div className="auth-showcase-copy"><span>WELCOME TO YOUR NEXT EVENT</span><h2>Every great night starts with a seat.</h2><p>Discover what is on, hold your place, and keep the booking close.</p><div>✦ &nbsp; One account for every event</div><div>✦ &nbsp; Your seats held while you check out</div><div>✦ &nbsp; Booking updates in one place</div></div>
            </aside>
            <section className="auth-panel">
              <button className="auth-close" aria-label="Close sign in" onClick={() => setAuthOpen(false)}>×</button>
              <div className="auth-panel-inner">
                <span className="section-kicker">TICKETFLOW ACCOUNT</span>
                <h2 id="auth-title">{authMode === "login" ? "Sign in" : "Create your account"}</h2>
                <p>{authMode === "login" ? "New here?" : "Already have an account?"} <button className="auth-switch" onClick={() => { setAuthMode(authMode === "login" ? "register" : "login"); setAuthError(""); }}>{authMode === "login" ? "Create a customer account" : "Sign in"}</button></p>
                <div className="auth-method">Continue with password</div>
                <form className="auth-form" onSubmit={submitAuth}>
                  <label htmlFor="auth-email">Email address</label>
                  <input id="auth-email" name="email" type="email" autoComplete="email" required placeholder="you@example.com" />
                  <label htmlFor="auth-password">Password</label>
                  <div className="auth-password-wrap">
                    <input
                      id="auth-password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete={authMode === "login" ? "current-password" : "new-password"}
                      minLength={5}
                      required
                      placeholder={authMode === "login" ? "Enter your password" : "At least 5 characters"}
                    />
                    <button
                      type="button"
                      className="auth-show-pass"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      onClick={() => setShowPassword((v) => !v)}
                    >
                      {showPassword ? (
                        /* Eye-off icon */
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                          <line x1="1" y1="1" x2="23" y2="23"/>
                        </svg>
                      ) : (
                        /* Eye icon */
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                          <circle cx="12" cy="12" r="3"/>
                        </svg>
                      )}
                    </button>
                  </div>

                  {authError && <p className="auth-error" role="alert">{authError}</p>}
                  <button className="auth-submit" disabled={authBusy}>{authBusy ? "Please wait…" : authMode === "login" ? "Sign in →" : "Create customer account →"}</button>
                </form>
                <p className="auth-footnote">This project uses mock payments. Your password is stored as a salted hash.</p>
              </div>
            </section>
          </div>
        </div>
      )}
      {selectedEvent && (
        <EventDetailsModal
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
        />
      )}
      {bookingEvent && (
        <BookingModal
          event={bookingEvent}
          session={session?.user.role === "customer" ? session : null}
          onClose={() => setBookingEvent(null)}
          onHeld={() => {
            void loadPublicEvents({
              q: query.trim(),
              city: cityFilter.trim(),
              date: dateFilter,
              page,
            });
          }}
          onSignIn={() => {
            setBookingEvent(null);
            openAuth("login");
          }}
          onBookAnother={() => {
            setBookingEvent(null);
            void loadPublicEvents({
              q: query.trim(),
              city: cityFilter.trim(),
              date: dateFilter,
              page,
            });
          }}
        />
      )}
      {/* Toast notification */}
      {toast && (
        <div className={`toast-banner${toast.type === "error" ? " error" : ""}`} role="status" aria-live="polite">
          <span className="toast-icon">{toast.type === "error" ? "⚠" : "✓"}</span>
          {toast.message}
        </div>
      )}
    </div>
  );
}
