import { z } from 'zod';

export const balanceGroupParamsSchema = z.object({
  groupId: z.string().uuid(),
});
