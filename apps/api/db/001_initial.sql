-- Run against PostgreSQL 16 or newer. All monetary amounts are integer cents.

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role text NOT NULL CHECK (role IN ('organizer', 'customer')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE venues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id uuid NOT NULL REFERENCES users(id),
  name text NOT NULL,
  city text NOT NULL,
  address text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id uuid NOT NULL REFERENCES users(id),
  venue_id uuid NOT NULL REFERENCES venues(id),
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  starts_at timestamptz NOT NULL,
  pricing_strategy text NOT NULL CHECK (pricing_strategy IN ('base', 'early_bird')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX events_browse_idx ON events (status, starts_at);
CREATE INDEX events_organizer_idx ON events (organizer_id);

CREATE TABLE seat_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name text NOT NULL,
  base_price_cents integer NOT NULL CHECK (base_price_cents >= 0),
  UNIQUE (event_id, name)
);

CREATE TABLE bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id),
  customer_id uuid NOT NULL REFERENCES users(id),
  status text NOT NULL CHECK (status IN ('held', 'pending_payment', 'confirmed', 'expired', 'cancelled')),
  total_cents integer NOT NULL CHECK (total_cents >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX bookings_customer_idx ON bookings (customer_id, created_at DESC);

-- This row is the single source of truth for the seat's current owner.
-- Claim seats in a transaction with a conditional UPDATE and row locks.
CREATE TABLE event_seats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES seat_categories(id),
  row_label text NOT NULL,
  seat_number integer NOT NULL CHECK (seat_number > 0),
  current_booking_id uuid REFERENCES bookings(id),
  hold_expires_at timestamptz,
  confirmed_at timestamptz,
  UNIQUE (event_id, row_label, seat_number),
  CHECK (current_booking_id IS NOT NULL OR (hold_expires_at IS NULL AND confirmed_at IS NULL))
);
CREATE INDEX event_seats_event_idx ON event_seats (event_id);

CREATE TABLE booking_seats (
  booking_id uuid NOT NULL REFERENCES bookings(id),
  event_seat_id uuid NOT NULL REFERENCES event_seats(id),
  price_cents integer NOT NULL CHECK (price_cents >= 0),
  PRIMARY KEY (booking_id, event_seat_id)
);

CREATE TABLE booking_status_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  booking_id uuid NOT NULL REFERENCES bookings(id),
  from_status text,
  to_status text NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX booking_status_history_booking_idx ON booking_status_history (booking_id, changed_at);

CREATE TABLE payment_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES bookings(id),
  provider text NOT NULL,
  idempotency_key text NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'succeeded', 'failed', 'refunded')),
  amount_cents integer NOT NULL CHECK (amount_cents >= 0),
  provider_reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (booking_id, idempotency_key)
);

CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  booking_id uuid NOT NULL REFERENCES bookings(id),
  type text NOT NULL CHECK (type IN ('booking_confirmed', 'booking_cancelled')),
  message text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_idx ON notifications (user_id, created_at DESC);
