import { config as loadDotEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

// npm workspaces run API scripts with apps/api as the working directory.
// Resolve the shared environment file from this module so dev and migrations agree.
loadDotEnv({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) });

const environment = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  CLIENT_ORIGIN: z.string().url().default('http://localhost:5173'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().url(),
  AUTH_TOKEN_SECRET: z.string().min(32),
  ORGANIZER_EMAIL: z.email().optional(),
  ORGANIZER_PASSWORD: z.string().min(12).optional(),
}).refine((value) => Boolean(value.ORGANIZER_EMAIL) === Boolean(value.ORGANIZER_PASSWORD), {
  message: 'Set ORGANIZER_EMAIL and ORGANIZER_PASSWORD together',
});

export type AppConfig = {
  port: number;
  clientOrigin: string;
  nodeEnv: 'development' | 'test' | 'production';
  databaseUrl: string;
  authTokenSecret: string;
  organizerEmail?: string;
  organizerPassword?: string;
};

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = environment.parse(source);
  return {
    port: parsed.PORT,
    clientOrigin: parsed.CLIENT_ORIGIN,
    nodeEnv: parsed.NODE_ENV,
    databaseUrl: parsed.DATABASE_URL,
    authTokenSecret: parsed.AUTH_TOKEN_SECRET,
    organizerEmail: parsed.ORGANIZER_EMAIL,
    organizerPassword: parsed.ORGANIZER_PASSWORD,
  };
}
