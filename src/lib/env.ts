import { config } from 'dotenv';
import { z } from 'zod';

config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  CORS_ORIGIN: z.string().default('*'),
  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),
  JWT_ISSUER: z.string().default('easysplit-backend'),
  SUPABASE_URL: z.string().url(),
  SUPABASE_JWKS_URL: z.string().optional().default(''),
  SUPABASE_STORAGE_BUCKET: z.string().default('receipts'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional().default(''),
  FREE_ACTIVE_GROUP_LIMIT: z.coerce.number().int().positive().default(3),
  RECEIPT_UPLOAD_FREE_QUOTA: z.coerce.number().int().nonnegative().default(0),
  REVENUECAT_WEBHOOK_AUTH: z.string().optional().default(''),
});

export const env = envSchema.parse(process.env);
