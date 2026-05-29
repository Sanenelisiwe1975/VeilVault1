import { Request, Response, NextFunction } from 'express';
import { sha256Hex } from '../../utils/crypto';
import { config } from '../../config';
import { createChildLogger } from '../../utils/logger';

const log = createChildLogger('auth-middleware');

declare module 'express-serve-static-core' {
  interface Request {
    agentId?:       string;
    isAdmin?:       boolean;
    walletAddress?: string;   // set when authenticated via session token
  }
}

/**
 * Validate a Bearer token — accepts two forms:
 *   1. Static API key (hash matches API_KEY_HASH in .env)
 *   2. Session token issued by POST /api/auth/token
 *
 * Sets req.walletAddress when authenticated via session token.
 */
export function apiKeyAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'Missing Bearer token', requestId: req.id });
    return;
  }

  const token     = authHeader.slice(7);
  const tokenHash = sha256Hex(token);

  // ── 1. Static API key ────────────────────────────────────────────────────────
  if (!config.API_KEY_HASH || tokenHash === config.API_KEY_HASH) {
    req.agentId = req.headers['x-agent-id'] as string | undefined;
    req.isAdmin = req.headers['x-admin-key'] === process.env.ADMIN_KEY;
    next();
    return;
  }

  // ── 2. Session token from /api/auth/token ─────────────────────────────────
  // Dynamic import avoids a circular-dependency with auth.routes.ts at startup.
  import('../routes/auth.routes').then(({ validateSessionToken }) => {
    const session = validateSessionToken(token);
    if (session) {
      req.walletAddress = session.address;
      req.agentId       = session.address;
      req.isAdmin       = req.headers['x-admin-key'] === process.env.ADMIN_KEY;
      next();
      return;
    }

    log.warn({ ip: req.ip }, 'Invalid token attempt');
    res.status(403).json({ success: false, error: 'Invalid or expired token', requestId: req.id });
  }).catch(() => {
    res.status(403).json({ success: false, error: 'Invalid API key', requestId: req.id });
  });
}

/** Attach a request ID for tracing. */
export function requestId(req: Request, _res: Response, next: NextFunction): void {
  (req as Request & { id: string }).id = crypto.randomUUID();
  next();
}
