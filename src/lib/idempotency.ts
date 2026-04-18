import { IdempotencyOperation, type Prisma, type PrismaClient } from '@prisma/client';

import { ConflictError } from './errors.js';
import { sha256 } from './hash.js';

export function hashIdempotentPayload(payload: unknown) {
  return sha256(JSON.stringify(payload));
}

export async function findIdempotentResponse(
  db: PrismaClient | Prisma.TransactionClient,
  input: {
    groupId: string;
    userId: string;
    key: string;
    operation: IdempotencyOperation;
    payload: unknown;
  },
) {
  const requestHash = hashIdempotentPayload(input.payload);
  const record = await db.idempotencyKey.findUnique({
    where: {
      groupId_userId_key_operation: {
        groupId: input.groupId,
        userId: input.userId,
        key: input.key,
        operation: input.operation,
      },
    },
  });

  if (!record) {
    return null;
  }

  if (record.requestHash !== requestHash) {
    throw new ConflictError('Idempotency key already used with different payload', 'IDEMPOTENCY_CONFLICT');
  }

  return {
    status: record.responseStatus,
    body: record.responseBody,
  };
}

export async function saveIdempotentResponse(
  db: PrismaClient | Prisma.TransactionClient,
  input: {
    groupId: string;
    userId: string;
    key: string;
    operation: IdempotencyOperation;
    payload: unknown;
    responseStatus: number;
    responseBody: Prisma.InputJsonValue;
  },
) {
  await db.idempotencyKey.create({
    data: {
      groupId: input.groupId,
      userId: input.userId,
      key: input.key,
      operation: input.operation,
      requestHash: hashIdempotentPayload(input.payload),
      responseStatus: input.responseStatus,
      responseBody: input.responseBody,
    },
  });
}
