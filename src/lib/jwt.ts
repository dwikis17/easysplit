import jwt, { type SignOptions } from 'jsonwebtoken';

import { env } from './env.js';

type AccessPayload = {
  sub: string;
  sid: string;
  email: string;
  type: 'access';
};

type RefreshPayload = {
  sub: string;
  sid: string;
  jti: string;
  type: 'refresh';
};

export function signAccessToken(payload: Omit<AccessPayload, 'type'>) {
  return jwt.sign({ ...payload, type: 'access' }, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as SignOptions['expiresIn'],
    issuer: env.JWT_ISSUER,
  });
}

export function signRefreshToken(payload: Omit<RefreshPayload, 'type'>) {
  return jwt.sign({ ...payload, type: 'refresh' }, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN as SignOptions['expiresIn'],
    issuer: env.JWT_ISSUER,
  });
}

export function verifyAccessToken(token: string) {
  return jwt.verify(token, env.JWT_ACCESS_SECRET, {
    issuer: env.JWT_ISSUER,
  }) as AccessPayload;
}

export function verifyRefreshToken(token: string) {
  return jwt.verify(token, env.JWT_REFRESH_SECRET, {
    issuer: env.JWT_ISSUER,
  }) as RefreshPayload;
}
