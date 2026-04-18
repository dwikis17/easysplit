import { z } from 'zod';

export const groupInviteParamsSchema = z.object({
  groupId: z.string().uuid(),
});

export const inviteParamsSchema = z.object({
  inviteId: z.string().uuid(),
});

export const createInviteSchema = z.object({
  email: z.string().email(),
});

export const listPendingInvitesSchema = z.object({
  status: z.enum(['pending', 'accepted', 'declined', 'revoked', 'expired']).optional(),
});
