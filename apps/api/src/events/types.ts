export type EventStatus = 'draft' | 'published' | 'cancelled';
export type PricingStrategy = 'base' | 'early_bird';

export type Venue = {
  id: string;
  organizerId: string;
  name: string;
  city: string;
  address: string;
};

export type SeatCategory = {
  id: string;
  name: string;
  basePriceCents: number;
};

export type EventSeat = {
  id: string;
  rowLabel: string;
  seatNumber: number;
  categoryId: string;
  categoryName: string;
  basePriceCents: number;
  available: boolean;
  status: 'available' | 'held' | 'booked';
};

export type Event = {
  id: string;
  organizerId: string;
  venue: Venue;
  name: string;
  description: string;
  startsAt: string;
  pricingStrategy: PricingStrategy;
  status: EventStatus;
  categories: SeatCategory[];
  seats: EventSeat[];
};

export type EventSearch = { query?: string; city?: string; date?: string; past?: boolean; page: number; pageSize: number };
export type EventPage = { events: Event[]; total: number; page: number; pageSize: number; totalPages: number };

export type CreateVenueInput = Omit<Venue, 'id' | 'organizerId'>;
export type UpdateVenueInput = CreateVenueInput & { venueId: string; organizerId: string };
export type CreateEventInput = {
  organizerId: string;
  venueId: string;
  name: string;
  description: string;
  startsAt: string;
  pricingStrategy: PricingStrategy;
  status: EventStatus;
  rows: Array<{ label: string; category: string }>;
  seatsPerRow: number;
  categories: Array<{ name: string; basePriceCents: number }>;
};
export type UpdateEventInput = CreateEventInput & { eventId: string };
