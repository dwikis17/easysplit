import { Router } from 'express';

import { asyncHandler } from '../../lib/async-handler.js';
import { sendData, sendNoContent } from '../../lib/response.js';
import { authenticate } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import * as inviteService from './invites.service.js';
import {
  createInviteSchema,
  groupInviteParamsSchema,
  inviteParamsSchema,
  listPendingInvitesSchema,
} from './invites.types.js';

const router = Router();

router.post(
  '/groups/:groupId/invites',
  authenticate,
  validate({ params: groupInviteParamsSchema, body: createInviteSchema }),
  asyncHandler(async (req, res) =>
    sendData(res, await inviteService.createInvite(req.user.id, String(req.params.groupId), req.body.email), 201),
  ),
);

router.get(
  '/groups/:groupId/invites',
  authenticate,
  validate({ params: groupInviteParamsSchema }),
  asyncHandler(async (req, res) => sendData(res, await inviteService.listGroupInvites(req.user.id, String(req.params.groupId)))),
);

router.get(
  '/invites',
  authenticate,
  validate({ query: listPendingInvitesSchema }),
  asyncHandler(async (req, res) => sendData(res, await inviteService.listPendingInvites(req.user.id, typeof req.query.status === 'string' ? req.query.status : undefined))),
);

router.post(
  '/invites/:inviteId/accept',
  authenticate,
  validate({ params: inviteParamsSchema }),
  asyncHandler(async (req, res) => {
    await inviteService.acceptInvite(req.user.id, String(req.params.inviteId));
    return sendNoContent(res);
  }),
);

router.post(
  '/invites/:inviteId/decline',
  authenticate,
  validate({ params: inviteParamsSchema }),
  asyncHandler(async (req, res) => {
    await inviteService.declineInvite(req.user.id, String(req.params.inviteId));
    return sendNoContent(res);
  }),
);

router.post(
  '/invites/:inviteId/revoke',
  authenticate,
  validate({ params: inviteParamsSchema }),
  asyncHandler(async (req, res) => {
    await inviteService.revokeInvite(req.user.id, String(req.params.inviteId));
    return sendNoContent(res);
  }),
);

export default router;
