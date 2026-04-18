import { z } from 'zod';

export const exchangeSchema = z.object({
  supabase_token: z.string().optional(),
});

export const refreshSchema = z.object({
  refresh_token: z.string(),
});

export const logoutSchema = refreshSchema;
