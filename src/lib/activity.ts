import type { Prisma, PrismaClient } from '@prisma/client';
import { ActivityEntityType } from '@prisma/client';

export async function createActivityLog(
  db: Prisma.TransactionClient | PrismaClient,
  input: {
    groupId?: string | null;
    expenseId?: string | null;
    actorUserId?: string | null;
    entityType: ActivityEntityType;
    entityId: string;
    action: string;
    payload?: Prisma.InputJsonValue;
  },
) {
  await db.activityLog.create({
    data: {
      groupId: input.groupId ?? null,
      expenseId: input.expenseId ?? null,
      actorUserId: input.actorUserId ?? null,
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      payload: input.payload,
    },
  });
}
