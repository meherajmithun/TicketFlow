ALTER TABLE events
  ADD COLUMN poster_url text NOT NULL DEFAULT '',
  ADD COLUMN highlights text NOT NULL DEFAULT '';
