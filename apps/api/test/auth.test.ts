import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { createApp } from '../src/app.js';
import { AuthService, type User, type UserRepository } from '../src/auth/service.js';
import { hashPassword, verifyPassword } from '../src/auth/password.js';
import { signToken, verifyToken } from '../src/auth/token.js';
import { requireAuth } from '../src/auth/http.js';
import type { AppConfig } from '../src/config.js';

const secret = 'test-secret-of-at-least-thirty-two-characters';
const customerId = 'e6ae9c7b-e184-4c52-b8be-a33de85bccd1';

class MemoryUsers implements UserRepository {
  private readonly users = new Map<string, User>();

  async create(input: Pick<User, 'email' | 'passwordHash' | 'role'>) {
    if (this.users.has(input.email)) return null;
    const user = { id: customerId, ...input };
    this.users.set(input.email, user);
    return user;
  }

  async findByEmail(email: string) {
    return this.users.get(email) ?? null;
  }
}

const config: AppConfig = {
  port: 4000,
  clientOrigin: 'http://localhost:5173',
  nodeEnv: 'test',
  databaseUrl: 'postgresql://localhost/ticketflow',
  authTokenSecret: secret,
};

test('passwords use a random salt and incorrect passwords fail', async () => {
  const first = await hashPassword('a sufficiently long password');
  const second = await hashPassword('a sufficiently long password');
  assert.notEqual(first, second);
  assert.equal(await verifyPassword('a sufficiently long password', first), true);
  assert.equal(await verifyPassword('incorrect', first), false);
  assert.equal(await verifyPassword('anything', 'malformed'), false);
});

test('tokens reject tampering and expiration', () => {
  const now = Date.parse('2026-11-20T00:00:00Z');
  const token = signToken({ sub: customerId, role: 'customer' }, secret, now);
  assert.equal(verifyToken(token, secret, now)?.sub, customerId);
  assert.equal(verifyToken(token, secret, now + 12 * 60 * 60 * 1000), null);
  assert.equal(verifyToken(`${token}x`, secret, now), null);
});

test('registration, login, validation, duplicate emails, and protected profile', async () => {
  const server = createServer(createApp(config, new AuthService(new MemoryUsers(), secret)));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected TCP address');
  const base = `http://127.0.0.1:${address.port}`;
  const post = (path: string, body: unknown) => fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  try {
    const invalid = await post('/auth/register', { email: 'bad', password: 'abcd', role: 'customer' });
    assert.equal(invalid.status, 400);

    const organizerRegistration = await post('/auth/register', { email: 'organizer@example.com', password: 'long-enough-password', role: 'organizer' });
    assert.equal(organizerRegistration.status, 400);

    const shortPassword = await post('/auth/register', { email: 'short@example.com', password: 'abcde' });
    assert.equal(shortPassword.status, 400);

    const input = { email: ' Person@Example.com ', password: 'a strong password', role: 'customer' };
    const registered = await post('/auth/register', input);
    assert.equal(registered.status, 201);
    const session = await registered.json() as { token: string; user: { id: string; email: string; role: string; passwordHash?: string } };
    assert.equal(session.user.email, 'person@example.com');
    assert.equal(session.user.passwordHash, undefined);
    assert.equal((await post('/auth/register', input)).status, 409);
    assert.equal((await post('/auth/login', { email: input.email, password: 'wrong' })).status, 401);
    assert.equal((await post('/auth/login', { email: input.email, password: input.password })).status, 200);

    assert.equal((await fetch(`${base}/auth/me`)).status, 401);
    const profile = await fetch(`${base}/auth/me`, { headers: { authorization: `Bearer ${session.token}` } });
    assert.equal(profile.status, 200);
    assert.deepEqual(await profile.json(), { user: { id: customerId, role: 'customer' } });
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('role middleware denies a customer token before calling the next handler', () => {
  const middleware = requireAuth(secret, 'organizer');
  let status = 0;
  let nextCalled = false;
  const response = {
    locals: {},
    status(code: number) { status = code; return this; },
    json() { return this; },
  };
  middleware(
    { get: () => `Bearer ${signToken({ sub: customerId, role: 'customer' }, secret)}` } as never,
    response as never,
    () => { nextCalled = true; },
  );
  assert.equal(status, 403);
  assert.equal(nextCalled, false);
});
