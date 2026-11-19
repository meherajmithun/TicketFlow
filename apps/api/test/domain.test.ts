import assert from 'node:assert/strict';
import test from 'node:test';
import { InvalidBookingTransition, transitionBooking } from '../src/domain/booking.js';
import { HOLD_DURATION_MS, holdExpiry, isHoldExpired } from '../src/domain/hold.js';
import { priceSeat } from '../src/domain/pricing.js';
import { refundAmountCents } from '../src/domain/refund.js';

test('booking follows allowed lifecycle transitions', () => {
  assert.equal(transitionBooking('held', 'pending_payment'), 'pending_payment');
  assert.equal(transitionBooking('pending_payment', 'confirmed'), 'confirmed');
  assert.equal(transitionBooking('confirmed', 'cancelled'), 'cancelled');
  assert.throws(() => transitionBooking('expired', 'confirmed'), InvalidBookingTransition);
  assert.throws(() => transitionBooking('confirmed', 'pending_payment'), InvalidBookingTransition);
});

test('hold expires exactly five minutes after creation', () => {
  const createdAt = new Date('2026-11-19T12:00:00Z');
  const expiry = holdExpiry(createdAt);
  assert.equal(expiry.getTime() - createdAt.getTime(), HOLD_DURATION_MS);
  assert.equal(isHoldExpired(expiry, new Date(expiry.getTime() - 1)), false);
  assert.equal(isHoldExpired(expiry, expiry), true);
});

test('base and early-bird pricing return integer cents', () => {
  const now = new Date('2026-11-19T12:00:00Z');
  assert.equal(priceSeat('base', { basePriceCents: 101, eventStartsAt: now, now }), 101);
  assert.equal(priceSeat('early_bird', {
    basePriceCents: 101,
    eventStartsAt: new Date('2026-12-01T12:00:00Z'),
    now,
  }), 91);
  assert.equal(priceSeat('early_bird', {
    basePriceCents: 101,
    eventStartsAt: new Date('2026-11-20T12:00:00Z'),
    now,
  }), 101);
  assert.throws(() => priceSeat('base', { basePriceCents: -1, eventStartsAt: now, now }), RangeError);
});

test('refund is full only more than 24 hours before the event', () => {
  const startsAt = new Date('2026-11-21T12:00:00Z');
  assert.equal(refundAmountCents(2500, startsAt, new Date('2026-11-20T11:59:59Z')), 2500);
  assert.equal(refundAmountCents(2500, startsAt, new Date('2026-11-20T12:00:00Z')), 0);
  assert.equal(refundAmountCents(2500, startsAt, new Date('2026-11-21T12:00:00Z')), 0);
});
