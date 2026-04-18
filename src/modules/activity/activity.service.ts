import { requireMembership } from '../../lib/group-access.js';
import { prisma } from '../../prisma/client.js';

export async function listActivity(userId: string, groupId: string) {
  await requireMembership(userId, groupId);
  const items = await prisma.activityLog.findMany({
    where: { groupId },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  return {
    items: items.map((item) => ({
      id: item.id,
      action: item.action,
      entity_type: item.entityType.toLowerCase(),
      entity_id: item.entityId,
      actor_user_id: item.actorUserId,
      metadata: item.payload,
      created_at: item.createdAt.toISOString(),
    })),
  };
}
