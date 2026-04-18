import { z } from 'zod';

const amountSchema = z.object({
  minor: z.number().int().positive(),
  currency: z.string().trim().length(3),
});

export const settlementGroupParamsSchema = z.object({
  groupId: z.string().uuid(),
});

export const settlementParamsSchema = z.object({
  settlementId: z.string().uuid(),
});

export const createSettlementSchema = z.object({
  from_user_id: z.string().uuid(),
  to_user_id: z.string().uuid(),
  amount: amountSchema,
  settlement_date: z.string().date(),
  notes: z.string().trim().max(500).optional(),
});

export const listSettlementsQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.string().optional(),
  from_date: z.string().date().optional(),
  to_date: z.string().date().optional(),
  status: z.enum(['active', 'deleted']).optional(),
});
