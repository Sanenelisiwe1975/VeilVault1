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
  const rid = (req as Request & { id?: string }).id;
  const authHeader = req.headers['authorization'];
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'Missing Bearer token', requestId: rid });
    return;
  }

  const token = authHeader.slice(7);

  // ── 1. Session token (passkey / SEP-10) ─────────────────────────────────────
  // Checked FIRST: it carries the wallet identity. When API_KEY_HASH is unset
  // (dev), the static-key branch below accepts ANY token — if that ran first,
  // valid session tokens would be misclassified as API keys and never set
  // req.walletAddress, breaking every passkey transaction route in dev.
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

    // ── 2. Static API key (exact match; any token accepted when unset in dev) ──
    if (!config.API_KEY_HASH || sha256Hex(token) === config.API_KEY_HASH) {
      req.agentId = req.headers['x-agent-id'] as string | undefined;
      req.isAdmin = req.headers['x-admin-key'] === process.env.ADMIN_KEY;
      next();
      return;
    }

    log.warn({ ip: req.ip }, 'Invalid token attempt');
    res.status(403).json({ success: false, error: 'Invalid or expired token', requestId: rid });
  }).catch(() => {
    res.status(403).json({ success: false, error: 'Invalid API key', requestId: rid });
  });
}

/** Attach a request ID for tracing. */
export function requestId(req: Request, _res: Response, next: NextFunction): void {
  (req as Request & { id: string }).id = crypto.randomUUID();
  next();
}
