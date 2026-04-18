import { defaultFeatureFlags } from '../../lib/entitlements.js';
import { env } from '../../lib/env.js';
import { UnauthorizedError } from '../../lib/errors.js';
import { normalizeEmail } from '../../lib/normalize.js';
import { prisma } from '../../prisma/client.js';

type RevenueCatEventPayload = {
  event: {
    id?: string;
    type?: string;
    app_user_id?: string;
    original_app_user_id?: string;
    entitlement_ids?: string[];
    product_id?: string;
    expiration_at_ms?: number;
  };
};

export async function handleRevenueCatWebhook(payload: RevenueCatEventPayload, authorization?: string) {
  if (env.REVENUECAT_WEBHOOK_AUTH && authorization !== env.REVENUECAT_WEBHOOK_AUTH) {
    throw new UnauthorizedError('Invalid RevenueCat webhook authorization');
  }

  const event = payload.event ?? {};
  const eventId = event.id ?? `${event.type ?? 'unknown'}:${event.app_user_id ?? 'unknown'}`;
  const eventType = event.type ?? 'unknown';
  const userId = event.app_user_id && event.app_user_id.match(/^[0-9a-f-]{36}$/i) ? event.app_user_id : null;

  const exists = await prisma.revenueCatWebhookEvent.findUnique({ where: { eventId } });
  if (exists) {
    return { ok: true, deduplicated: true };
  }

  const isPremium = ['INITIAL_PURCHASE', 'RENEWAL', 'UNCANCELLATION', 'PRODUCT_CHANGE'].includes(eventType);
  const status = isPremium ? 'active' : eventType === 'EXPIRATION' ? 'expired' : 'inactive';

  await prisma.$transaction(async (tx) => {
    await tx.revenueCatWebhookEvent.create({
      data: {
        eventId,
        eventType,
        userId,
        payload,
        processedAt: new Date(),
      },
    });

    if (userId) {
      await tx.entitlementState.upsert({
        where: { userId },
        update: {
          isPremium,
          source: 'revenuecat',
          status,
          products: event.product_id
            ? [
                {
                  product_id: event.product_id,
                  entitlement_id: event.entitlement_ids?.[0] ?? 'premium',
                  current_period_ends_at: event.expiration_at_ms
                    ? new Date(event.expiration_at_ms).toISOString()
                    : null,
                },
              ]
            : [],
          featureFlags: defaultFeatureFlags(isPremium),
          currentPeriodEndsAt: event.expiration_at_ms ? new Date(event.expiration_at_ms) : null,
        },
        create: {
          userId,
          isPremium,
          source: 'revenuecat',
          status,
          products: event.product_id
            ? [
                {
                  product_id: event.product_id,
                  entitlement_id: event.entitlement_ids?.[0] ?? 'premium',
                  current_period_ends_at: event.expiration_at_ms
                    ? new Date(event.expiration_at_ms).toISOString()
                    : null,
                },
              ]
            : [],
          featureFlags: defaultFeatureFlags(isPremium),
          currentPeriodEndsAt: event.expiration_at_ms ? new Date(event.expiration_at_ms) : null,
        },
      });
    }
  });

  return { ok: true, deduplicated: false };
}
