import type { CreateEventInput, CreateVenueInput, EventRepository } from './repository.js';

export class EventError extends Error {
  constructor(public readonly code: 'VENUE_NOT_FOUND' | 'EVENT_NOT_FOUND' | 'NOT_OWNER') {
    super(code === 'EVENT_NOT_FOUND' ? 'Event not found' : code === 'VENUE_NOT_FOUND' ? 'Venue not found or not owned by this organizer' : 'You do not own this event');
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

  async getOrganizerEvent(organizerId: string, eventId: string) {
    const event = await this.events.findOrganizerEvent(organizerId, eventId);
    if (!event) throw new EventError('EVENT_NOT_FOUND');
    return event;
  }

  listPublishedEvents() {
    return this.events.listPublishedEvents();
  }

  async getPublishedEvent(eventId: string) {
    const event = await this.events.findPublishedEvent(eventId);
    if (!event) throw new EventError('EVENT_NOT_FOUND');
    return event;
  }
}
