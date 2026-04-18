import { Router } from 'express';

import { asyncHandler } from '../../lib/async-handler.js';
import { sendData } from '../../lib/response.js';
import { authenticate } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import * as balancesService from './balances.service.js';
import { balanceGroupParamsSchema } from './balances.types.js';

const router = Router();

router.get(
  '/groups/:groupId/balances',
  authenticate,
  validate({ params: balanceGroupParamsSchema }),
  asyncHandler(async (req, res) => sendData(res, await balancesService.getBalances(req.user.id, String(req.params.groupId)))),
);

router.get(
  '/groups/:groupId/balances/simplified',
  authenticate,
  validate({ params: balanceGroupParamsSchema }),
  asyncHandler(async (req, res) =>
    sendData(res, await balancesService.getSimplifiedBalances(req.user.id, String(req.params.groupId))),
  ),
);

export default router;
