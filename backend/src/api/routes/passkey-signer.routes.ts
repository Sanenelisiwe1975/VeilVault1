/**
 * Add a backup passkey to the caller's own wallet (recovery).
 *
 * Unlike /api/auth/passkey/*, these routes require an authenticated session
 * (a passkey- or SEP-10-issued JWT) — req.walletAddress is read from that
 * session rather than trusted from the request body, so a caller can only
 * ever add a backup signer to their own wallet.
 *
 *   POST /add/options         { userName } -> WebAuthn registration options
 *   POST /add/register-verify { sessionId, response } -> WebAuthn authentication options
 *                                                          (must be signed by an EXISTING passkey)
 *   POST /add/authorize       { sessionId, response } -> submits add_signer on-chain
 */
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import {
  startAddBackupPasskey,
  verifyBackupPasskeyRegistration,
  finishAddBackupPasskey,
} from '../../services/passkey.service';
import { createChildLogger } from '../../utils/logger';

const log = createChildLogger('passkey-signer-routes');
const router = Router();

function requireWalletAddress(req: Request, res: Response): string | null {
  if (!req.walletAddress) {
    res.status(401).json({ error: 'A passkey or SEP-10 session is required (static API key has no wallet identity)' });
    return null;
  }
  return req.walletAddress;
}

router.post('/add/options', async (req: Request, res: Response) => {
  const walletAddress = requireWalletAddress(req, res);
  if (!walletAddress) return;

  const body = z.object({ userName: z.string().min(1).max(120) }).safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: 'Missing or invalid "userName" field' });
    return;
  }
  try {
    const { sessionId, options } = await startAddBackupPasskey(walletAddress, body.data.userName);
    res.json({ sessionId, options });
  } catch (err) {
    log.error({ err: (err as Error).message }, 'Failed to start add-backup-passkey');
    res.status(500).json({ error: 'Failed to start add-backup-passkey' });
  }
});

router.post('/add/register-verify', async (req: Request, res: Response) => {
  if (!requireWalletAddress(req, res)) return;

  const body = z.object({
    sessionId: z.string().min(1),
    response: z.record(z.any()),
  }).safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: 'Missing "sessionId" or "response" field' });
    return;
  }
  try {
    const { sessionId, options } = await verifyBackupPasskeyRegistration(body.data.sessionId, body.data.response as any);
    res.json({ sessionId, options });
  } catch (err) {
    log.warn({ err: (err as Error).message }, 'Backup passkey registration verification failed');
    res.status(401).json({ error: (err as Error).message });
  }
});

router.post('/add/authorize', async (req: Request, res: Response) => {
  if (!requireWalletAddress(req, res)) return;

  const body = z.object({
    sessionId: z.string().min(1),
    response: z.record(z.any()),
  }).safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: 'Missing "sessionId" or "response" field' });
    return;
  }
  try {
    const result = await finishAddBackupPasskey(body.data.sessionId, body.data.response as any);
    res.json(result);
  } catch (err) {
    log.warn({ err: (err as Error).message }, 'Add-backup-passkey authorization failed');
    res.status(401).json({ error: (err as Error).message });
  }
});

export default router;
