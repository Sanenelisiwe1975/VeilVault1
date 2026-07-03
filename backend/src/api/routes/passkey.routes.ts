/**
 * Passkey sign-in (account-abstraction option).
 *
 * Mirrors the SEP-10 flow's request/response shape (issues the same kind of
 * session JWT) but the credential is a WebAuthn passkey bound to a deployed
 * `smart-wallet` Soroban contract instead of a Stellar keypair signature.
 *
 *   Registration: POST /register/options -> POST /register/verify
 *   Login:        POST /login/options    -> POST /login/verify
 */
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import {
  startPasskeyRegistration,
  finishPasskeyRegistration,
  startPasskeyLogin,
  finishPasskeyLogin,
} from '../../services/passkey.service';
import { createChildLogger } from '../../utils/logger';

const log = createChildLogger('passkey-routes');
const router = Router();

router.post('/register/options', async (req: Request, res: Response) => {
  const body = z.object({ userName: z.string().min(1).max(120) }).safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: 'Missing or invalid "userName" field' });
    return;
  }
  try {
    const { sessionId, options } = await startPasskeyRegistration(body.data.userName);
    res.json({ sessionId, options });
  } catch (err) {
    log.error({ err: (err as Error).message }, 'Failed to start passkey registration');
    // Config errors carry an actionable message ("not configured on this
    // server") — pass it through so the UI can explain instead of guessing.
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post('/register/verify', async (req: Request, res: Response) => {
  const body = z.object({
    sessionId: z.string().min(1),
    response: z.record(z.any()),
  }).safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: 'Missing "sessionId" or "response" field' });
    return;
  }
  try {
    const { walletAddress, token } = await finishPasskeyRegistration(
      body.data.sessionId,
      body.data.response as any,
    );
    res.json({ walletAddress, token });
  } catch (err) {
    log.warn({ err: (err as Error).message }, 'Passkey registration verification failed');
    res.status(401).json({ error: (err as Error).message });
  }
});

router.post('/login/options', async (_req: Request, res: Response) => {
  // No wallet address needed — the browser offers every discoverable
  // passkey for this origin, and the assertion's credential id tells
  // finishPasskeyLogin which wallet (via passkey-registry) to resolve.
  try {
    const { sessionId, options } = await startPasskeyLogin();
    res.json({ sessionId, options });
  } catch (err) {
    log.error({ err: (err as Error).message }, 'Failed to start passkey login');
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post('/login/verify', async (req: Request, res: Response) => {
  const body = z.object({
    sessionId: z.string().min(1),
    response: z.record(z.any()),
  }).safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: 'Missing "sessionId" or "response" field' });
    return;
  }
  try {
    const { walletAddress, token } = await finishPasskeyLogin(
      body.data.sessionId,
      body.data.response as any,
    );
    res.json({ walletAddress, token });
  } catch (err) {
    log.warn({ err: (err as Error).message }, 'Passkey login verification failed');
    res.status(401).json({ error: (err as Error).message });
  }
});

export default router;
