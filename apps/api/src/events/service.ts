import type { CreateEventInput, CreateVenueInput, EventRepository, UpdateEventInput } from './repository.js';
import type { EventSearch } from './types.js';

export class EventError extends Error {
  constructor(public readonly code: 'VENUE_NOT_FOUND' | 'EVENT_NOT_FOUND' | 'NOT_OWNER' | 'EVENT_HAS_BOOKINGS') {
    super(code === 'EVENT_NOT_FOUND' ? 'Event not found' : code === 'EVENT_HAS_BOOKINGS' ? 'This event cannot change its seat layout after bookings exist' : code === 'VENUE_NOT_FOUND' ? 'Venue not found or not owned by this organizer' : 'You do not own this event');
  }
}

export class EventService {
  constructor(private readonly events: EventRepository) {}

  createVenue(organizerId: string, input: CreateVenueInput) {
    return this.events.createVenue(organizerId, input);
  }

  listVenues(organizerId: string) {
    return this.events.listVenues(organizerId);
  }

  async createEvent(input: CreateEventInput) {
    try {
      return await this.events.createEvent(input);
    } catch (error) {
      if (error instanceof Error && error.message === 'VENUE_NOT_FOUND_OR_NOT_OWNED') throw new EventError('VENUE_NOT_FOUND');
      throw error;
    }
  }

  listOrganizerEvents(organizerId: string) {
    return this.events.listOrganizerEvents(organizerId);
  }

  async updateEvent(input: UpdateEventInput) {
    try { const event = await this.events.updateEvent(input); if (!event) throw new EventError('EVENT_NOT_FOUND'); return event; }
    catch (error) { if (error instanceof Error && error.message === 'EVENT_HAS_BOOKINGS') throw new EventError('EVENT_HAS_BOOKINGS'); if (error instanceof Error && error.message === 'VENUE_NOT_FOUND_OR_NOT_OWNED') throw new EventError('VENUE_NOT_FOUND'); throw error; }
  }

  async getOrganizerEvent(organizerId: string, eventId: string) {
    const event = await this.events.findOrganizerEvent(organizerId, eventId);
    if (!event) throw new EventError('EVENT_NOT_FOUND');
    return event;
  }

  async updateEventStatus(organizerId: string, eventId: string, status: 'published' | 'cancelled') {
    const event = await this.events.updateEventStatus(organizerId, eventId, status);
    if (!event) throw new EventError('EVENT_NOT_FOUND');
    return event;
  }

  listPublishedEvents(search: EventSearch) {
    return this.events.listPublishedEvents(search);
  }

  async getPublishedEvent(eventId: string) {
    const event = await this.events.findPublishedEvent(eventId);
    if (!event) throw new EventError('EVENT_NOT_FOUND');
    return event;
  }
}
