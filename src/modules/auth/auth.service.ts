import { randomUUID } from 'node:crypto';

import { InviteStatus } from '@prisma/client';

import { createActivityLog } from '../../lib/activity.js';
import { ConflictError, UnauthorizedError } from '../../lib/errors.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../../lib/jwt.js';
import { normalizeEmail } from '../../lib/normalize.js';
import { durationToDate, durationToSeconds } from '../../lib/time.js';
import { verifySupabaseToken } from '../../lib/supabase.js';
import { prisma } from '../../prisma/client.js';
import { env } from '../../lib/env.js';

function authUserResponse(user: {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  preferredCurrency: string | null;
  timezone: string | null;
}) {
  return {
    id: user.id,
    email: user.email,
    display_name: user.displayName,
    avatar_url: user.avatarUrl,
    preferred_currency: user.preferredCurrency,
    timezone: user.timezone,
  };
}

async function issueSession(user: { id: string; email: string }, userAgent?: string, ipAddress?: string) {
  const sessionId = randomUUID();
  const refreshJti = randomUUID();
  const refreshExpiresAt = durationToDate(env.JWT_REFRESH_EXPIRES_IN);

  await prisma.refreshSession.create({
    data: {
      id: sessionId,
      userId: user.id,
      refreshJti,
      userAgent,
      ipAddress,
      expiresAt: refreshExpiresAt,
    },
  });

  return {
    access_token: signAccessToken({
      sub: user.id,
      sid: sessionId,
      email: user.email,
    }),
    refresh_token: signRefreshToken({
      sub: user.id,
      sid: sessionId,
      jti: refreshJti,
    }),
    expires_in: durationToSeconds(env.JWT_ACCESS_EXPIRES_IN),
  };
}

export async function exchangeToken(supabaseToken: string, userAgent?: string, ipAddress?: string) {
  const claims = await verifySupabaseToken(supabaseToken);
  if (!claims.sub || !claims.email) {
    throw new UnauthorizedError('Supabase token is missing required claims');
  }

  const emailNormalized = normalizeEmail(claims.email);

  const user = await prisma.$transaction(async (tx) => {
    const upserted = await tx.user.upsert({
      where: { id: claims.sub },
      update: {
        email: claims.email!,
        emailNormalized,
        displayName: claims.user_metadata?.full_name ?? undefined,
        avatarUrl: claims.user_metadata?.avatar_url ?? claims.user_metadata?.picture ?? undefined,
      },
      create: {
        id: claims.sub,
        email: claims.email!,
        emailNormalized,
        displayName: claims.user_metadata?.full_name ?? null,
        avatarUrl: claims.user_metadata?.avatar_url ?? claims.user_metadata?.picture ?? null,
      },
    });

    const pendingInvites = await tx.invite.findMany({
      where: {
        emailNormalized,
        status: InviteStatus.PENDING,
      },
    });

    for (const invite of pendingInvites) {
      await tx.groupMember.upsert({
        where: {
          groupId_userId: {
            groupId: invite.groupId,
            userId: upserted.id,
          },
        },
        update: {
          status: 'ACTIVE',
          role: invite.role,
          joinedAt: new Date(),
          leftAt: null,
        },
        create: {
          groupId: invite.groupId,
          userId: upserted.id,
          role: invite.role,
          status: 'ACTIVE',
          joinedAt: new Date(),
        },
      });

      await tx.invite.update({
        where: { id: invite.id },
        data: {
          status: InviteStatus.ACCEPTED,
          acceptedByUserId: upserted.id,
          respondedAt: new Date(),
        },
      });

      await createActivityLog(tx, {
        groupId: invite.groupId,
        actorUserId: upserted.id,
        entityType: 'INVITE',
        entityId: invite.id,
        action: 'invite_auto_accepted',
        payload: { email: claims.email },
      });
    }

    await tx.entitlementState.upsert({
      where: { userId: upserted.id },
      update: {},
      create: {
        userId: upserted.id,
        isPremium: false,
        source: 'system',
        status: 'inactive',
        products: [],
        featureFlags: {
          advanced_analytics: false,
          unlimited_groups: false,
          receipt_upload: false,
          export: false,
        },
      },
    });

    return upserted;
  });

  const session = await issueSession(user, userAgent, ipAddress);

  return {
    ...session,
    user: authUserResponse(user),
  };
}

export async function refreshToken(refreshToken: string) {
  const payload = verifyRefreshToken(refreshToken);
  const session = await prisma.refreshSession.findUnique({
    where: { refreshJti: payload.jti },
    include: { user: true },
  });

  if (!session || session.revokedAt || session.expiresAt < new Date()) {
    throw new UnauthorizedError('Refresh session is invalid');
  }

  const nextJti = randomUUID();
  await prisma.refreshSession.update({
    where: { id: session.id },
    data: {
      refreshJti: nextJti,
      expiresAt: durationToDate(env.JWT_REFRESH_EXPIRES_IN),
    },
  });

  return {
    access_token: signAccessToken({
      sub: session.userId,
      sid: session.id,
      email: session.user.email,
    }),
    refresh_token: signRefreshToken({
      sub: session.userId,
      sid: session.id,
      jti: nextJti,
    }),
    expires_in: durationToSeconds(env.JWT_ACCESS_EXPIRES_IN),
    user: authUserResponse(session.user),
  };
}

export async function logout(refreshToken: string) {
  const payload = verifyRefreshToken(refreshToken);
  const session = await prisma.refreshSession.findUnique({
    where: { refreshJti: payload.jti },
  });

  if (!session) {
    throw new ConflictError('Refresh session not found');
  }

  await prisma.refreshSession.update({
    where: { id: session.id },
    data: {
      revokedAt: new Date(),
    },
  });
}
