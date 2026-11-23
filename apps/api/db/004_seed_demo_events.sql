-- Seed demo events so "On sale now" has content on a fresh install.
-- This runs only once (migration guard prevents re-runs).
-- Organizer is inserted first; if the email already exists the INSERT is a no-op.

DO $$
DECLARE
  org_id    uuid;
  venue1_id uuid;
  venue2_id uuid;
  venue3_id uuid;
  venue4_id uuid;
  venue5_id uuid;
  ev1_id    uuid;
  ev2_id    uuid;
  ev3_id    uuid;
  ev4_id    uuid;
  ev5_id    uuid;
  ev6_id    uuid;
  cat_id    uuid;
BEGIN

  -- ── Organizer: use existing account created by ensureOrganizer() ──
  -- The API creates the real organizer (with correct bcrypt hash) on startup.
  -- If no organizer exists yet, skip the seed — it will re-run on next migration.
  SELECT id INTO org_id FROM users WHERE role = 'organizer' LIMIT 1;
  IF org_id IS NULL THEN RETURN; END IF;

  -- ── Venues ───────────────────────────────────────────────────────────────────
  INSERT INTO venues (organizer_id, name, city, address)
  VALUES (org_id, 'International Convention Centre', 'Dhaka',
          'Agargaon, Sher-e-Bangla Nagar, Dhaka 1207')
  ON CONFLICT DO NOTHING
  RETURNING id INTO venue1_id;
  IF venue1_id IS NULL THEN
    SELECT id INTO venue1_id FROM venues WHERE organizer_id = org_id AND name = 'International Convention Centre';
  END IF;

  INSERT INTO venues (organizer_id, name, city, address)
  VALUES (org_id, 'Bashundhara City Arena', 'Dhaka',
          'Ka-244, Pragati Sharani, Dhaka 1229')
  ON CONFLICT DO NOTHING
  RETURNING id INTO venue2_id;
  IF venue2_id IS NULL THEN
    SELECT id INTO venue2_id FROM venues WHERE organizer_id = org_id AND name = 'Bashundhara City Arena';
  END IF;

  INSERT INTO venues (organizer_id, name, city, address)
  VALUES (org_id, 'Chittagong MA Aziz Stadium', 'Chittagong',
          'Station Road, Kotowali, Chittagong 4000')
  ON CONFLICT DO NOTHING
  RETURNING id INTO venue3_id;
  IF venue3_id IS NULL THEN
    SELECT id INTO venue3_id FROM venues WHERE organizer_id = org_id AND name = 'Chittagong MA Aziz Stadium';
  END IF;

  INSERT INTO venues (organizer_id, name, city, address)
  VALUES (org_id, 'Sylhet International Cricket Stadium', 'Sylhet',
          'Lama Bazar, Sylhet 3100')
  ON CONFLICT DO NOTHING
  RETURNING id INTO venue4_id;
  IF venue4_id IS NULL THEN
    SELECT id INTO venue4_id FROM venues WHERE organizer_id = org_id AND name = 'Sylhet International Cricket Stadium';
  END IF;

  INSERT INTO venues (organizer_id, name, city, address)
  VALUES (org_id, 'Khulna Shilpakala Academy', 'Khulna',
          'KDA Avenue, Khulna 9100')
  ON CONFLICT DO NOTHING
  RETURNING id INTO venue5_id;
  IF venue5_id IS NULL THEN
    SELECT id INTO venue5_id FROM venues WHERE organizer_id = org_id AND name = 'Khulna Shilpakala Academy';
  END IF;

  -- ── Events ───────────────────────────────────────────────────────────────────

  -- Event 1: Live Concert
  INSERT INTO events (organizer_id, venue_id, name, description, poster_url, highlights,
                      category, pricing_strategy, status, starts_at, ends_at)
  VALUES (org_id, venue1_id,
          'Dhaka Music Fest 2026',
          'The biggest music festival in Bangladesh returns with top artists from across South Asia. Three stages, twelve hours of non-stop live music spanning Bangla rock, indie, and electronic genres.',
          'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=1200&q=80',
          'Live performances by 20+ artists' || E'\n' || 'Three dedicated stages' || E'\n' || 'Food court and merchandise stalls' || E'\n' || 'VIP meet-and-greet packages',
          'Concert', 'base', 'published',
          now() + INTERVAL '5 days',
          now() + INTERVAL '5 days' + INTERVAL '8 hours')
  ON CONFLICT DO NOTHING
  RETURNING id INTO ev1_id;

  IF ev1_id IS NOT NULL THEN
    INSERT INTO seat_categories (event_id, name, base_price_cents)
    VALUES (ev1_id, 'General',  120000),
           (ev1_id, 'Premium',  350000),
           (ev1_id, 'VIP',      750000);

    -- General seats: rows A-C, 10 seats each
    FOR r IN 0..2 LOOP
      FOR s IN 1..10 LOOP
        SELECT id INTO cat_id FROM seat_categories WHERE event_id = ev1_id AND name = 'General';
        INSERT INTO event_seats (event_id, category_id, row_label, seat_number)
        VALUES (ev1_id, cat_id, chr(65+r), s) ON CONFLICT DO NOTHING;
      END LOOP;
    END LOOP;
    -- Premium: rows D-E, 8 seats each
    FOR r IN 3..4 LOOP
      FOR s IN 1..8 LOOP
        SELECT id INTO cat_id FROM seat_categories WHERE event_id = ev1_id AND name = 'Premium';
        INSERT INTO event_seats (event_id, category_id, row_label, seat_number)
        VALUES (ev1_id, cat_id, chr(65+r), s) ON CONFLICT DO NOTHING;
      END LOOP;
    END LOOP;
    -- VIP: row F, 5 seats
    SELECT id INTO cat_id FROM seat_categories WHERE event_id = ev1_id AND name = 'VIP';
    FOR s IN 1..5 LOOP
      INSERT INTO event_seats (event_id, category_id, row_label, seat_number)
      VALUES (ev1_id, cat_id, 'F', s) ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  -- Event 2: Upcoming Sports
  INSERT INTO events (organizer_id, venue_id, name, description, poster_url, highlights,
                      category, pricing_strategy, status, starts_at, ends_at)
  VALUES (org_id, venue3_id,
          'Bangladesh Premier League T20 Final',
          'Watch the most thrilling cricket final of the year live at Chittagong. Two powerhouse teams battle it out in what promises to be an unforgettable evening under the floodlights.',
          'https://images.unsplash.com/photo-1540747913346-19212a4cf528?w=1200&q=80',
          'T20 final match — BPL 2026' || E'\n' || 'Floodlit evening game' || E'\n' || 'Live scoreboard and commentary' || E'\n' || 'Children under 10 free with adult',
          'Sports', 'early_bird', 'published',
          now() + INTERVAL '12 days',
          now() + INTERVAL '12 days' + INTERVAL '5 hours')
  ON CONFLICT DO NOTHING
  RETURNING id INTO ev2_id;

  IF ev2_id IS NOT NULL THEN
    INSERT INTO seat_categories (event_id, name, base_price_cents)
    VALUES (ev2_id, 'East Stand',   80000),
           (ev2_id, 'West Stand',   80000),
           (ev2_id, 'VIP Pavilion', 250000);

    FOR r IN 0..3 LOOP
      FOR s IN 1..12 LOOP
        SELECT id INTO cat_id FROM seat_categories WHERE event_id = ev2_id AND name = 'East Stand';
        INSERT INTO event_seats (event_id, category_id, row_label, seat_number)
        VALUES (ev2_id, cat_id, chr(65+r), s) ON CONFLICT DO NOTHING;
      END LOOP;
    END LOOP;
    FOR r IN 4..7 LOOP
      FOR s IN 1..12 LOOP
        SELECT id INTO cat_id FROM seat_categories WHERE event_id = ev2_id AND name = 'West Stand';
        INSERT INTO event_seats (event_id, category_id, row_label, seat_number)
        VALUES (ev2_id, cat_id, chr(65+r), s) ON CONFLICT DO NOTHING;
      END LOOP;
    END LOOP;
    SELECT id INTO cat_id FROM seat_categories WHERE event_id = ev2_id AND name = 'VIP Pavilion';
    FOR s IN 1..8 LOOP
      INSERT INTO event_seats (event_id, category_id, row_label, seat_number)
      VALUES (ev2_id, cat_id, 'P', s) ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  -- Event 3: Stand-up Comedy
  INSERT INTO events (organizer_id, venue_id, name, description, poster_url, highlights,
                      category, pricing_strategy, status, starts_at, ends_at)
  VALUES (org_id, venue2_id,
          'Hasan Minhaj: Live in Dhaka',
          'The internationally acclaimed comedian brings his brand new stand-up special to Dhaka for the very first time. An evening of sharp wit, cultural commentary, and non-stop laughter.',
          'https://images.unsplash.com/photo-1527224538127-2104bb71c51b?w=1200&q=80',
          'Internationally acclaimed comedian' || E'\n' || 'Brand new material for 2026' || E'\n' || 'Two-hour show plus Q&A' || E'\n' || 'Age 16+ recommended',
          'Stand-up', 'base', 'published',
          now() + INTERVAL '8 days',
          now() + INTERVAL '8 days' + INTERVAL '2 hours' + INTERVAL '30 minutes')
  ON CONFLICT DO NOTHING
  RETURNING id INTO ev3_id;

  IF ev3_id IS NOT NULL THEN
    INSERT INTO seat_categories (event_id, name, base_price_cents)
    VALUES (ev3_id, 'Standard', 180000),
           (ev3_id, 'Front Row', 450000);

    FOR r IN 0..4 LOOP
      FOR s IN 1..10 LOOP
        SELECT id INTO cat_id FROM seat_categories WHERE event_id = ev3_id AND name = 'Standard';
        INSERT INTO event_seats (event_id, category_id, row_label, seat_number)
        VALUES (ev3_id, cat_id, chr(65+r), s) ON CONFLICT DO NOTHING;
      END LOOP;
    END LOOP;
    FOR s IN 1..8 LOOP
      SELECT id INTO cat_id FROM seat_categories WHERE event_id = ev3_id AND name = 'Front Row';
      INSERT INTO event_seats (event_id, category_id, row_label, seat_number)
      VALUES (ev3_id, cat_id, 'F', s) ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  -- Event 4: Tech Conference
  INSERT INTO events (organizer_id, venue_id, name, description, poster_url, highlights,
                      category, pricing_strategy, status, starts_at, ends_at)
  VALUES (org_id, venue1_id,
          'Bangladesh Tech Summit 2026',
          'Two days of keynotes, workshops, and networking with 500+ engineers, founders, and investors. Topics include AI, fintech, climate tech, and the future of software in South Asia.',
          'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=1200&q=80',
          'Keynotes from global tech leaders' || E'\n' || '20+ workshops and breakout sessions' || E'\n' || 'Startup pitch competition (prize ৳10 lakh)' || E'\n' || 'Networking dinner included',
          'Conference', 'early_bird', 'published',
          now() + INTERVAL '20 days',
          now() + INTERVAL '20 days' + INTERVAL '9 hours')
  ON CONFLICT DO NOTHING
  RETURNING id INTO ev4_id;

  IF ev4_id IS NOT NULL THEN
    INSERT INTO seat_categories (event_id, name, base_price_cents)
    VALUES (ev4_id, 'Standard Pass', 300000),
           (ev4_id, 'Pro Pass',      600000),
           (ev4_id, 'All-Access',    120000);

    FOR r IN 0..5 LOOP
      FOR s IN 1..8 LOOP
        SELECT id INTO cat_id FROM seat_categories WHERE event_id = ev4_id AND name = 'Standard Pass';
        INSERT INTO event_seats (event_id, category_id, row_label, seat_number)
        VALUES (ev4_id, cat_id, chr(65+r), s) ON CONFLICT DO NOTHING;
      END LOOP;
    END LOOP;
    FOR r IN 6..7 LOOP
      FOR s IN 1..8 LOOP
        SELECT id INTO cat_id FROM seat_categories WHERE event_id = ev4_id AND name = 'Pro Pass';
        INSERT INTO event_seats (event_id, category_id, row_label, seat_number)
        VALUES (ev4_id, cat_id, chr(65+r), s) ON CONFLICT DO NOTHING;
      END LOOP;
    END LOOP;
    SELECT id INTO cat_id FROM seat_categories WHERE event_id = ev4_id AND name = 'All-Access';
    FOR s IN 1..6 LOOP
      INSERT INTO event_seats (event_id, category_id, row_label, seat_number)
      VALUES (ev4_id, cat_id, 'V', s) ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  -- Event 5: Festival
  INSERT INTO events (organizer_id, venue_id, name, description, poster_url, highlights,
                      category, pricing_strategy, status, starts_at, ends_at)
  VALUES (org_id, venue4_id,
          'Sylhet Cultural Festival 2026',
          'Celebrate the rich heritage of Sylhet with three days of traditional dance, folk music, art exhibitions, and culinary experiences. A celebration of everything that makes the region unique.',
          'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=1200&q=80',
          'Traditional Sylheti dance performances' || E'\n' || 'Folk music by renowned artists' || E'\n' || 'Art and craft market' || E'\n' || 'Street food from 30+ vendors',
          'Festival', 'base', 'published',
          now() + INTERVAL '3 days',
          now() + INTERVAL '3 days' + INTERVAL '10 hours')
  ON CONFLICT DO NOTHING
  RETURNING id INTO ev5_id;

  IF ev5_id IS NOT NULL THEN
    INSERT INTO seat_categories (event_id, name, base_price_cents)
    VALUES (ev5_id, 'General',    50000),
           (ev5_id, 'Reserved',  150000);

    FOR r IN 0..5 LOOP
      FOR s IN 1..15 LOOP
        SELECT id INTO cat_id FROM seat_categories WHERE event_id = ev5_id AND name = 'General';
        INSERT INTO event_seats (event_id, category_id, row_label, seat_number)
        VALUES (ev5_id, cat_id, chr(65+r), s) ON CONFLICT DO NOTHING;
      END LOOP;
    END LOOP;
    FOR r IN 6..7 LOOP
      FOR s IN 1..10 LOOP
        SELECT id INTO cat_id FROM seat_categories WHERE event_id = ev5_id AND name = 'Reserved';
        INSERT INTO event_seats (event_id, category_id, row_label, seat_number)
        VALUES (ev5_id, cat_id, chr(65+r), s) ON CONFLICT DO NOTHING;
      END LOOP;
    END LOOP;
  END IF;

  -- Event 6: Workshop
  INSERT INTO events (organizer_id, venue_id, name, description, poster_url, highlights,
                      category, pricing_strategy, status, starts_at, ends_at)
  VALUES (org_id, venue5_id,
          'Digital Photography Masterclass',
          'A hands-on full-day workshop led by award-winning photographer Rafiq Islam. Learn composition, lighting, post-processing, and how to build a professional portfolio from scratch.',
          'https://images.unsplash.com/photo-1542038784456-1ea8e935640e?w=1200&q=80',
          'Taught by award-winning photographer Rafiq Islam' || E'\n' || 'Hands-on shooting sessions' || E'\n' || 'Lightroom & Photoshop editing workflow' || E'\n' || 'Portfolio review and critique',
          'Workshop', 'base', 'published',
          now() + INTERVAL '15 days',
          now() + INTERVAL '15 days' + INTERVAL '7 hours')
  ON CONFLICT DO NOTHING
  RETURNING id INTO ev6_id;

  IF ev6_id IS NOT NULL THEN
    INSERT INTO seat_categories (event_id, name, base_price_cents)
    VALUES (ev6_id, 'Participant', 250000);

    SELECT id INTO cat_id FROM seat_categories WHERE event_id = ev6_id AND name = 'Participant';
    FOR r IN 0..1 LOOP
      FOR s IN 1..12 LOOP
        INSERT INTO event_seats (event_id, category_id, row_label, seat_number)
        VALUES (ev6_id, cat_id, chr(65+r), s) ON CONFLICT DO NOTHING;
      END LOOP;
    END LOOP;
  END IF;

END $$;
