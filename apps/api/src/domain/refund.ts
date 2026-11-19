const FULL_REFUND_WINDOW_MS = 24 * 60 * 60 * 1000;

export function refundAmountCents(
  paidAmountCents: number,
  eventStartsAt: Date,
  cancelledAt: Date,
): number {
  if (!Number.isSafeInteger(paidAmountCents) || paidAmountCents < 0) {
    throw new RangeError('Paid amount must be a non-negative integer in cents');
  }
  return eventStartsAt.getTime() - cancelledAt.getTime() > FULL_REFUND_WINDOW_MS
    ? paidAmountCents
    : 0;
}
