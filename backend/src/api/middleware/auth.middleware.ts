import { Request, Response, NextFunction } from 'express';
import { sha256Hex } from '../../utils/crypto';
import { config } from '../../config';
import { createChildLogger } from '../../utils/logger';

const log = createChildLogger('auth-middleware');

declare module 'express-serve-static-core' {
  interface Request {
    agentId?: string;
    isAdmin?: boolean;
  }
}

/** Validate a Bearer API key against the configured hash. */
export function apiKeyAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'Missing Bearer token', requestId: req.id });
    return;
  }

  const token = authHeader.slice(7);
  const tokenHash = sha256Hex(token);

  if (config.API_KEY_HASH && tokenHash !== config.API_KEY_HASH) {
    log.warn({ ip: req.ip }, 'Invalid API key attempt');
    res.status(403).json({ success: false, error: 'Invalid API key', requestId: req.id });
    return;
  }

  // Extract agent ID from custom header
  req.agentId = req.headers['x-agent-id'] as string | undefined;
  req.isAdmin = req.headers['x-admin-key'] === process.env.ADMIN_KEY;

  next();
}

/** Attach a request ID for tracing. */
export function requestId(req: Request, _res: Response, next: NextFunction): void {
  (req as Request & { id: string }).id = crypto.randomUUID();
  next();
}
