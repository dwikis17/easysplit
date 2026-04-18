import { Router } from 'express';

import { asyncHandler } from '../../lib/async-handler.js';
import { sendData, sendNoContent } from '../../lib/response.js';
import { authenticate } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import * as groupsService from './groups.service.js';
import {
  createGroupSchema,
  groupParamsSchema,
  listGroupsSchema,
  listMembersSchema,
  memberParamsSchema,
  transferOwnershipSchema,
  updateGroupSchema,
  updateMemberSchema,
} from './groups.types.js';

const router = Router();

router.post(
  '/groups',
  authenticate,
  validate({ body: createGroupSchema }),
  asyncHandler(async (req, res) => sendData(res, await groupsService.createGroup(req.user.id, req.body), 201)),
);

router.get(
  '/groups',
  authenticate,
  validate({ query: listGroupsSchema }),
  asyncHandler(async (req, res) => sendData(res, await groupsService.listGroups(req.user.id, req.query))),
);

router.get(
  '/groups/:groupId',
  authenticate,
  validate({ params: groupParamsSchema }),
  asyncHandler(async (req, res) => sendData(res, await groupsService.getGroup(req.user.id, String(req.params.groupId)))),
);

router.patch(
  '/groups/:groupId',
  authenticate,
  validate({ params: groupParamsSchema, body: updateGroupSchema }),
  asyncHandler(async (req, res) =>
    sendData(res, await groupsService.updateGroup(req.user.id, String(req.params.groupId), req.body)),
  ),
);

router.post(
  '/groups/:groupId/archive',
  authenticate,
  validate({ params: groupParamsSchema }),
  asyncHandler(async (req, res) =>
    sendData(res, await groupsService.setArchiveState(req.user.id, String(req.params.groupId), true)),
  ),
);

router.post(
  '/groups/:groupId/restore',
  authenticate,
  validate({ params: groupParamsSchema }),
  asyncHandler(async (req, res) =>
    sendData(res, await groupsService.setArchiveState(req.user.id, String(req.params.groupId), false)),
  ),
);

router.get(
  '/groups/:groupId/members',
  authenticate,
  validate({ params: groupParamsSchema, query: listMembersSchema }),
  asyncHandler(async (req, res) =>
    sendData(
      res,
      await groupsService.listMembers(req.user.id, String(req.params.groupId), req.query.include_inactive === 'true'),
    ),
  ),
);

router.patch(
  '/groups/:groupId/members/:userId',
  authenticate,
  validate({ params: memberParamsSchema, body: updateMemberSchema }),
  asyncHandler(async (req, res) =>
    sendData(
      res,
      await groupsService.updateMember(req.user.id, String(req.params.groupId), String(req.params.userId), req.body),
    ),
  ),
);

router.post(
  '/groups/:groupId/leave',
  authenticate,
  validate({ params: groupParamsSchema }),
  asyncHandler(async (req, res) => {
    await groupsService.leaveGroup(req.user.id, String(req.params.groupId));
    return sendNoContent(res);
  }),
);

router.post(
  '/groups/:groupId/transfer-ownership',
  authenticate,
  validate({ params: groupParamsSchema, body: transferOwnershipSchema }),
  asyncHandler(async (req, res) => {
    await groupsService.transferOwnership(req.user.id, String(req.params.groupId), req.body.new_owner_user_id);
    return sendNoContent(res);
  }),
);

export default router;
