import { z } from 'zod';

const uuid = z.string().uuid();
const categorySchema = z.object({ name: z.string().trim().min(1).max(80), basePriceCents: z.number().int().nonnegative() }).strict();
export const eventCategorySchema = z.object({
  name: z.string().trim().min(1).max(80),
  imageUrl: z.union([
    z.string().trim().url().max(2048).refine((value) => ['http:', 'https:'].includes(new URL(value).protocol), 'Image URL must use HTTP or HTTPS'),
    z.string().regex(/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/).max(2_800_000),
  ]),
}).strict();

export const venueSchema = z.object({
  name: z.string().trim().min(1).max(120),
  city: z.string().trim().min(1).max(80),
  address: z.string().trim().min(1).max(240),
}).strict();

export const createEventSchema = z.object({
  venueId: uuid,
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(5000).default(''),
  posterUrl: z.union([
    z.string().trim().url().max(2048).refine((value) => ['http:', 'https:'].includes(new URL(value).protocol), 'Poster URL must use HTTP or HTTPS'),
    z.string().regex(/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/).max(2_800_000),
    z.literal(''),
  ]).default(''),
  highlights: z.string().trim().max(3000).default(''),
  category: z.string().trim().min(1).max(80).default('Other'),
  startsAt: z.string().datetime({ offset: true }).refine((value) => new Date(value).getTime() > Date.now(), 'Event must be in the future'),
  endsAt: z.string().datetime({ offset: true }).optional(),
  pricingStrategy: z.enum(['base', 'early_bird']).default('base'),
  status: z.enum(['draft', 'published']).default('draft'),
  seatMap: z.object({
    rows: z.array(z.object({ label: z.string().trim().min(1).max(10), category: z.string().trim().min(1).max(80) }).strict()).min(1).max(100),
    seatsPerRow: z.number().int().min(1).max(100),
  }).strict(),
  categories: z.array(categorySchema).min(1).max(20),
}).strict().superRefine((input, context) => {
  const names = input.categories.map((category) => category.name.toLowerCase());
  if (new Set(names).size !== names.length) context.addIssue({ code: 'custom', path: ['categories'], message: 'Category names must be unique' });
  const categoryNames = new Set(names);
  input.seatMap.rows.forEach((row, index) => {
    if (!categoryNames.has(row.category.toLowerCase())) context.addIssue({ code: 'custom', path: ['seatMap', 'rows', index, 'category'], message: 'Category must be defined' });
  });
  const labels = input.seatMap.rows.map((row) => row.label.toLowerCase());
  if (new Set(labels).size !== labels.length) context.addIssue({ code: 'custom', path: ['seatMap', 'rows'], message: 'Row labels must be unique' });
  if (input.endsAt && new Date(input.endsAt) <= new Date(input.startsAt)) context.addIssue({ code: 'custom', path: ['endsAt'], message: 'End time must be after the start time' });
});

export const eventStatusSchema = z.object({ status: z.enum(['published', 'cancelled']) }).strict();
export const updateEventSchema = createEventSchema;

export const eventSearchSchema = z.object({
  q: z.string().trim().max(120).optional(),
  city: z.string().trim().max(80).optional(),
  date: z.string().date().optional(),
  past: z.enum(['true', 'false']).transform((value) => value === 'true').default(false),
  status: z.enum(['all', 'live', 'upcoming', 'ended']).optional(),
  category: z.string().trim().max(80).optional(),
  sort: z.enum(['soonest', 'latest', 'ending', 'name_asc', 'name_desc']).default('soonest'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(9),
}).strict();
