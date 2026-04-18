import { z } from 'zod';

export const updateMeSchema = z.object({
  display_name: z.string().trim().min(1).max(120).optional(),
  preferred_currency: z.string().trim().length(3).optional(),
  timezone: z.string().trim().min(1).max(120).optional(),
});
