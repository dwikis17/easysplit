import { Router } from 'express';

import { asyncHandler } from '../../lib/async-handler.js';
import { sendData } from '../../lib/response.js';
import { authenticate } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import * as analyticsService from './analytics.service.js';
import { analyticsGroupParamsSchema, analyticsRangeSchema, timelineQuerySchema } from './analytics.types.js';

const router = Router();

router.get(
  '/groups/:groupId/analytics/summary',
  authenticate,
  validate({ params: analyticsGroupParamsSchema, query: analyticsRangeSchema }),
  asyncHandler(async (req, res) => sendData(res, await analyticsService.getSummary(req.user.id, String(req.params.groupId), req.query))),
);

router.get(
  '/groups/:groupId/analytics/by-member',
  authenticate,
  validate({ params: analyticsGroupParamsSchema }),
  asyncHandler(async (req, res) => sendData(res, await analyticsService.getByMember(req.user.id, String(req.params.groupId)))),
);

router.get(
  '/groups/:groupId/analytics/by-category',
  authenticate,
  validate({ params: analyticsGroupParamsSchema }),
  asyncHandler(async (req, res) => sendData(res, await analyticsService.getByCategory(req.user.id, String(req.params.groupId)))),
);

router.get(
  '/groups/:groupId/analytics/timeline',
  authenticate,
  validate({ params: analyticsGroupParamsSchema, query: timelineQuerySchema }),
  asyncHandler(async (req, res) =>
    sendData(
      res,
      await analyticsService.getTimeline(req.user.id, String(req.params.groupId), {
        granularity:
          typeof req.query.granularity === 'string' && ['day', 'week', 'month'].includes(req.query.granularity)
            ? (req.query.granularity as 'day' | 'week' | 'month')
            : 'day',
        from_date: typeof req.query.from_date === 'string' ? req.query.from_date : undefined,
        to_date: typeof req.query.to_date === 'string' ? req.query.to_date : undefined,
      }),
    ),
  ),
);

export default router;
