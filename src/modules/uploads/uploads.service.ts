import { randomUUID } from 'node:crypto';

import { createClient } from '@supabase/supabase-js';

import { env } from '../../lib/env.js';
import { PremiumRequiredError, ValidationError } from '../../lib/errors.js';
import { requireMembership } from '../../lib/group-access.js';
import { prisma } from '../../prisma/client.js';

export async function presignReceiptUpload(
  userId: string,
  input: { group_id: string; file_name: string; content_type: string },
) {
  await requireMembership(userId, input.group_id);
  const entitlement = await prisma.entitlementState.findUnique({ where: { userId } });
  if (!entitlement?.isPremium) {
    throw new PremiumRequiredError('Receipt upload requires premium');
  }

  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new ValidationError('SUPABASE_SERVICE_ROLE_KEY is required for receipt presign');
  }

  const client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const storagePath = `receipts/${input.group_id}/${randomUUID()}/${input.file_name}`;
  const { data, error } = await client.storage.from(env.SUPABASE_STORAGE_BUCKET).createSignedUploadUrl(storagePath);

  if (error || !data) {
    throw new ValidationError(error?.message ?? 'Could not create signed upload URL');
  }

  return {
    storage_path: storagePath,
    upload: {
      method: 'PUT',
      url: data.signedUrl,
      headers: {
        'content-type': input.content_type,
        ...(data.token ? { 'x-upload-token': data.token } : {}),
      },
    },
  };
}
