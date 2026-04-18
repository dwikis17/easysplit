import { GroupRole, MembershipStatus, type GroupMember } from '@prisma/client';

import { ForbiddenError } from './errors.js';

export function assertActiveMembership(
  membership: GroupMember | null | undefined,
): asserts membership is GroupMember {
  if (!membership || membership.status !== MembershipStatus.ACTIVE) {
    throw new ForbiddenError('Active group membership required');
  }
}

export function assertAdminOrOwner(membership: GroupMember | null | undefined) {
  assertActiveMembership(membership);
  const activeMembership = membership;
  if (activeMembership.role !== GroupRole.ADMIN && activeMembership.role !== GroupRole.OWNER) {
    throw new ForbiddenError('Admin or owner role required');
  }
}

export function assertOwner(membership: GroupMember | null | undefined) {
  assertActiveMembership(membership);
  const activeMembership = membership;
  if (activeMembership.role !== GroupRole.OWNER) {
    throw new ForbiddenError('Owner role required');
  }
}
