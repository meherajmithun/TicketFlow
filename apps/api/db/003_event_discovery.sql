ALTER TABLE events ADD COLUMN category TEXT NOT NULL DEFAULT 'Other';
ALTER TABLE events ADD COLUMN ends_at TIMESTAMPTZ;
UPDATE events SET ends_at = starts_at + INTERVAL '3 hours' WHERE ends_at IS NULL;
ALTER TABLE events ALTER COLUMN ends_at SET NOT NULL;
ALTER TABLE events ADD CONSTRAINT events_end_after_start CHECK (ends_at > starts_at);
