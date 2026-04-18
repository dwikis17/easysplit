import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';

import { env } from './lib/env.js';
import { errorHandler } from './middleware/error-handler.js';
import { requestContext } from './middleware/request-context.js';
import authRoutes from './modules/auth/auth.routes.js';
import healthRoutes from './modules/health/health.routes.js';
import meRoutes from './modules/me/me.routes.js';
import groupRoutes from './modules/groups/groups.routes.js';
import inviteRoutes from './modules/invites/invites.routes.js';
import expenseRoutes from './modules/expenses/expenses.routes.js';
import settlementRoutes from './modules/settlements/settlements.routes.js';
import balanceRoutes from './modules/balances/balances.routes.js';
import analyticsRoutes from './modules/analytics/analytics.routes.js';
import activityRoutes from './modules/activity/activity.routes.js';
import entitlementRoutes from './modules/entitlements/entitlements.routes.js';
import uploadRoutes from './modules/uploads/uploads.routes.js';
import webhookRoutes from './modules/webhooks/webhooks.routes.js';

const app = express();

app.use(helmet());
app.use(cors({ origin: env.CORS_ORIGIN === '*' ? true : env.CORS_ORIGIN, credentials: true }));
app.use(express.json());
app.use(morgan('dev'));
app.use(requestContext);

app.use('/health', healthRoutes);
app.use('/v1/auth', authRoutes);
app.use('/v1', meRoutes);
app.use('/v1', groupRoutes);
app.use('/v1', inviteRoutes);
app.use('/v1', expenseRoutes);
app.use('/v1', settlementRoutes);
app.use('/v1', balanceRoutes);
app.use('/v1', analyticsRoutes);
app.use('/v1', activityRoutes);
app.use('/v1', entitlementRoutes);
app.use('/v1', uploadRoutes);
app.use('/v1', webhookRoutes);

app.use(errorHandler);

export default app;
