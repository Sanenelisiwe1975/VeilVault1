/**
 * Passkey sign-in — the account-abstraction option.
 *
 * A user registers a passkey (Face ID / fingerprint / Windows Hello) instead
 * of pasting a Stellar secret key or installing a browser extension. The
 * passkey's public key is bound to a freshly deployed `smart-wallet` Soroban
 * contract instance (see contracts/smart-wallet) — a custom account whose
 * `__check_auth` verifies WebAuthn/secp256r1 signatures natively on-chain.
 * The contract address IS the user's Stellar wallet address.
 *
 * Sign-in itself (this service) verifies the WebAuthn assertion off-chain
 * (fast, free, no transaction) purely to issue a session JWT — the same
 * shape already issued by the SEP-10 flow in auth.routes.ts. Submitting a
 * real fund-moving transaction as this wallet (i.e. exercising the
 * contract's __check_auth on-chain) is a separate, not-yet-built capability;
 * see the README's account-abstraction section for the scope boundary.
 */
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type RegistrationResponseJSON,
  type AuthenticationResponseJSON,
  type WebAuthnCredential,
} from '@simplewebauthn/server';
import { convertCOSEtoPKCS } from '@simplewebauthn/server/helpers';
import { randomBytes } from 'crypto';
import { Keypair, Address, nativeToScVal } from '@stellar/stellar-sdk';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import { config } from '../config';
import { getStellarClient } from '../integrations/stellar/client';
import { createChildLogger } from '../utils/logger';

const log = createChildLogger('passkey');

const CHALLENGE_TTL_MS = 5 * 60_000;

interface PendingChallenge {
  challenge: string;
  kind: 'register' | 'login';
  walletAddress?: string; // set for login
  userName?: string;      // set for registration
  expiresAt: number;
}

interface PasskeyCredential {
  credentialId: string;        // base64url, as returned by the browser
  publicKeyCose: Buffer;       // raw COSE key bytes — required by @simplewebauthn's own verifier
  publicKeySec1: Buffer;       // 0x04||X||Y, 65 bytes — required by the smart-wallet contract
  counter: number;
  walletAddress: string;       // the deployed smart-wallet contract address
}

// In-memory stores (consistent with the rest of this codebase's auth/session
// state — replace with Redis/DB before scaling past a single backend instance).
const pendingChallenges = new Map<string, PendingChallenge>();
const credentialsByWallet = new Map<string, PasskeyCredential>();

function purgeExpired() {
  const now = Date.now();
  for (const [k, v] of pendingChallenges) if (v.expiresAt < now) pendingChallenges.delete(k);
}

function newSessionId(): string {
  return randomBytes(16).toString('hex');
}

const SMART_WALLET_WASM_PATH = path.resolve(__dirname, '../../../contracts/target/wasm32-unknown-unknown/release/smart_wallet.optimized.wasm');

let cachedWasmHash: Buffer | null = config.SMART_WALLET_WASM_HASH
  ? Buffer.from(config.SMART_WALLET_WASM_HASH, 'hex')
  : null;

/** Upload the smart-wallet WASM once (idempotent) and cache its hash for the process lifetime. */
async function ensureWasmUploaded(): Promise<Buffer> {
  if (cachedWasmHash) return cachedWasmHash;

  const wasm = fs.readFileSync(SMART_WALLET_WASM_PATH);
  const { wasmHash } = await getStellarClient().uploadWasm(wasm, config.ADMIN_SECRET_KEY);
  cachedWasmHash = wasmHash;
  log.warn(
    { wasmHash: wasmHash.toString('hex') },
    'smart-wallet WASM uploaded at runtime — set SMART_WALLET_WASM_HASH to skip this on future restarts',
  );
  return wasmHash;
}

// ─── Registration (sign up with a passkey) ─────────────────────────────────

export async function startPasskeyRegistration(userName: string): Promise<{
  sessionId: string;
  options: Awaited<ReturnType<typeof generateRegistrationOptions>>;
}> {
  purgeExpired();
  const options = await generateRegistrationOptions({
    rpName: config.WEBAUTHN_RP_NAME,
    rpID: config.WEBAUTHN_RP_ID,
    userName,
    attestationType: 'none',
    authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
    supportedAlgorithmIDs: [-7], // ES256 / P-256 only — matches the contract's secp256r1 verifier
  });

  const sessionId = newSessionId();
  pendingChallenges.set(sessionId, {
    challenge: options.challenge,
    kind: 'register',
    userName,
    expiresAt: Date.now() + CHALLENGE_TTL_MS,
  });
  return { sessionId, options };
}

export async function finishPasskeyRegistration(
  sessionId: string,
  response: RegistrationResponseJSON,
): Promise<{ walletAddress: string; token: string }> {
  purgeExpired();
  const pending = pendingChallenges.get(sessionId);
  if (!pending || pending.kind !== 'register') {
    throw new Error('Registration session not found or expired');
  }

  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge: pending.challenge,
    expectedOrigin: config.WEBAUTHN_ORIGIN,
    expectedRPID: config.WEBAUTHN_RP_ID,
  });
  pendingChallenges.delete(sessionId);

  if (!verification.verified || !verification.registrationInfo) {
    throw new Error('Passkey registration could not be verified');
  }

  const { credential } = verification.registrationInfo;
  const publicKeyCose = Buffer.from(credential.publicKey);
  const publicKeySec1 = Buffer.from(convertCOSEtoPKCS(credential.publicKey));
  if (publicKeySec1.length !== 65 || publicKeySec1[0] !== 0x04) {
    throw new Error('Unsupported passkey public key format (expected uncompressed secp256r1)');
  }

  const stellar = getStellarClient();
  const wasmHash = await ensureWasmUploaded();
  const adminPublicKey = Keypair.fromSecret(config.ADMIN_SECRET_KEY).publicKey();

  const { contractAddress } = await stellar.deployContract({
    wasmHash,
    deployerSecretKey: config.ADMIN_SECRET_KEY,
  });

  await stellar.invokeContract(
    contractAddress,
    'initialize',
    [
      new Address(adminPublicKey).toScVal(),
      nativeToScVal(publicKeySec1, { type: 'bytes' }),
    ],
    config.ADMIN_SECRET_KEY,
  );

  const record: PasskeyCredential = {
    credentialId: credential.id,
    publicKeyCose,
    publicKeySec1,
    counter: credential.counter,
    walletAddress: contractAddress,
  };
  credentialsByWallet.set(contractAddress, record);

  log.info({ walletAddress: contractAddress, credentialId: credential.id }, 'Passkey wallet registered');

  const token = issuePasskeySessionToken(contractAddress);
  return { walletAddress: contractAddress, token };
}

// ─── Login (sign in with an existing passkey) ──────────────────────────────

export async function startPasskeyLogin(walletAddress: string): Promise<{
  sessionId: string;
  options: Awaited<ReturnType<typeof generateAuthenticationOptions>>;
}> {
  purgeExpired();
  const cred = credentialsByWallet.get(walletAddress);
  if (!cred) throw new Error('No passkey registered for this wallet address');

  const options = await generateAuthenticationOptions({
    rpID: config.WEBAUTHN_RP_ID,
    allowCredentials: [{ id: cred.credentialId }],
    userVerification: 'preferred',
  });

  const sessionId = newSessionId();
  pendingChallenges.set(sessionId, {
    challenge: options.challenge,
    kind: 'login',
    walletAddress,
    expiresAt: Date.now() + CHALLENGE_TTL_MS,
  });
  return { sessionId, options };
}

export async function finishPasskeyLogin(
  sessionId: string,
  response: AuthenticationResponseJSON,
): Promise<{ walletAddress: string; token: string }> {
  purgeExpired();
  const pending = pendingChallenges.get(sessionId);
  if (!pending || pending.kind !== 'login' || !pending.walletAddress) {
    throw new Error('Login session not found or expired');
  }

  const cred = credentialsByWallet.get(pending.walletAddress);
  if (!cred) throw new Error('No passkey registered for this wallet address');

  const credentialForVerify: WebAuthnCredential = {
    id: cred.credentialId,
    publicKey: new Uint8Array(cred.publicKeyCose),
    counter: cred.counter,
  };

  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge: pending.challenge,
    expectedOrigin: config.WEBAUTHN_ORIGIN,
    expectedRPID: config.WEBAUTHN_RP_ID,
    credential: credentialForVerify,
  });
  pendingChallenges.delete(sessionId);

  if (!verification.verified) {
    throw new Error('Passkey login could not be verified');
  }

  cred.counter = verification.authenticationInfo.newCounter;
  credentialsByWallet.set(pending.walletAddress, cred);

  log.info({ walletAddress: pending.walletAddress }, 'Passkey login verified');

  const token = issuePasskeySessionToken(pending.walletAddress);
  return { walletAddress: pending.walletAddress, token };
}

// ─── Session issuance ───────────────────────────────────────────────────────
// Reuses the exact same JWT shape as the SEP-10 flow (auth.routes.ts), so the
// apiKeyAuth middleware and validateSessionToken() need no changes at all.

function issuePasskeySessionToken(walletAddress: string): string {
  return jwt.sign({ sub: walletAddress }, config.JWT_SECRET, { expiresIn: 86400 });
}
