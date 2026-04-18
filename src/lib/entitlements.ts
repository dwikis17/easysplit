import type { EntitlementState } from '@prisma/client';

export function defaultFeatureFlags(isPremium: boolean) {
  return {
    advanced_analytics: isPremium,
    unlimited_groups: isPremium,
    receipt_upload: isPremium,
    export: isPremium,
  };
}

export function entitlementResponse(entitlement: EntitlementState | null) {
  const isPremium = entitlement?.isPremium ?? false;

  return {
    is_premium: isPremium,
    source: entitlement?.source ?? 'system',
    status: entitlement?.status ?? 'inactive',
    products: entitlement?.products ?? [],
    features: entitlement?.featureFlags ?? defaultFeatureFlags(isPremium),
    updated_at: entitlement?.updatedAt.toISOString() ?? new Date(0).toISOString(),
  };
}
