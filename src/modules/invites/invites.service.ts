import { randomUUID } from 'node:crypto';

import { ActivityEntityType, GroupRole, InviteStatus, MembershipStatus } from '@prisma/client';

import { createActivityLog } from '../../lib/activity.js';
import { requireAdminOrOwnerMembership, requireMembership } from '../../lib/group-access.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../../lib/errors.js';
import { normalizeEmail } from '../../lib/normalize.js';
import { prisma } from '../../prisma/client.js';

function serializeInvite(invite: {
  id: string;
  groupId: string;
  email: string;
  status: InviteStatus;
  expiresAt: Date;
  createdAt: Date;
}) {
  return {
    id: invite.id,
    group_id: invite.groupId,
    email: invite.email,
    status: invite.status.toLowerCase(),
    expires_at: invite.expiresAt.toISOString(),
    created_at: invite.createdAt.toISOString(),
  };
}

export async function createInvite(userId: string, groupId: string, email: string) {
  await requireMembership(userId, groupId);
  const normalizedEmail = normalizeEmail(email);

  const [existingMembership, existingInvite] = await Promise.all([
    prisma.groupMember.findFirst({
      where: {
        groupId,
        user: {
          emailNormalized: normalizedEmail,
        },
        status: MembershipStatus.ACTIVE,
      },
    }),
    prisma.invite.findFirst({
      where: {
        groupId,
        emailNormalized: normalizedEmail,
        status: InviteStatus.PENDING,
      },
    }),
  ]);

  if (existingMembership) {
    throw new ConflictError('User is already an active member of this group');
  }

  if (existingInvite) {
    throw new ConflictError('Duplicate active invite already exists');
  }

  const invite = await prisma.invite.create({
    data: {
      groupId,
      invitedByUserId: userId,
      email,
      emailNormalized: normalizedEmail,
      token: randomUUID(),
      expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000),
      role: GroupRole.MEMBER,
    },
  });

  await createActivityLog(prisma, {
    groupId,
    actorUserId: userId,
    entityType: ActivityEntityType.INVITE,
    entityId: invite.id,
    action: 'invite_sent',
    payload: { email },
  });

  return { invite: serializeInvite(invite) };
}

export async function listGroupInvites(userId: string, groupId: string) {
  await requireMembership(userId, groupId);
  const invites = await prisma.invite.findMany({
    where: { groupId },
    orderBy: { createdAt: 'desc' },
  });
  return { items: invites.map(serializeInvite) };
}

export async function listPendingInvites(userId: string, status?: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const invites = await prisma.invite.findMany({
    where: {
      emailNormalized: user.emailNormalized,
      ...(status ? { status: InviteStatus[status.toUpperCase() as keyof typeof InviteStatus] } : { status: InviteStatus.PENDING }),
    },
    orderBy: { createdAt: 'desc' },
  });

  return { items: invites.map(serializeInvite) };
}

export async function acceptInvite(userId: string, inviteId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const invite = await prisma.invite.findUnique({ where: { id: inviteId } });
  if (!invite) throw new NotFoundError('Invite not found');
  if (invite.status !== InviteStatus.PENDING) throw new ConflictError('Invite is not pending');
  if (invite.emailNormalized !== user.emailNormalized) {
    throw new ForbiddenError('Invite does not belong to the current user');
  }

  await prisma.$transaction(async (tx) => {
    await tx.groupMember.upsert({
      where: {
        groupId_userId: {
          groupId: invite.groupId,
          userId,
        },
      },
      update: {
        status: MembershipStatus.ACTIVE,
        joinedAt: new Date(),
        leftAt: null,
        role: invite.role,
      },
      create: {
        groupId: invite.groupId,
        userId,
        role: invite.role,
        status: MembershipStatus.ACTIVE,
        joinedAt: new Date(),
      },
    });

    await tx.invite.update({
      where: { id: inviteId },
      data: {
        status: InviteStatus.ACCEPTED,
        acceptedByUserId: userId,
        respondedAt: new Date(),
      },
    });

    await createActivityLog(tx, {
      groupId: invite.groupId,
      actorUserId: userId,
      entityType: ActivityEntityType.INVITE,
      entityId: invite.id,
      action: 'invite_accepted',
    });
  });
}

export async function declineInvite(userId: string, inviteId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const invite = await prisma.invite.findUnique({ where: { id: inviteId } });
  if (!invite) throw new NotFoundError('Invite not found');
  if (invite.emailNormalized !== user.emailNormalized) {
    throw new ForbiddenError('Invite does not belong to the current user');
  }

  await prisma.invite.update({
    where: { id: inviteId },
    data: {
      status: InviteStatus.DECLINED,
      respondedAt: new Date(),
    },
  });

  await createActivityLog(prisma, {
    groupId: invite.groupId,
    actorUserId: userId,
    entityType: ActivityEntityType.INVITE,
    entityId: invite.id,
    action: 'invite_declined',
  });
}

export async function revokeInvite(userId: string, inviteId: string) {
  const invite = await prisma.invite.findUnique({ where: { id: inviteId } });
  if (!invite) throw new NotFoundError('Invite not found');
  await requireAdminOrOwnerMembership(userId, invite.groupId);

  await prisma.invite.update({
    where: { id: inviteId },
    data: {
      status: InviteStatus.REVOKED,
      respondedAt: new Date(),
    },
  });

  await createActivityLog(prisma, {
    groupId: invite.groupId,
    actorUserId: userId,
    entityType: ActivityEntityType.INVITE,
    entityId: invite.id,
    action: 'invite_revoked',
  });
}
