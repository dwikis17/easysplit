import { z } from 'zod';

export const activityGroupParamsSchema = z.object({
  groupId: z.string().uuid(),
});
