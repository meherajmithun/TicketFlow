import { BookingError, PgBookingRepository } from './repository.js';

export { BookingError };

export class BookingService {
  constructor(private readonly bookings: PgBookingRepository) {}
  holdSeats(customerId: string, eventId: string, seatIds: string[]) { return this.bookings.holdSeats(customerId, eventId, seatIds); }
  listCustomerBookings(customerId: string) { return this.bookings.listCustomerBookings(customerId); }
  cancelBooking(customerId: string, bookingId: string) { return this.bookings.cancelBooking(customerId, bookingId); }
}
