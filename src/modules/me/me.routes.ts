import { Router } from 'express';

import { asyncHandler } from '../../lib/async-handler.js';
import { sendData } from '../../lib/response.js';
import { authenticate } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import * as meService from './me.service.js';
import { updateMeSchema } from './me.types.js';

const router = Router();

router.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    return sendData(res, await meService.getMe(req.user.id));
  }),
);

router.patch(
  '/me',
  authenticate,
  validate({ body: updateMeSchema }),
  asyncHandler(async (req, res) => {
    return sendData(res, await meService.updateMe(req.user.id, req.body));
  }),
);

export default router;
