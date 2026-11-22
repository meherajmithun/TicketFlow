import { BookingError, PgBookingRepository } from './repository.js';

export { BookingError };

export class BookingService {
  constructor(private readonly bookings: PgBookingRepository) {}
  holdSeats(customerId: string, eventId: string, seatIds: string[]) { return this.bookings.holdSeats(customerId, eventId, seatIds); }
  listCustomerBookings(customerId: string) { return this.bookings.listCustomerBookings(customerId); }
  cancelBooking(customerId: string, bookingId: string) { return this.bookings.cancelBooking(customerId, bookingId); }
  transitionBooking(customerId: string, bookingId: string, status: 'pending_payment') { return this.bookings.transitionBooking(customerId, bookingId, status); }
  statusHistory(customerId: string, bookingId: string) { return this.bookings.statusHistory(customerId, bookingId); }
  expireHolds() { return this.bookings.expireHolds(); }
}
