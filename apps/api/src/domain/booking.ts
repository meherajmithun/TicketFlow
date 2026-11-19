export const bookingStatuses = [
  'held',
  'pending_payment',
  'confirmed',
  'expired',
  'cancelled',
] as const;

export type BookingStatus = (typeof bookingStatuses)[number];

const allowedTransitions: Record<BookingStatus, readonly BookingStatus[]> = {
  held: ['pending_payment', 'expired', 'cancelled'],
  pending_payment: ['confirmed', 'expired', 'cancelled'],
  confirmed: ['cancelled'],
  expired: [],
  cancelled: [],
};

export class InvalidBookingTransition extends Error {
  constructor(from: BookingStatus, to: BookingStatus) {
    super(`Cannot transition booking from ${from} to ${to}`);
    this.name = 'InvalidBookingTransition';
  }
}

export function transitionBooking(from: BookingStatus, to: BookingStatus): BookingStatus {
  if (!allowedTransitions[from].includes(to)) {
    throw new InvalidBookingTransition(from, to);
  }
  return to;
}
