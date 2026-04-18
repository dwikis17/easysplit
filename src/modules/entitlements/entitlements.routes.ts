import { Router } from 'express';

import { asyncHandler } from '../../lib/async-handler.js';
import { sendData } from '../../lib/response.js';
import { authenticate } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import * as entitlementService from './entitlements.service.js';
import { refreshEntitlementSchema } from './entitlements.types.js';

const router = Router();

router.get(
  '/entitlements/me',
  authenticate,
  asyncHandler(async (req, res) => sendData(res, await entitlementService.getMyEntitlement(req.user.id))),
);

router.post(
  '/entitlements/refresh',
  authenticate,
  validate({ body: refreshEntitlementSchema }),
  asyncHandler(async (req, res) => sendData(res, await entitlementService.refreshEntitlement(req.user.id))),
);

export default router;
