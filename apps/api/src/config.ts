import 'dotenv/config';
import { z } from 'zod';

const environment = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  CLIENT_ORIGIN: z.string().url().default('http://localhost:5173'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

export type AppConfig = {
  port: number;
  clientOrigin: string;
  nodeEnv: 'development' | 'test' | 'production';
};

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = environment.parse(source);
  return {
    port: parsed.PORT,
    clientOrigin: parsed.CLIENT_ORIGIN,
    nodeEnv: parsed.NODE_ENV,
  };
}
