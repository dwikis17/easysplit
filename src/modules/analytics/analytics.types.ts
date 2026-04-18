import { z } from 'zod';

export const analyticsGroupParamsSchema = z.object({
  groupId: z.string().uuid(),
});

export const analyticsRangeSchema = z.object({
  from_date: z.string().date().optional(),
  to_date: z.string().date().optional(),
});

export const timelineQuerySchema = analyticsRangeSchema.extend({
  granularity: z.enum(['day', 'week', 'month']).default('day'),
});
