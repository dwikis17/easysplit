import { z } from 'zod';

const amountSchema = z.object({
  minor: z.number().int().positive(),
  currency: z.string().trim().length(3),
});

const paidBySchema = z.object({
  user_id: z.string().uuid(),
  amount_minor: z.number().int().positive(),
});

const participantSchema = z.object({
  user_id: z.string().uuid(),
  amount_minor: z.number().int().positive().optional(),
  percentage: z.string().optional(),
});

export const expenseGroupParamsSchema = z.object({
  groupId: z.string().uuid(),
});

export const expenseParamsSchema = z.object({
  expenseId: z.string().uuid(),
});

export const createExpenseSchema = z.object({
  title: z.string().trim().min(1).max(200),
  category: z.string().trim().max(60).optional(),
  notes: z.string().trim().max(500).optional(),
  expense_date: z.string().date(),
  amount: amountSchema,
  paid_by: z.array(paidBySchema).min(1),
  split_method: z.enum(['equal', 'exact', 'percentage']),
  participants: z.array(participantSchema).min(1),
  receipt_url: z.string().optional(),
});

export const updateExpenseSchema = createExpenseSchema.partial();

export const listExpensesQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.string().optional(),
  from_date: z.string().date().optional(),
  to_date: z.string().date().optional(),
  created_by_user_id: z.string().uuid().optional(),
  category: z.string().optional(),
  status: z.enum(['active', 'deleted']).optional(),
});
