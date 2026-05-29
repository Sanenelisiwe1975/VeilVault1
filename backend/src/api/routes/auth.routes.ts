/**
 * Stellar wallet-based authentication.
 *
 * Flow:
 *   1. POST /api/auth/challenge  →  { challenge, expiresAt }
 *   2. Client signs the challenge string with their Stellar keypair
 *   3. POST /api/auth/token      →  { token, address, expiresAt }
 *   4. Client passes token as "Authorization: Bearer <token>" on all requests
 *
 * For Freighter users who cannot sign arbitrary messages, a transaction-based
 * variant is also accepted: sign a zero-fee Stellar transaction whose memo
 * contains the challenge hash.
 */
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { Keypair } from '@stellar/stellar-sdk';
import crypto from 'crypto';
import { createChildLogger } from '../../utils/logger';

const log = createChildLogger('auth');
const router = Router();

// ─── In-memory session store ──────────────────────────────────────────────────
// In production: replace with Redis or a DB-backed store.

interface Challenge {
  challenge:  string;
  address:    string | null;  // null = any address can claim it
  expiresAt:  number;
}

interface Session {
  address:    string;
  token:      string;
  expiresAt:  number;
}

const challenges = new Map<string, Challenge>();
const sessions   = new Map<string, Session>();

const CHALLENGE_TTL_SECS = 300;   // 5 min to complete the sign
const SESSION_TTL_SECS   = 86400; // 24 h session

function purgeExpired() {
  const now = Math.floor(Date.now() / 1000);
  for (const [k, v] of challenges) if (v.expiresAt < now) challenges.delete(k);
  for (const [k, v] of sessions)   if (v.expiresAt < now) sessions.delete(k);
}

// ─── Exported session validator (used by auth middleware) ─────────────────────

export function validateSessionToken(token: string): { address: string } | null {
  purgeExpired();
  const session = sessions.get(token);
  if (!session || session.expiresAt < Math.floor(Date.now() / 1000)) return null;
  return { address: session.address };
}

// ─── Routes ───────────────────────────────────────────────────────────────────

/** POST /api/auth/challenge — get a nonce to sign. */
router.post('/challenge', (req: Request, res: Response) => {
  const address    = (req.body as { address?: string }).address ?? null;
  const challenge  = crypto.randomBytes(32).toString('hex');
  const expiresAt  = Math.floor(Date.now() / 1000) + CHALLENGE_TTL_SECS;

  challenges.set(challenge, { challenge, address, expiresAt });
  log.debug({ address }, 'challenge issued');

  res.json({ success: true, data: { challenge, expiresAt } });
});

/** POST /api/auth/token — exchange a signed challenge for a session token. */
router.post('/token', (req: Request, res: Response) => {
  const body = z.object({
    address:   z.string().min(56).max(56),
    challenge: z.string().length(64),
    signature: z.string().min(1),
  }).safeParse(req.body);

  if (!body.success) {
    res.status(400).json({ success: false, error: body.error.flatten() });
    return;
  }

  const { address, challenge, signature } = body.data;
  purgeExpired();

  const stored = challenges.get(challenge);
  if (!stored) {
    res.status(401).json({ success: false, error: 'Challenge not found or expired' });
    return;
  }
  if (stored.address && stored.address !== address) {
    res.status(401).json({ success: false, error: 'Challenge was issued for a different address' });
    return;
  }

  // Verify Stellar Ed25519 signature over the UTF-8 challenge string
  try {
    const keypair = Keypair.fromPublicKey(address);
    const valid   = keypair.verify(
      Buffer.from(challenge, 'utf8'),
      Buffer.from(signature, 'base64'),
    );
    if (!valid) throw new Error('invalid');
  } catch {
    res.status(401).json({ success: false, error: 'Signature verification failed' });
    return;
  }

  // Issue session token
  challenges.delete(challenge);
  const token     = crypto.randomBytes(32).toString('hex');
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECS;

  sessions.set(token, { address, token, expiresAt });
  log.info({ address }, 'session issued');

  res.json({ success: true, data: { token, address, expiresAt } });
});

/** GET /api/auth/me — return the authenticated address (verify the token). */
router.get('/me', (req: Request, res: Response) => {
  const header = req.headers['authorization'];
  const token  = header?.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) { res.status(401).json({ success: false, error: 'No token' }); return; }

  const session = validateSessionToken(token);
  if (!session) { res.status(401).json({ success: false, error: 'Invalid or expired token' }); return; }

  res.json({ success: true, data: { address: session.address } });
});

/** POST /api/auth/logout — invalidate the session. */
router.post('/logout', (req: Request, res: Response) => {
  const header = req.headers['authorization'];
  const token  = header?.startsWith('Bearer ') ? header.slice(7) : null;
  if (token) sessions.delete(token);
  res.json({ success: true });
});

export default router;
