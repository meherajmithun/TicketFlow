CREATE TABLE event_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id uuid REFERENCES users(id),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 80),
  image_url text NOT NULL CHECK (length(image_url) BETWEEN 1 AND 2800000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX event_categories_name_unique ON event_categories (lower(name));

INSERT INTO event_categories (name, image_url) VALUES
  ('Concert', '/images/categories/concert.webp'),
  ('Sports', '/images/categories/sports.webp'),
  ('Stand-up', '/images/categories/stand-up.webp'),
  ('Workshop', '/images/categories/workshop.webp'),
  ('Festival', '/images/categories/festival.webp'),
  ('Conference', '/images/categories/conference.webp'),
  ('Exhibition', '/images/categories/exhibition.webp'),
  ('Competition', '/images/categories/competition.webp'),
  ('Fundraiser', '/images/categories/fundraiser.webp'),
  ('Other', '/images/categories/other.webp');
