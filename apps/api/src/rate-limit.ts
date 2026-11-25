import type { RequestHandler } from 'express';

type Window = { count: number; resetsAt: number };

/** Small per-process limiter for public auth endpoints. Use a shared store when scaling API replicas. */
export function createRateLimiter(options: { limit: number; windowMs: number; now?: () => number }): RequestHandler {
  const windows = new Map<string, Window>();
  const now = options.now ?? Date.now;
  return (request, response, next) => {
    const time = now();
    const key = `${request.ip}:${request.baseUrl}${request.path}`;
    let entry = windows.get(key);
    if (!entry || entry.resetsAt <= time) {
      entry = { count: 0, resetsAt: time + options.windowMs };
      windows.set(key, entry);
    }
    entry.count += 1;
    response.setHeader('RateLimit-Limit', options.limit);
    response.setHeader('RateLimit-Remaining', Math.max(0, options.limit - entry.count));
    response.setHeader('RateLimit-Reset', Math.ceil(entry.resetsAt / 1000));
    if (entry.count > options.limit) {
      response.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many requests. Try again shortly.' } });
      return;
    }
    if (windows.size > 10_000) {
      for (const [windowKey, window] of windows) if (window.resetsAt <= time) windows.delete(windowKey);
    }
    next();
  };
}
