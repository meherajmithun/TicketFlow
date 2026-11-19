export const HOLD_DURATION_MS = 5 * 60 * 1000;

export function holdExpiry(createdAt: Date): Date {
  return new Date(createdAt.getTime() + HOLD_DURATION_MS);
}

export function isHoldExpired(expiresAt: Date, now: Date): boolean {
  return now.getTime() >= expiresAt.getTime();
}
