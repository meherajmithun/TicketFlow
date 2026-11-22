import { z } from 'zod';

export const holdSeatsSchema = z.object({
  eventId: z.string().uuid(),
  seatIds: z.array(z.string().uuid()).min(1).max(20),
}).strict();
