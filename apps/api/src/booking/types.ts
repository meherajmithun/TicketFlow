export type HeldBooking = {
  id: string;
  eventId: string;
  customerId: string;
  status: 'held';
  totalCents: number;
  expiresAt: string;
  seats: Array<{ id: string; rowLabel: string; seatNumber: number; priceCents: number }>;
};

export type CustomerBooking = HeldBooking & { eventName: string; startsAt: string };
export type Cancellation = { bookingId: string; status: 'cancelled'; refundCents: number; cancelledAt: string };
