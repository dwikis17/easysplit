import { Router } from 'express';

import { asyncHandler } from '../../lib/async-handler.js';
import { sendData } from '../../lib/response.js';
import { authenticate } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import * as activityService from './activity.service.js';
import { activityGroupParamsSchema } from './activity.types.js';

const router = Router();

router.get(
  '/groups/:groupId/activity',
  authenticate,
  validate({ params: activityGroupParamsSchema }),
  asyncHandler(async (req, res) => sendData(res, await activityService.listActivity(req.user.id, String(req.params.groupId)))),
);

export default router;
