import { z } from 'zod';

export const refreshEntitlementSchema = z.object({
  force: z.boolean().optional(),
});
