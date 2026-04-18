import { Router } from 'express';

import { asyncHandler } from '../../lib/async-handler.js';
import { sendData, sendNoContent } from '../../lib/response.js';
import { authenticate } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import * as settlementService from './settlements.service.js';
import {
  createSettlementSchema,
  listSettlementsQuerySchema,
  settlementGroupParamsSchema,
  settlementParamsSchema,
} from './settlements.types.js';

const router = Router();

router.post(
  '/groups/:groupId/settlements',
  authenticate,
  validate({ params: settlementGroupParamsSchema, body: createSettlementSchema }),
  asyncHandler(async (req, res) =>
    sendData(
      res,
      await settlementService.createSettlement(
        req.user.id,
        String(req.params.groupId),
        req.body,
        req.header('idempotency-key') ?? undefined,
      ),
      201,
    ),
  ),
);

router.get(
  '/groups/:groupId/settlements',
  authenticate,
  validate({ params: settlementGroupParamsSchema, query: listSettlementsQuerySchema }),
  asyncHandler(async (req, res) =>
    sendData(res, await settlementService.listSettlements(req.user.id, String(req.params.groupId), req.query)),
  ),
);

router.get(
  '/settlements/:settlementId',
  authenticate,
  validate({ params: settlementParamsSchema }),
  asyncHandler(async (req, res) => sendData(res, await settlementService.getSettlement(req.user.id, String(req.params.settlementId)))),
);

router.delete(
  '/settlements/:settlementId',
  authenticate,
  validate({ params: settlementParamsSchema }),
  asyncHandler(async (req, res) => {
    await settlementService.deleteSettlement(req.user.id, String(req.params.settlementId));
    return sendNoContent(res);
  }),
);

export default router;
