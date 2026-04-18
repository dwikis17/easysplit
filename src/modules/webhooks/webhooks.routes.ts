import { Router } from 'express';

import { asyncHandler } from '../../lib/async-handler.js';
import { sendData } from '../../lib/response.js';
import * as webhookService from './webhooks.service.js';

const router = Router();

router.post(
  '/webhooks/revenuecat',
  asyncHandler(async (req, res) => {
    return sendData(res, await webhookService.handleRevenueCatWebhook(req.body, req.header('authorization') ?? undefined));
  }),
);

export default router;
