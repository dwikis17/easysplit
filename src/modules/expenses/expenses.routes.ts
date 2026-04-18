import { Router } from 'express';

import { asyncHandler } from '../../lib/async-handler.js';
import { sendData, sendNoContent } from '../../lib/response.js';
import { authenticate } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import * as expenseService from './expenses.service.js';
import {
  createExpenseSchema,
  expenseGroupParamsSchema,
  expenseParamsSchema,
  listExpensesQuerySchema,
  updateExpenseSchema,
} from './expenses.types.js';

const router = Router();

router.post(
  '/groups/:groupId/expenses',
  authenticate,
  validate({ params: expenseGroupParamsSchema, body: createExpenseSchema }),
  asyncHandler(async (req, res) =>
    sendData(
      res,
      await expenseService.createExpense(req.user.id, String(req.params.groupId), req.body, req.header('idempotency-key') ?? undefined),
      201,
    ),
  ),
);

router.get(
  '/groups/:groupId/expenses',
  authenticate,
  validate({ params: expenseGroupParamsSchema, query: listExpensesQuerySchema }),
  asyncHandler(async (req, res) => sendData(res, await expenseService.listExpenses(req.user.id, String(req.params.groupId), req.query))),
);

router.get(
  '/expenses/:expenseId',
  authenticate,
  validate({ params: expenseParamsSchema }),
  asyncHandler(async (req, res) => sendData(res, await expenseService.getExpense(req.user.id, String(req.params.expenseId)))),
);

router.patch(
  '/expenses/:expenseId',
  authenticate,
  validate({ params: expenseParamsSchema, body: updateExpenseSchema }),
  asyncHandler(async (req, res) => sendData(res, await expenseService.updateExpense(req.user.id, String(req.params.expenseId), req.body))),
);

router.delete(
  '/expenses/:expenseId',
  authenticate,
  validate({ params: expenseParamsSchema }),
  asyncHandler(async (req, res) => {
    await expenseService.deleteExpense(req.user.id, String(req.params.expenseId));
    return sendNoContent(res);
  }),
);

export default router;
