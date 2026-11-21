import { z } from 'zod';

export const paySchema = z.object({
  provider: z.enum(['stripe', 'paypal']),
  idempotencyKey: z.string().trim().min(8).max(120),
}).strict();
