import { Prisma } from '@prisma/client';
import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

import { AppError } from '../lib/errors.js';

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
      },
      meta: {
        request_id: req.requestId,
      },
    });
  }

  if (err instanceof ZodError) {
    return res.status(422).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: err.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join(', '),
      },
      meta: {
        request_id: req.requestId,
      },
    });
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      return res.status(409).json({
        error: {
          code: 'CONFLICT',
          message: 'Duplicate value violates a unique constraint',
        },
        meta: {
          request_id: req.requestId,
        },
      });
    }
  }

  console.error(`[${req.requestId}]`, err);
  return res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    },
    meta: {
      request_id: req.requestId,
    },
  });
}
