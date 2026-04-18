import { GroupRole, MembershipStatus } from '@prisma/client';

import { ForbiddenError, NotFoundError, ValidationError } from './errors.js';
import { prisma } from '../prisma/client.js';

export async function getGroupOrThrow(groupId: string) {
  const group = await prisma.group.findUnique({ where: { id: groupId } });
  if (!group) {
    throw new NotFoundError('Group not found');
  }
  return group;
}

export async function getMembership(userId: string, groupId: string) {
  return prisma.groupMember.findUnique({
    where: {
      groupId_userId: {
        groupId,
        userId,
      },
    },
  });
}

export async function requireMembership(userId: string, groupId: string) {
  const group = await getGroupOrThrow(groupId);
  const membership = await getMembership(userId, groupId);
  if (!membership || membership.status !== MembershipStatus.ACTIVE) {
    throw new ForbiddenError('You are not an active member of this group');
  }
  return { group, membership };
}

export async function requireAdminOrOwnerMembership(userId: string, groupId: string) {
  const { group, membership } = await requireMembership(userId, groupId);
  if (membership.role !== GroupRole.ADMIN && membership.role !== GroupRole.OWNER) {
    throw new ForbiddenError('Admin or owner role required');
  }
  return { group, membership };
}

export async function requireOwnerMembership(userId: string, groupId: string) {
  const { group, membership } = await requireMembership(userId, groupId);
  if (membership.role !== GroupRole.OWNER) {
    throw new ForbiddenError('Owner role required');
  }
  return { group, membership };
}

export async function assertUsersActiveMembers(groupId: string, userIds: string[]) {
  const uniqueUserIds = [...new Set(userIds)];
  const members = await prisma.groupMember.findMany({
    where: {
      groupId,
      userId: { in: uniqueUserIds },
      status: MembershipStatus.ACTIVE,
    },
  });

  if (members.length !== uniqueUserIds.length) {
    throw new ValidationError('All referenced users must be active group members');
  }
}
