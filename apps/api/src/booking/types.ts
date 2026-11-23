export type HeldBooking = {
  id: string;
  eventId: string;
  customerId: string;
  status: 'held';
  totalCents: number;
  expiresAt: string;
  seats: Array<{ id: string; rowLabel: string; seatNumber: number; priceCents: number }>;
};

export type CustomerBooking = Omit<HeldBooking, 'status'> & { status: 'held' | 'pending_payment' | 'confirmed' | 'expired' | 'cancelled'; eventName: string; startsAt: string };
export type Cancellation = { bookingId: string; status: 'cancelled'; refundCents: number; cancelledAt: string };
export type BookingTransition = { bookingId: string; status: 'pending_payment' };
export type StatusHistoryEntry = { fromStatus: string | null; toStatus: string; changedAt: string };
