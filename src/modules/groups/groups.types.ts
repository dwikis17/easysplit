import { z } from 'zod';

export const groupParamsSchema = z.object({
  groupId: z.string().uuid(),
});

export const memberParamsSchema = z.object({
  groupId: z.string().uuid(),
  userId: z.string().uuid(),
});

export const createGroupSchema = z.object({
  type: z.enum(['group', 'trip']),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional(),
  base_currency: z.string().trim().length(3),
  start_date: z.string().date().optional(),
  end_date: z.string().date().optional(),
});

export const listGroupsSchema = z.object({
  type: z.enum(['group', 'trip']).optional(),
  status: z.enum(['active', 'archived']).optional(),
  cursor: z.string().uuid().optional(),
  limit: z.string().optional(),
});

export const updateGroupSchema = createGroupSchema.partial();

export const listMembersSchema = z.object({
  include_inactive: z.enum(['true', 'false']).optional(),
});

export const updateMemberSchema = z.object({
  role: z.enum(['owner', 'admin', 'member']).optional(),
  status: z.enum(['active', 'left', 'removed']).optional(),
});

export const transferOwnershipSchema = z.object({
  new_owner_user_id: z.string().uuid(),
});
