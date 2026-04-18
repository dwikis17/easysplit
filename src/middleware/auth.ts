import type { NextFunction, Request, Response } from 'express';

import { UnauthorizedError } from '../lib/errors.js';
import { verifyAccessToken } from '../lib/jwt.js';
import { prisma } from '../prisma/client.js';

export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    const authHeader = req.header('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedError('Missing bearer token');
    }

    const payload = verifyAccessToken(authHeader.slice(7));
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user || user.isDisabled) {
      throw new UnauthorizedError('User is not authorized');
    }

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
}
