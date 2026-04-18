import { GroupRole, GroupStatus, GroupType, MembershipStatus } from '@prisma/client';

import { createActivityLog } from '../../lib/activity.js';
import {
  getGroupOrThrow,
  requireAdminOrOwnerMembership,
  requireMembership,
  requireOwnerMembership,
} from '../../lib/group-access.js';
import { ConflictError, ForbiddenError, ValidationError } from '../../lib/errors.js';
import { normalizeCurrency } from '../../lib/normalize.js';
import { parseCursorLimit } from '../../lib/pagination.js';
import { prisma } from '../../prisma/client.js';
import { env } from '../../lib/env.js';

function serializeGroup(group: {
  id: string;
  type: GroupType;
  name: string;
  description: string | null;
  baseCurrency: string;
  status: GroupStatus;
  ownerUserId: string;
  startDate: Date | null;
  endDate: Date | null;
  createdAt: Date;
 }) {
  return {
    id: group.id,
    type: group.type.toLowerCase(),
    name: group.name,
    description: group.description,
    base_currency: group.baseCurrency,
    status: group.status.toLowerCase(),
    owner_user_id: group.ownerUserId,
    start_date: group.startDate ? group.startDate.toISOString().slice(0, 10) : null,
    end_date: group.endDate ? group.endDate.toISOString().slice(0, 10) : null,
    created_at: group.createdAt.toISOString(),
  };
}

function serializeMember(member: {
  userId: string;
  role: GroupRole;
  status: MembershipStatus;
  joinedAt: Date | null;
  user: { displayName: string | null; email: string };
}) {
  return {
    user_id: member.userId,
    display_name: member.user.displayName,
    email: member.user.email,
    role: member.role.toLowerCase(),
    status: member.status.toLowerCase(),
    joined_at: member.joinedAt?.toISOString() ?? null,
  };
}

async function assertGroupCreationAllowed(userId: string) {
  const activeGroups = await prisma.group.count({
    where: {
      status: GroupStatus.ACTIVE,
      members: {
        some: {
          userId,
          status: MembershipStatus.ACTIVE,
        },
      },
    },
  });
  const entitlement = await prisma.entitlementState.findUnique({ where: { userId } });
  if (!entitlement?.isPremium && activeGroups >= env.FREE_ACTIVE_GROUP_LIMIT) {
    throw new ForbiddenError('Free tier active group limit reached');
  }
}

export async function createGroup(
  userId: string,
  input: {
    type: 'group' | 'trip';
    name: string;
    description?: string;
    base_currency: string;
    start_date?: string;
    end_date?: string;
  },
) {
  await assertGroupCreationAllowed(userId);

  if (input.type === 'trip' && input.start_date && input.end_date && input.end_date < input.start_date) {
    throw new ValidationError('end_date must be on or after start_date');
  }

  const group = await prisma.$transaction(async (tx) => {
    const created = await tx.group.create({
      data: {
        type: input.type === 'trip' ? GroupType.TRIP : GroupType.GROUP,
        name: input.name,
        description: input.description,
        baseCurrency: normalizeCurrency(input.base_currency),
        ownerUserId: userId,
        startDate: input.start_date ? new Date(input.start_date) : null,
        endDate: input.end_date ? new Date(input.end_date) : null,
      },
    });

    await tx.groupMember.create({
      data: {
        groupId: created.id,
        userId,
        role: GroupRole.OWNER,
        status: MembershipStatus.ACTIVE,
        joinedAt: new Date(),
      },
    });

    await createActivityLog(tx, {
      groupId: created.id,
      actorUserId: userId,
      entityType: 'GROUP',
      entityId: created.id,
      action: 'group_created',
      payload: { type: input.type, name: input.name },
    });

    return created;
  });

  return { group: serializeGroup(group) };
}

export async function listGroups(
  userId: string,
  query: {
    type?: 'group' | 'trip';
    status?: 'active' | 'archived';
    cursor?: string;
    limit?: string;
  },
) {
  const limit = parseCursorLimit(query.limit);
  const groups = await prisma.group.findMany({
    where: {
      ...(query.type ? { type: query.type === 'trip' ? GroupType.TRIP : GroupType.GROUP } : {}),
      ...(query.status
        ? { status: query.status === 'archived' ? GroupStatus.ARCHIVED : GroupStatus.ACTIVE }
        : {}),
      members: {
        some: {
          userId,
        },
      },
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
  });

  const hasNext = groups.length > limit;
  return {
    items: groups.slice(0, limit).map(serializeGroup),
    next_cursor: hasNext ? groups[limit - 1]?.id ?? null : null,
  };
}

export async function getGroup(userId: string, groupId: string) {
  await requireMembership(userId, groupId);
  const group = await getGroupOrThrow(groupId);
  return { group: serializeGroup(group) };
}

export async function updateGroup(
  userId: string,
  groupId: string,
  input: {
    name?: string;
    description?: string;
    base_currency?: string;
    start_date?: string;
    end_date?: string;
  },
) {
  await requireAdminOrOwnerMembership(userId, groupId);

  const group = await prisma.group.update({
    where: { id: groupId },
    data: {
      name: input.name,
      description: input.description,
      baseCurrency: input.base_currency ? normalizeCurrency(input.base_currency) : undefined,
      startDate: input.start_date ? new Date(input.start_date) : undefined,
      endDate: input.end_date ? new Date(input.end_date) : undefined,
    },
  });

  await createActivityLog(prisma, {
    groupId,
    actorUserId: userId,
    entityType: 'GROUP',
    entityId: groupId,
    action: 'group_updated',
    payload: input,
  });

  return { group: serializeGroup(group) };
}

export async function setArchiveState(userId: string, groupId: string, archived: boolean) {
  await requireOwnerMembership(userId, groupId);
  const group = await prisma.group.update({
    where: { id: groupId },
    data: {
      status: archived ? GroupStatus.ARCHIVED : GroupStatus.ACTIVE,
    },
  });

  await createActivityLog(prisma, {
    groupId,
    actorUserId: userId,
    entityType: 'GROUP',
    entityId: groupId,
    action: archived ? 'group_archived' : 'group_restored',
  });

  return { group: serializeGroup(group) };
}

export async function listMembers(userId: string, groupId: string, includeInactive = false) {
  await requireMembership(userId, groupId);
  const members = await prisma.groupMember.findMany({
    where: {
      groupId,
      ...(includeInactive ? {} : { status: MembershipStatus.ACTIVE }),
    },
    include: {
      user: true,
    },
    orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
  });
  return { members: members.map(serializeMember) };
}

export async function updateMember(
  actorUserId: string,
  groupId: string,
  targetUserId: string,
  input: { role?: 'owner' | 'admin' | 'member'; status?: 'active' | 'left' | 'removed' },
) {
  const { membership: actorMembership } = await requireAdminOrOwnerMembership(actorUserId, groupId);
  const target = await prisma.groupMember.findUniqueOrThrow({
    where: {
      groupId_userId: {
        groupId,
        userId: targetUserId,
      },
    },
    include: {
      user: true,
    },
  });

  if (target.role === GroupRole.OWNER && actorMembership.role !== GroupRole.OWNER) {
    throw new ForbiddenError('Only the owner can update the owner membership');
  }

  const updated = await prisma.groupMember.update({
    where: { id: target.id },
    data: {
      role: input.role ? GroupRole[input.role.toUpperCase() as keyof typeof GroupRole] : undefined,
      status: input.status
        ? MembershipStatus[input.status.toUpperCase() as keyof typeof MembershipStatus]
        : undefined,
      leftAt: input.status && input.status !== 'active' ? new Date() : undefined,
    },
    include: {
      user: true,
    },
  });

  await createActivityLog(prisma, {
    groupId,
    actorUserId,
    entityType: 'MEMBER',
    entityId: updated.id,
    action: 'member_updated',
    payload: input,
  });

  return { member: serializeMember(updated) };
}

export async function leaveGroup(userId: string, groupId: string) {
  const { membership } = await requireMembership(userId, groupId);
  if (membership.role === GroupRole.OWNER) {
    throw new ConflictError('Owner must transfer ownership before leaving');
  }

  await prisma.groupMember.update({
    where: { id: membership.id },
    data: {
      status: MembershipStatus.LEFT,
      leftAt: new Date(),
    },
  });

  await createActivityLog(prisma, {
    groupId,
    actorUserId: userId,
    entityType: 'MEMBER',
    entityId: membership.id,
    action: 'member_left',
  });
}

export async function transferOwnership(userId: string, groupId: string, newOwnerUserId: string) {
  await requireOwnerMembership(userId, groupId);
  if (userId === newOwnerUserId) {
    throw new ValidationError('new_owner_user_id must differ from current owner');
  }

  const newOwner = await prisma.groupMember.findUniqueOrThrow({
    where: {
      groupId_userId: {
        groupId,
        userId: newOwnerUserId,
      },
    },
  });

  if (newOwner.status !== MembershipStatus.ACTIVE) {
    throw new ValidationError('New owner must be an active member');
  }

  await prisma.$transaction([
    prisma.group.update({
      where: { id: groupId },
      data: { ownerUserId: newOwnerUserId },
    }),
    prisma.groupMember.update({
      where: {
        groupId_userId: {
          groupId,
          userId,
        },
      },
      data: { role: GroupRole.ADMIN },
    }),
    prisma.groupMember.update({
      where: {
        groupId_userId: {
          groupId,
          userId: newOwnerUserId,
        },
      },
      data: { role: GroupRole.OWNER },
    }),
  ]);

  await createActivityLog(prisma, {
    groupId,
    actorUserId: userId,
    entityType: 'GROUP',
    entityId: groupId,
    action: 'ownership_transferred',
    payload: { new_owner_user_id: newOwnerUserId },
  });
}
