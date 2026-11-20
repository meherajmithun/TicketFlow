import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

const claimsSchema = z.object({
  sub: z.string().uuid(),
  role: z.enum(['organizer', 'customer']),
  exp: z.number().int(),
});

export type AuthClaims = z.infer<typeof claimsSchema>;
const HEADER = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
const TOKEN_LIFETIME_SECONDS = 12 * 60 * 60;

function signature(input: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(input).digest();
}

export function signToken(user: Pick<AuthClaims, 'sub' | 'role'>, secret: string, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({
    ...user,
    exp: Math.floor(now / 1000) + TOKEN_LIFETIME_SECONDS,
  })).toString('base64url');
  const input = `${HEADER}.${payload}`;
  return `${input}.${signature(input, secret).toString('base64url')}`;
}

export function verifyToken(token: string, secret: string, now = Date.now()): AuthClaims | null {
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== HEADER || !parts[1] || !parts[2]) return null;
  const input = `${parts[0]}.${parts[1]}`;
  const supplied = Buffer.from(parts[2], 'base64url');
  const expected = signature(input, secret);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;
  try {
    const result = claimsSchema.safeParse(JSON.parse(Buffer.from(parts[1], 'base64url').toString()));
    if (!result.success || result.data.exp <= Math.floor(now / 1000)) return null;
    return result.data;
  } catch {
    return null;
  }
}
