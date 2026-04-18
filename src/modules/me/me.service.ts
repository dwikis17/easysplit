import { prisma } from '../../prisma/client.js';
import { entitlementResponse } from '../../lib/entitlements.js';
import { normalizeCurrency } from '../../lib/normalize.js';

export async function getMe(userId: string) {
  const [user, entitlement] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId } }),
    prisma.entitlementState.findUnique({ where: { userId } }),
  ]);

  return {
    user: {
      id: user.id,
      email: user.email,
      display_name: user.displayName,
      avatar_url: user.avatarUrl,
      preferred_currency: user.preferredCurrency,
      timezone: user.timezone,
    },
    entitlement: entitlementResponse(entitlement),
  };
}

export async function updateMe(
  userId: string,
  input: {
    display_name?: string;
    preferred_currency?: string;
    timezone?: string;
  },
) {
  await prisma.user.update({
    where: { id: userId },
    data: {
      displayName: input.display_name,
      preferredCurrency: input.preferred_currency
        ? normalizeCurrency(input.preferred_currency)
        : undefined,
      timezone: input.timezone,
    },
  });

  return getMe(userId);
}
