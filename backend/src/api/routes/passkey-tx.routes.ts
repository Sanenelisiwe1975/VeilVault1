/**
 * Authorize an arbitrary Soroban contract invocation as the caller's own
 * passkey wallet — the same prepare/sign/submit mechanism that powers
 * add-backup-passkey (see passkey-signer.routes.ts), generalized to any
 * contract/method/args instead of being hard-coded to `add_signer`.
 *
 * req.walletAddress (from the authenticated session) is always the address
 * whose on-chain auth is being satisfied — a caller can only ever authorize
 * a transaction as their own wallet, never someone else's.
 *
 *   POST /prepare { contractId, method, args } -> WebAuthn authentication options
 *                                                   (must be signed by an EXISTING passkey on this wallet)
 *   POST /submit  { sessionId, response }      -> submits the call on-chain
 */
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { startPasskeyTransaction, finishPasskeyTransaction } from '../../services/passkey.service';
import { createChildLogger } from '../../utils/logger';

const log = createChildLogger('passkey-tx-routes');
const router = Router();

function requireWalletAddress(req: Request, res: Response): string | null {
  if (!req.walletAddress) {
    res.status(401).json({ error: 'A passkey or SEP-10 session is required (static API key has no wallet identity)' });
    return null;
  }
  return req.walletAddress;
}

const argSpecSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('u32'), value: z.number().int().min(0) }),
  z.object({ type: z.literal('u64'), value: z.string().regex(/^\d+$/) }),
  z.object({ type: z.literal('i128'), value: z.string().regex(/^-?\d+$/) }),
  z.object({ type: z.literal('bytes'), value: z.string() }),
  z.object({ type: z.literal('address'), value: z.string() }),
  z.object({ type: z.literal('string'), value: z.string() }),
  z.object({ type: z.literal('symbol'), value: z.string() }),
  z.object({ type: z.literal('bool'), value: z.boolean() }),
]);

router.post('/prepare', async (req: Request, res: Response) => {
  const walletAddress = requireWalletAddress(req, res);
  if (!walletAddress) return;

  const body = z.object({
    contractId: z.string().min(1),
    method: z.string().min(1),
    args: z.array(argSpecSchema).default([]),
  }).safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: 'Missing or invalid "contractId", "method", or "args" field' });
    return;
  }

  try {
    const { sessionId, options } = await startPasskeyTransaction(
      walletAddress,
      body.data.contractId,
      body.data.method,
      body.data.args,
    );
    res.json({ sessionId, options });
  } catch (err) {
    log.error({ err: (err as Error).message, contractId: body.data.contractId, method: body.data.method }, 'Failed to prepare passkey transaction');
    res.status(500).json({ error: 'Failed to prepare transaction' });
  }
});

router.post('/submit', async (req: Request, res: Response) => {
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
    const result = await finishPasskeyTransaction(body.data.sessionId, body.data.response as any);
    res.json(result);
  } catch (err) {
    log.warn({ err: (err as Error).message }, 'Passkey transaction submission failed');
    res.status(401).json({ error: (err as Error).message });
  }
});

export default router;
