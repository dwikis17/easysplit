import { defaultFeatureFlags, entitlementResponse } from '../../lib/entitlements.js';
import { prisma } from '../../prisma/client.js';

export async function getMyEntitlement(userId: string) {
  const entitlement = await prisma.entitlementState.findUnique({ where: { userId } });
  return entitlementResponse(entitlement);
}

export async function refreshEntitlement(userId: string) {
  const entitlement = await prisma.entitlementState.upsert({
    where: { userId },
    update: {},
    create: {
      userId,
      isPremium: false,
      source: 'system',
      status: 'inactive',
      products: [],
      featureFlags: defaultFeatureFlags(false),
    },
  });

  return {
    is_premium: entitlement.isPremium,
    status: entitlement.status,
    updated_at: entitlement.updatedAt.toISOString(),
  };
}
