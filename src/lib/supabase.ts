import { createRemoteJWKSet, jwtVerify } from 'jose';

import { env } from './env.js';
import { UnauthorizedError } from './errors.js';

export type SupabaseClaims = {
  sub: string;
  email?: string;
  user_metadata?: {
    full_name?: string;
    avatar_url?: string;
    picture?: string;
  };
};

const jwksUrl = env.SUPABASE_JWKS_URL || `${env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`;
const remoteJwks = createRemoteJWKSet(new URL(jwksUrl));

export async function verifySupabaseToken(token: string) {
  try {
    const result = await jwtVerify(token, remoteJwks, {
      issuer: `${env.SUPABASE_URL}/auth/v1`,
    });
    return result.payload as SupabaseClaims;
  } catch {
    throw new UnauthorizedError('Invalid Supabase token');
  }
}
