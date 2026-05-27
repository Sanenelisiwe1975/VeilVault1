import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { requestId, apiKeyAuth } from './middleware/auth.middleware';
import vaultRoutes from './routes/vault.routes';
import agentRoutes from './routes/agent.routes';
import paymentRoutes from './routes/payment.routes';
import strategyRoutes from './routes/strategy.routes';
import agentRegistryRoutes from './routes/agent-registry.routes';
import marketplaceRoutes from './routes/marketplace.routes';
import stokvelRoutes from './routes/stokvel.routes';
import attestationRoutes from './routes/attestation.routes';
import multiAgentRoutes from './routes/multi-agent.routes';
import { createChildLogger } from '../utils/logger';

const log = createChildLogger('server');

export function createServer(): express.Application {
  const app = express();

  // Security & parsing

  app.use(helmet());
  app.use(cors({
    origin: process.env.CORS_ORIGINS?.split(',') ?? '*',
    methods: ['GET', 'POST', 'DELETE', 'PATCH'],
  }));
  app.use(express.json({ limit: '1mb' }));
  app.use(requestId);

  // Rate limiting

  app.use('/api', rateLimit({
    windowMs: 60_000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Too many requests' },
  }));

  // Health check (public)

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', version: process.env.npm_package_version ?? '0.1.0', ts: Date.now() });
  });

  // Authenticated API routes

  app.use('/api', apiKeyAuth);
  app.use('/api/vault', vaultRoutes);
  app.use('/api/agents', agentRoutes);
  app.use('/api/payments', paymentRoutes);
  app.use('/api/strategies', strategyRoutes);
  app.use('/api/registry', agentRegistryRoutes);
  app.use('/api/marketplace', marketplaceRoutes);
  app.use('/api/stokvel', stokvelRoutes);
  app.use('/api/attestations', attestationRoutes);
  app.use('/api/multi-agent', multiAgentRoutes);

  // Global error handler

  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    log.error({ err: err.message, stack: err.stack }, 'Unhandled error');
    res.status(500).json({ success: false, error: 'Internal server error' });
  });

  return app;
}
