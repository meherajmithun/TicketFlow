import { useEffect, useState, useCallback, type FormEvent } from "react";

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

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

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

// ─── Featured countdown component ────────────────────────────────────────────
function FeaturedCountdown({ startsAt }: { startsAt: string }) {
  const { days, hours, mins, secs, expired } = useCountdown(startsAt);
  if (expired) return null;
  return (
    <div className="featured-countdown" aria-label="Time until event">
      {days > 0 && (
        <div className="countdown-block">
          <strong>{days}</strong>
          <span>Days</span>
        </div>
      )}
      <div className="countdown-block">
        <strong>{String(hours).padStart(2, "0")}</strong>
        <span>Hrs</span>
      </div>
      <div className="countdown-block">
        <strong>{String(mins).padStart(2, "0")}</strong>
        <span>Min</span>
      </div>
      <div className="countdown-block">
        <strong>{String(secs).padStart(2, "0")}</strong>
        <span>Sec</span>
      </div>
    </div>
  );
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

const seats = Array.from({ length: 48 }, (_, index) => index);

function SeatPreview() {
  return (
    <div className="seat-preview" aria-hidden="true">
      <div className="preview-topline">
        <span>THE STAGE</span>
        <span>YOUR SEAT AWAITS</span>
      </div>
      <div className="stage" />
      <div className="seat-grid">
        {seats.map((seat) => (
          <span
            className={`seat ${[8, 13, 23, 28, 37].includes(seat) ? "seat-selected" : ""}`}
            key={seat}
          />
        ))}
      </div>
      <div className="preview-legend">
        <span>
          <i className="legend-dot" /> Available
        </span>
        <span>
          <i className="legend-dot selected" /> Your picks
        </span>
      </div>
    </div>
  );
}

function EventDetailsModal({
  event,
  onClose,
  onChooseSeats,
}: {
  event: BrowseEvent;
  onClose: () => void;
  onChooseSeats: () => void;
}) {
  const [posterFailed, setPosterFailed] = useState(false);
  const availableSeats = event.seats.filter((seat) => seat.available).length;
  const highlights = event.highlights
    .split(/\n+/)
    .map((item) => item.trim())
    .filter(Boolean);

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
          {highlights.length > 0 && (
            <section>
              <h3>What you’ll experience</h3>
              <ul>{highlights.map((highlight) => <li key={highlight}>{highlight}</li>)}</ul>
            </section>
          )}
          <div className="event-story-facts">
            <span><strong>{availableSeats}</strong> seats available</span>
            <span><strong>{event.categories.length}</strong> ticket {event.categories.length === 1 ? "category" : "categories"}</span>
            <span><strong>{formatPrice(Math.min(...event.categories.map((category) => category.basePriceCents)))}</strong> starting price</span>
          </div>
          {/* Social share row */}
          <div className="event-share-row">
            {typeof navigator !== "undefined" && "share" in navigator && (
              <button
                type="button"
                className="share-button share-native"
                onClick={() => void (navigator as Navigator & { share: (d: ShareData) => Promise<void> }).share({ title: event.name, text: event.description, url: window.location.href })}
              >
                ↗ Share
              </button>
            )}
            <a
              className="share-button share-twitter"
              href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`${event.name} @ ${event.venue.name}`)}&url=${encodeURIComponent(window.location.href)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              𝕏 Twitter
            </a>
            <a
              className="share-button share-whatsapp"
              href={`https://wa.me/?text=${encodeURIComponent(`${event.name} @ ${event.venue.name} — ${window.location.href}`)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              WhatsApp
            </a>
            <button
              type="button"
              className="share-button share-copy"
              onClick={() => { void navigator.clipboard.writeText(window.location.href); }}
            >
              Copy link
            </button>
          </div>
          {eventPhase(event) === "Ended" ? <p className="event-ended-note">This event has ended. Booking is closed.</p> : <button className="primary-button event-story-action" onClick={onChooseSeats}>Choose your seats <span aria-hidden="true">→</span></button>}
        </div>
      </article>
    </div>
  );
}

function PublicEventCard({ event, onOpen, onCity }: { event: BrowseEvent; onOpen: () => void; onCity: (city: string) => void }) {
  const phase = eventPhase(event);
  const price = Math.min(...event.categories.map((category) => category.basePriceCents));
  return (
    <article className="discovery-card">
      <button className="discovery-poster" type="button" onClick={onOpen} aria-label={`View ${event.name}`}>
        <span className="discovery-poster-fallback"><small>{event.category}</small><strong>{event.name}</strong></span>
        {event.posterUrl && <img src={event.posterUrl} alt="" loading="lazy" onError={(imageEvent) => { imageEvent.currentTarget.hidden = true; }} />}
        <span className="discovery-date"><small>{new Date(event.startsAt).toLocaleDateString(undefined, { month: "short", weekday: "short" })}</small><strong>{new Date(event.startsAt).toLocaleDateString(undefined, { day: "numeric" })}</strong></span>
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
          <button type="button" onClick={onOpen}>{phase === "Ended" ? "View event" : "Book now"} <span aria-hidden="true">→</span></button>
        </div>
      </div>
    </article>
  );
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
        <span className="section-kicker">CHOOSE YOUR MOMENT</span>
        <h2 id="booking-title">{event.name}</h2>
        <p className="booking-meta">
          {event.venue.name} · {event.venue.city} ·{" "}
          {new Date(event.startsAt).toLocaleString(undefined, {
            dateStyle: "medium",
            timeStyle: "short",
          })}
        </p>
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
            <div className="booking-stage">THE STAGE</div>
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
        {activePanel === "venues" ? <div className="venue-management"><div className="venue-management-list">{venues.map((venue) => <article className="managed-venue" key={venue.id}><div><strong>{venue.name}</strong><span>{venue.city} · {venue.address}</span></div><div><button className="edit-button" onClick={() => editVenue(venue)}>Edit</button><button className="danger-button" disabled={busy} onClick={() => void deleteVenue(venue)}>Delete</button></div></article>)}</div><form className="venue-form venue-management-form" onSubmit={createVenue}><span className="form-label">{editingVenueId ? "EDIT VENUE" : "ADD A VENUE"}</span><input required placeholder="Venue name" value={venueForm.name} onChange={(event) => setVenueForm({ ...venueForm, name: event.target.value })} /><input required placeholder="City" value={venueForm.city} onChange={(event) => setVenueForm({ ...venueForm, city: event.target.value })} /><input required placeholder="Address" value={venueForm.address} onChange={(event) => setVenueForm({ ...venueForm, address: event.target.value })} /><button className="outline-button" disabled={busy}>{editingVenueId ? "Save changes" : "Add venue"} <span>+</span></button></form></div> : <div className="managed-event-list">{events.filter((event) => activePanel === "drafts" ? event.status === "draft" : activePanel === "running" ? event.status === "published" && new Date(event.endsAt) > new Date() : event.status === "published" && new Date(event.endsAt) <= new Date()).map((event) => <article className="managed-event" key={event.id}><div className="event-date"><strong>{new Date(event.startsAt).toLocaleDateString(undefined, { day: "2-digit" })}</strong><span>{new Date(event.startsAt).toLocaleDateString(undefined, { month: "short" }).toUpperCase()}</span></div><div><span className={`event-status ${activePanel === "delivered" ? "past" : event.status}`}>{activePanel === "delivered" ? "delivered" : event.status}</span><h3>{event.name}</h3><p>{event.venue.name} · {event.venue.city}</p></div><div className="managed-event-stats"><strong>{event.seats.filter((seat) => seat.available).length}</strong><span>AVAILABLE / {event.seats.length}</span><button className="edit-button" onClick={() => { editEvent(event); setActivePanel("create"); }}>Manage event</button>{activePanel === "drafts" && <button className="publish-button" disabled={busy} onClick={() => void publishEvent(event.id)}>Publish</button>}</div></article>)}</div>}
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
  const [query, setQuery] = useState("");
  const [publicEvents, setPublicEvents] = useState<BrowseEvent[]>([]);
  const [homeEvents, setHomeEvents] = useState<BrowseEvent[]>([]);
  const [featuredIndex, setFeaturedIndex] = useState(0);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [eventTotal, setEventTotal] = useState(0);
  const [eventsOpen, setEventsOpen] = useState(
    () => window.location.hash === "#events",
  );
  const [guideOpen, setGuideOpen] = useState(
    () => window.location.hash === "#how-it-works",
  );
  const [searchFocused, setSearchFocused] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<BrowseEvent | null>(null);
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
  const [newsletterEmail, setNewsletterEmail] = useState("");
  const [newsletterDone, setNewsletterDone] = useState(false);
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
    const handleHistoryChange = () => {
      setEventsOpen(window.location.hash === "#events");
      setGuideOpen(window.location.hash === "#how-it-works");
    };
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
        setPublicEvents([]);
        setEventTotal(0);
      })
      .finally(() => setEventsLoading(false));
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
  }, []);

  function openAuth(mode: "login" | "register") {
    setAuthMode(mode);
    setAuthError("");
    setAuthOpen(true);
  }

  function openEvents() {
    setEventsOpen(true);
    setGuideOpen(false);
    if (window.location.hash !== "#events")
      window.history.pushState({ view: "events" }, "", "#events");
    window.setTimeout(
      () =>
        document
          .getElementById("events")
          ?.scrollIntoView({ behavior: "smooth" }),
      0,
    );
  }

  function openLanding() {
    setEventsOpen(false);
    setGuideOpen(false);
    if (window.location.hash)
      window.history.pushState({ view: "landing" }, "", "#top");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openGuide() {
    setEventsOpen(false);
    setGuideOpen(true);
    if (window.location.hash !== "#how-it-works")
      window.history.pushState({ view: "guide" }, "", "#how-it-works");
    window.scrollTo({ top: 0, behavior: "smooth" });
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
    document.getElementById("events")?.scrollIntoView({ behavior: "smooth" });
  }

  function filterByCity(city: string) {
    openEvents();
    setQuery("");
    setCityFilter(city);
    setDateFilter("");
    void loadPublicEvents({ city, page: 1 });
    document.getElementById("events")?.scrollIntoView({ behavior: "smooth" });
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
  const featuredEvent = homeEvents.length ? homeEvents[featuredIndex % homeEvents.length] : null;

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
          </div>
        ) : (
          <div className="account-actions">
            <button className="text-button" onClick={() => openAuth("login")}>
              Sign in
            </button>
            <button
              className="header-link header-button"
              onClick={() => openAuth("register")}
            >
              Join TicketFlow <span aria-hidden="true">↗</span>
            </button>
          </div>
        )}
      </header>

      <main id="top">
        {session?.user.role === "organizer" ? (
          <OrganizerDashboard session={session} />
        ) : (
          <>
            {!eventsOpen && !guideOpen && (
              <div className="home-discovery">
                <section className="featured-event" aria-label="Featured event">
                  {featuredEvent?.posterUrl && <img src={featuredEvent.posterUrl} alt="" onError={(imageEvent) => { imageEvent.currentTarget.hidden = true; }} />}
                  <div className="featured-fallback-art" aria-hidden="true"><SeatPreview /></div>
                  <div className="featured-shade" />
                  <div className="featured-copy">
                    <span className="section-kicker">YOUR NEXT MOMENT STARTS HERE</span>
                    <h1>{featuredEvent?.name ?? "Find your place in the moment."}</h1>
                    <p>{featuredEvent ? `${featuredEvent.venue.name} · ${featuredEvent.venue.city} · ${new Date(featuredEvent.startsAt).toLocaleDateString(undefined, { dateStyle: "medium" })}` : "Discover events, pick your spot, and keep every ticket in one place."}</p>
                    {featuredEvent && eventPhase(featuredEvent) === "Upcoming" && (
                      <FeaturedCountdown startsAt={featuredEvent.startsAt} />
                    )}
                    <button className="hero-cta" onClick={featuredEvent ? () => setSelectedEvent(featuredEvent) : openEvents}>{featuredEvent ? "View event" : "Explore events"} <span aria-hidden="true">↗</span></button>
                  </div>
                  {homeEvents.length > 1 && <div className="featured-controls"><button type="button" aria-label="Previous featured event" onClick={() => setFeaturedIndex((index) => (index + homeEvents.length - 1) % homeEvents.length)}>←</button><button type="button" aria-label="Next featured event" onClick={() => setFeaturedIndex((index) => (index + 1) % homeEvents.length)}>→</button></div>}
                </section>
                <section className="home-categories" aria-labelledby="categories-title">
                  <h2 id="categories-title">Browse your way</h2>
                  <div className="category-tiles">{eventCategories.map((category, index) => <button type="button" key={category} onClick={() => { setCategoryFilter(category); openEvents(); }}><span className="category-tile-art" aria-hidden="true">{["♫", "⚽", "✦", "✎", "✳", "◎", "▣", "★", "♡", "↗"][index]}</span><strong>{category}</strong><i aria-hidden="true">↗</i></button>)}</div>
                </section>
                <section className="home-sale" aria-labelledby="sale-title">
                  <div className="home-sale-heading"><h2 id="sale-title">On sale now</h2><button type="button" onClick={openEvents}>View all <span aria-hidden="true">→</span></button></div>
                  {homeEvents.length ? <div className="public-event-grid">{homeEvents.slice(0, 8).map((event) => <PublicEventCard key={event.id} event={event} onOpen={() => setSelectedEvent(event)} onCity={filterByCity} />)}</div> : <p className="home-empty">New events will appear here when organizers publish them.</p>}
                </section>
                {/* Newsletter strip */}
                <section className="newsletter-strip" aria-label="Stay in the loop">
                  <div className="newsletter-copy">
                    <span className="section-kicker">STAY IN THE LOOP</span>
                    <h2>Never miss an event.</h2>
                    <p>Get notified first when new events drop, early-bird deals go live, and your favourite artists announce shows.</p>
                  </div>
                  <div className="newsletter-action">
                    {newsletterDone ? (
                      <div className="newsletter-success">✓ You&apos;re on the list! We&apos;ll be in touch soon.</div>
                    ) : (
                      <form
                        className="newsletter-form"
                        onSubmit={(e) => {
                          e.preventDefault();
                          if (newsletterEmail.trim()) {
                            setNewsletterDone(true);
                            showToast("✓ You're on the list!");
                          }
                        }}
                      >
                        <input
                          type="email"
                          placeholder="your@email.com"
                          value={newsletterEmail}
                          onChange={(e) => setNewsletterEmail(e.target.value)}
                          required
                          aria-label="Email address for newsletter"
                        />
                        <button className="newsletter-submit" type="submit">Notify me</button>
                      </form>
                    )}
                  </div>
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
                  <div className="discovery-main-filters">
                    <div className="search-row discovery-query">
                      <span className="search-icon" aria-hidden="true">⌕</span>
                      <input
                        id="event-search"
                        aria-label="Search events or venues"
                        value={query}
                        onChange={(event) => {
                          const value = event.target.value;
                          setQuery(value);
                          setSearchFocused(Boolean(value.trim()));
                        }}
                        placeholder="Search events or venues"
                      />
                      <button type="submit" aria-label="Search events">⌕</button>
                    </div>
                    <label className="discovery-select"><span className="filter-dot" />
                      <select aria-label="Event status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as DiscoveryStatus)}>
                        <option value="all">All statuses</option><option value="live">Happening now</option><option value="upcoming">Upcoming</option><option value="ended">Ended</option>
                      </select>
                    </label>
                    <label className="discovery-select"><span className="filter-dot" />
                      <select aria-label="Event category" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
                        <option>All categories</option>{eventCategories.map((category) => <option key={category}>{category}</option>)}
                      </select>
                    </label>
                    <label className="discovery-select"><span className="filter-dot" />
                      <select aria-label="Sort events" value={sortOrder} onChange={(event) => setSortOrder(event.target.value as DiscoverySort)}>
                        <option value="soonest">Soonest first</option><option value="latest">Latest start first</option><option value="ending">Ending soonest</option><option value="name_asc">Alphabetical A–Z</option><option value="name_desc">Alphabetical Z–A</option>
                      </select>
                    </label>
                  </div>
                  <div className="search-filters">
                    <label>
                      City{" "}
                      <input
                        value={cityFilter}
                        onChange={(event) => setCityFilter(event.target.value)}
                        placeholder="Any city"
                      />
                    </label>
                    <label>
                      Date{" "}
                      <input
                        type="date"
                        value={dateFilter}
                        onChange={(event) => setDateFilter(event.target.value)}
                      />
                    </label>
                    <button
                      type="button"
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
                      Clear filters
                    </button>
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
                        <PublicEventCard key={event.id} event={event} onOpen={() => setSelectedEvent(event)} onCity={filterByCity} />
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
          <span>Ticket<span className="brand-flow">Flow</span><span className="brand-period">.</span></span>
          <span>Made for the moments that matter.</span>
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
                  <input id="auth-password" name="password" type="password" autoComplete={authMode === "login" ? "current-password" : "new-password"} minLength={5} required placeholder={authMode === "login" ? "Enter your password" : "At least 5 characters"} />
                  {authMode === "register" && <p className="auth-customer-note">New accounts are for customers. Organizer access is provided by the site owner.</p>}
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
          onChooseSeats={() => {
            setBookingEvent(selectedEvent);
            setSelectedEvent(null);
          }}
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
