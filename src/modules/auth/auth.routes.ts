import { Router } from 'express';

import { asyncHandler } from '../../lib/async-handler.js';
import { UnauthorizedError } from '../../lib/errors.js';
import { sendData, sendNoContent } from '../../lib/response.js';
import { validate } from '../../middleware/validate.js';
import * as authService from './auth.service.js';
import { exchangeSchema, logoutSchema, refreshSchema } from './auth.types.js';

const router = Router();

router.post(
  '/exchange',
  validate({ body: exchangeSchema }),
  asyncHandler(async (req, res) => {
    const authHeader = req.header('authorization');
    const tokenFromHeader = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
    const supabaseToken = req.body.supabase_token || tokenFromHeader;

    if (!supabaseToken) {
      throw new UnauthorizedError('Supabase bearer token is required');
    }

    const result = await authService.exchangeToken(supabaseToken, req.header('user-agent'), req.ip);
    return sendData(res, result, 200);
  }),
);

router.post(
  '/refresh',
  validate({ body: refreshSchema }),
  asyncHandler(async (req, res) => {
    const result = await authService.refreshToken(req.body.refresh_token);
    return sendData(res, result, 200);
  }),
);

router.post(
  '/logout',
  validate({ body: logoutSchema }),
  asyncHandler(async (req, res) => {
    await authService.logout(req.body.refresh_token);
    return sendNoContent(res);
  }),
);

export default router;
