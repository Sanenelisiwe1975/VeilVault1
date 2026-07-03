/**
 * SEP-10 Stellar Web Authentication.
 * https://stellar.org/protocol/sep-10
 *
 * Flow:
 *   1. GET  /api/auth?account=G...        -> { transaction, network_passphrase }
 *   2. Client signs the returned challenge transaction with their Stellar keypair
 *      (or Freighter / Lobstr) WITHOUT submitting it to the network.
 *   3. POST /api/auth { transaction: <signed envelope xdr> } -> { token }
 *   4. Client passes token as "Authorization: Bearer <token>" on all requests.
 *
 * Any standard SEP-10 wallet can authenticate against this endpoint, not just
 * the VeilVault1 frontend, since the request/response shapes follow the spec.
 */
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { Keypair, WebAuth } from '@stellar/stellar-sdk';
import jwt from 'jsonwebtoken';
import { config, STELLAR_NETWORKS } from '../../config';
import { createChildLogger } from '../../utils/logger';

const log = createChildLogger('auth');
const router = Router();

const networkPassphrase = STELLAR_NETWORKS[config.STELLAR_NETWORK].passphrase;
// || not ??: an empty string in .env (SEP10_SIGNING_SECRET_KEY=) must also fall back
const signingSecret = config.SEP10_SIGNING_SECRET_KEY || config.ADMIN_SECRET_KEY;
const serverKeypair = Keypair.fromSecret(signingSecret);

const CHALLENGE_TIMEOUT_SECS = 300; // 5 min to complete the sign
const SESSION_TTL_SECS = 86400; // 24 h session

log.info({ signingKey: serverKeypair.publicKey() }, 'SEP-10 server signing key (publish in stellar.toml as SIGNING_KEY)');

// ─── JWT session helpers ────────────────────────────────────────────────────

function issueToken(address: string): string {
  return jwt.sign({ sub: address }, config.JWT_SECRET, { expiresIn: SESSION_TTL_SECS });
}

/** Exported session validator (used by the apiKeyAuth middleware). */
export function validateSessionToken(token: string): { address: string } | null {
  try {
    const payload = jwt.verify(token, config.JWT_SECRET) as { sub?: string };
    if (!payload.sub) return null;
    return { address: payload.sub };
  } catch {
    return null;
  }
}

// ─── Routes ─────────────────────────────────────────────────────────────────

/** GET /api/auth — request a SEP-10 challenge transaction. */
router.get('/', (req: Request, res: Response) => {
  const account = (req.query.account as string | undefined)?.trim();
  if (!account || (!account.startsWith('G') && !account.startsWith('M')) || account.length !== 56) {
    res.status(400).json({ error: 'Missing or invalid "account" query parameter' });
    return;
  }
  const clientDomain = (req.query.client_domain as string | undefined) || null;

  try {
    const transaction = WebAuth.buildChallengeTx(
      serverKeypair,
      account,
      config.HOME_DOMAIN,
      CHALLENGE_TIMEOUT_SECS,
      networkPassphrase,
      config.WEB_AUTH_DOMAIN,
      null,
      clientDomain,
    );
    log.debug({ account }, 'SEP-10 challenge issued');
    res.json({ transaction, network_passphrase: networkPassphrase });
  } catch (err) {
    log.error({ err: (err as Error).message }, 'Failed to build SEP-10 challenge');
    res.status(500).json({ error: 'Failed to build challenge transaction' });
  }
});

/** POST /api/auth — exchange a signed SEP-10 challenge for a session token (JWT). */
router.post('/', (req: Request, res: Response) => {
  const body = z.object({ transaction: z.string().min(1) }).safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: 'Missing "transaction" field' });
    return;
  }

  try {
    const { clientAccountID } = WebAuth.readChallengeTx(
      body.data.transaction,
      serverKeypair.publicKey(),
      networkPassphrase,
      [config.HOME_DOMAIN],
      config.WEB_AUTH_DOMAIN,
    );

    // Single-signer accounts: the only valid client signer is the account itself.
    // (Multisig accounts would need verifyChallengeTxThreshold with Horizon signer weights.)
    WebAuth.verifyChallengeTxSigners(
      body.data.transaction,
      serverKeypair.publicKey(),
      networkPassphrase,
      [clientAccountID],
      [config.HOME_DOMAIN],
      config.WEB_AUTH_DOMAIN,
    );

    const token = issueToken(clientAccountID);
    log.info({ address: clientAccountID }, 'SEP-10 session issued');
    res.json({ token });
  } catch (err) {
    log.warn({ err: (err as Error).message }, 'SEP-10 verification failed');
    res.status(401).json({ error: 'Challenge verification failed' });
  }
});

/** GET /api/auth/me — return the authenticated address for the current token. */
router.get('/me', (req: Request, res: Response) => {
  const header = req.headers['authorization'];
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) { res.status(401).json({ success: false, error: 'No token' }); return; }

  const session = validateSessionToken(token);
  if (!session) { res.status(401).json({ success: false, error: 'Invalid or expired token' }); return; }

  res.json({ success: true, data: { address: session.address } });
});

/** POST /api/auth/logout — JWTs are stateless; the client simply discards the token. */
router.post('/logout', (_req: Request, res: Response) => {
  res.json({ success: true });
});

export default router;
