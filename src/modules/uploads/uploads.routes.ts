import { Router } from 'express';

import { asyncHandler } from '../../lib/async-handler.js';
import { sendData } from '../../lib/response.js';
import { authenticate } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import * as uploadService from './uploads.service.js';
import { receiptPresignSchema } from './uploads.types.js';

const router = Router();

router.post(
  '/uploads/receipts/presign',
  authenticate,
  validate({ body: receiptPresignSchema }),
  asyncHandler(async (req, res) => sendData(res, await uploadService.presignReceiptUpload(req.user.id, req.body), 201)),
);

export default router;
