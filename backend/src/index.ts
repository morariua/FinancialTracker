/// <reference path="./types/express.d.ts" />
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from './config/env';
import { migrate } from './db/database';
import { errorHandler, notFound } from './middleware/error';
import { generalLimiter } from './middleware/rateLimit';
import authRoutes from './routes/auth.routes';
import categoryRoutes from './routes/categories.routes';
import accountRoutes from './routes/accounts.routes';
import transactionRoutes from './routes/transactions.routes';
import budgetRoutes from './routes/budgets.routes';
import billRoutes from './routes/bills.routes';
import alertRoutes from './routes/alerts.routes';
import dashboardRoutes from './routes/dashboard.routes';
import settingsRoutes from './routes/settings.routes';
import plaidRoutes from './routes/plaid.routes';
import { startSchedulers } from './jobs/scheduler';

migrate();

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);
app.use(
  cors({
    origin: env.corsOrigin.split(',').map((s) => s.trim()),
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  })
);
app.use(express.json({ limit: '6mb' }));
app.use(cookieParser());
app.use(generalLimiter);

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/accounts', accountRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/budgets', budgetRoutes);
app.use('/api/bills', billRoutes);
app.use('/api/alerts', alertRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/plaid', plaidRoutes);

app.use(notFound);
app.use(errorHandler);

if (require.main === module) {
  startSchedulers();
  app.listen(env.port, () => {
    // eslint-disable-next-line no-console
    console.log(`[server] Financial tracker API on http://localhost:${env.port}`);
  });
}

export default app;
