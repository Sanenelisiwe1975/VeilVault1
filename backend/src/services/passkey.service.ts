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
 * Which wallet a given passkey belongs to is resolved via the on-chain
 * `passkey-registry` contract (see contracts/passkey-registry), not backend
 * memory — only the short-lived WebAuthn challenge itself lives in an
 * in-memory Map here, the same way SEP-10's challenge does. That means a
 * backend restart doesn't strand any existing passkey wallet.
 *
 * Sign-in itself (this service) verifies the WebAuthn assertion off-chain
 * (fast, free, no transaction) purely to issue a session JWT — the same
 * shape already issued by the SEP-10 flow in auth.routes.ts.
 *
 * Adding a backup passkey to an existing wallet (`startAddBackupPasskey` /
 * `verifyBackupPasskeyRegistration` / `finishAddBackupPasskey`) DOES submit a
 * real on-chain transaction — it calls `smart-wallet.add_signer`, which
 * requires the wallet's own auth, satisfied by a WebAuthn assertion from an
 * *already-registered* signer. That's a genuinely different, harder problem
 * than sign-in (which never touches the chain): the assertion has to
 * authorize a specific Soroban `SorobanAuthorizationEntry`, not just prove
 * "this passkey exists." See `StellarClient.prepareAuthorizedInvocation` /
 * `submitAuthorizedInvocation` for how that's built, and `utils/ecdsa.ts`
 * for the DER-decode + low-S normalization the browser's raw signature needs
 * before Soroban's `secp256r1_verify` will accept it.
 *
 * `startPasskeyTransaction` / `finishPasskeyTransaction` generalize that same
 * mechanism to *any* contract call, not just `add_signer` — the caller names
 * a contract, method, and typed args (see `utils/scval-args.ts`), and gets
 * back a WebAuthn challenge to sign with any of the wallet's registered
 * passkeys. `verifyBackupPasskeyRegistration` / `finishAddBackupPasskey` are
 * themselves now thin wrappers around the same prepare/authorize/submit core
 * (`resolveAuthorizingSignature` below) plus the extra step of registering
 * the new credential — proof the mechanism isn't special-cased to one method.
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
import { randomBytes, createHash } from 'crypto';
import { Keypair, Address, nativeToScVal, scValToNative } from '@stellar/stellar-sdk';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import { config } from '../config';
import { getStellarClient, type PreparedAuthorization } from '../integrations/stellar/client';
import { derToRawLowS } from '../utils/ecdsa';
import { buildArgScVal, type ScValArgSpec } from '../utils/scval-args';
import { createChildLogger } from '../utils/logger';

const log = createChildLogger('passkey');

const CHALLENGE_TTL_MS = 5 * 60_000;

interface PendingChallenge {
  challenge: string;
  kind: 'register' | 'login';
  userName?: string; // set for registration
  expiresAt: number;
}

// Only the short-lived WebAuthn challenge lives in memory — legitimately
// ephemeral, same precedent as SEP-10's own challenge handling elsewhere in
// this codebase. The durable credential -> wallet mapping lives on-chain in
// passkey-registry instead (see module doc above).
const pendingChallenges = new Map<string, PendingChallenge>();

function purgeExpired() {
  const now = Date.now();
  for (const [k, v] of pendingChallenges) if (v.expiresAt < now) pendingChallenges.delete(k);
}

function newSessionId(): string {
  return randomBytes(16).toString('hex');
}

const SMART_WALLET_WASM_PATH = path.resolve(__dirname, '../../../contracts/target/wasm32-unknown-unknown/release/smart_wallet.optimized.wasm');
const WASM_HASH_CACHE_PATH   = path.resolve(__dirname, '../../.smart-wallet-wasm-hash');

function readWasmHashCache(): Buffer | null {
  try {
    const hex = fs.readFileSync(WASM_HASH_CACHE_PATH, 'utf8').trim();
    return /^[0-9a-f]{64}$/i.test(hex) ? Buffer.from(hex, 'hex') : null;
  } catch {
    return null;
  }
}

let cachedWasmHash: Buffer | null = config.SMART_WALLET_WASM_HASH
  ? Buffer.from(config.SMART_WALLET_WASM_HASH, 'hex')
  : readWasmHashCache();

/** Upload the smart-wallet WASM once (idempotent) and cache its hash for the process lifetime (and on disk across restarts). */
async function ensureWasmUploaded(): Promise<Buffer> {
  if (cachedWasmHash) return cachedWasmHash;

  const wasm = fs.readFileSync(SMART_WALLET_WASM_PATH);
  const { wasmHash } = await getStellarClient().uploadWasm(wasm, config.ADMIN_SECRET_KEY);
  cachedWasmHash = wasmHash;
  try { fs.writeFileSync(WASM_HASH_CACHE_PATH, wasmHash.toString('hex')); } catch { /* cache is best-effort */ }
  log.warn(
    { wasmHash: wasmHash.toString('hex') },
    'smart-wallet WASM uploaded at runtime — set SMART_WALLET_WASM_HASH to skip this on future restarts',
  );
  return wasmHash;
}

/**
 * Kick off the WASM upload in the background at server startup so the first
 * user to register a passkey doesn't pay the ~10s upload inside their sign-up.
 * No-op when the hash is already known (env var or disk cache) or the WASM
 * file isn't present on this machine.
 */
export function prewarmSmartWalletWasm(): void {
  if (cachedWasmHash || !fs.existsSync(SMART_WALLET_WASM_PATH)) return;
  ensureWasmUploaded().catch(err =>
    log.warn({ err: (err as Error).message }, 'Smart-wallet WASM prewarm failed — will retry on first registration'),
  );
}

// ─── passkey-registry contract calls ───────────────────────────────────────

function registryContractId(): string {
  if (!config.PASSKEY_REGISTRY_CONTRACT_ID) {
    throw new Error('PASSKEY_REGISTRY_CONTRACT_ID not configured — deploy contracts/passkey-registry first');
  }
  return config.PASSKEY_REGISTRY_CONTRACT_ID;
}

/** sha256 of the raw credential ID bytes — a fixed-size on-chain key regardless of the authenticator's actual credential ID length. */
function hashCredentialId(credentialId: string): Buffer {
  return createHash('sha256').update(Buffer.from(credentialId, 'base64url')).digest();
}

interface RegistryRecord {
  wallet: string;
  publicKeyCose: Buffer;
  signerIndex: number;
  counter: number;
}

async function registryResolve(credentialIdHash: Buffer): Promise<RegistryRecord | null> {
  try {
    const result = await getStellarClient().callView(
      registryContractId(),
      'resolve',
      [nativeToScVal(credentialIdHash, { type: 'bytes' })],
    );
    const raw = scValToNative(result) as Record<string, unknown>;
    return {
      wallet: raw.wallet as string,
      publicKeyCose: Buffer.from(raw.public_key_cose as Uint8Array),
      signerIndex: Number(raw.signer_index),
      counter: Number(raw.counter),
    };
  } catch {
    return null;
  }
}

async function registryRegister(
  credentialIdHash: Buffer,
  walletAddress: string,
  publicKeyCose: Buffer,
  signerIndex: number,
): Promise<void> {
  await getStellarClient().invokeContract(
    registryContractId(),
    'register',
    [
      nativeToScVal(credentialIdHash, { type: 'bytes' }),
      new Address(walletAddress).toScVal(),
      nativeToScVal(publicKeyCose, { type: 'bytes' }),
      nativeToScVal(signerIndex, { type: 'u32' }),
    ],
    config.ADMIN_SECRET_KEY,
  );
}

/** ScVal encoding of the contract's `WebAuthnSignature` struct (see contracts/smart-wallet). */
function buildWebAuthnSignatureScVal(params: {
  signerIndex: number;
  authenticatorData: Buffer;
  clientDataJson: Buffer;
  signature: Buffer; // 64-byte raw (r || s), low-S normalized
}) {
  return nativeToScVal(
    {
      signer_index: params.signerIndex,
      authenticator_data: params.authenticatorData,
      client_data_json: params.clientDataJson,
      signature: params.signature,
    },
    {
      type: {
        signer_index: ['symbol', 'u32'],
        authenticator_data: ['symbol', null],
        client_data_json: ['symbol', null],
        signature: ['symbol', null],
      },
    },
  );
}

async function registryUpdateCounter(credentialIdHash: Buffer, newCounter: number): Promise<void> {
  await getStellarClient().invokeContract(
    registryContractId(),
    'update_counter',
    [
      nativeToScVal(credentialIdHash, { type: 'bytes' }),
      nativeToScVal(newCounter, { type: 'u32' }),
    ],
    config.ADMIN_SECRET_KEY,
  );
}

// ─── Registration (sign up with a passkey) ─────────────────────────────────

/**
 * Throw BEFORE the user is asked for a fingerprint when this server cannot
 * possibly complete the flow — a misconfigured server should surface as an
 * instant, clear error, not a biometric ceremony followed by an opaque
 * failure.
 */
function assertPasskeyConfigured(forRegistration: boolean): void {
  if (!config.PASSKEY_REGISTRY_CONTRACT_ID) {
    throw new Error('Passkey sign-in is not configured on this server (PASSKEY_REGISTRY_CONTRACT_ID is missing)');
  }
  if (forRegistration && !cachedWasmHash && !fs.existsSync(SMART_WALLET_WASM_PATH)) {
    throw new Error('Passkey sign-up is not configured on this server (set SMART_WALLET_WASM_HASH or build contracts/smart-wallet)');
  }
}

export async function startPasskeyRegistration(userName: string): Promise<{
  sessionId: string;
  options: Awaited<ReturnType<typeof generateRegistrationOptions>>;
}> {
  assertPasskeyConfigured(true);
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
  pendingChallenges.delete(sessionId);

  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge: pending.challenge,
    expectedOrigin: config.WEBAUTHN_ORIGIN,
    expectedRPID: config.WEBAUTHN_RP_ID,
  });

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

  const credentialIdHash = hashCredentialId(credential.id);
  await registryRegister(credentialIdHash, contractAddress, publicKeyCose, 0);

  log.info({ walletAddress: contractAddress, credentialId: credential.id }, 'Passkey wallet registered');

  const token = issuePasskeySessionToken(contractAddress);
  return { walletAddress: contractAddress, token };
}

// ─── Login (sign in with an existing passkey) ──────────────────────────────

export async function startPasskeyLogin(): Promise<{
  sessionId: string;
  options: Awaited<ReturnType<typeof generateAuthenticationOptions>>;
}> {
  assertPasskeyConfigured(false);
  purgeExpired();
  // No allowCredentials: the browser shows every discoverable passkey
  // registered for this RP ID, so the user doesn't need to know or store
  // their wallet address just to sign back in — whichever passkey they pick
  // tells us (via response.id in finishPasskeyLogin) which wallet to resolve.
  const options = await generateAuthenticationOptions({
    rpID: config.WEBAUTHN_RP_ID,
    userVerification: 'preferred',
  });

  const sessionId = newSessionId();
  pendingChallenges.set(sessionId, {
    challenge: options.challenge,
    kind: 'login',
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
  if (!pending || pending.kind !== 'login') {
    throw new Error('Login session not found or expired');
  }
  pendingChallenges.delete(sessionId);

  const credentialIdHash = hashCredentialId(response.id);
  const record = await registryResolve(credentialIdHash);
  if (!record) {
    throw new Error('Unrecognized passkey — no wallet is registered for this credential');
  }

  const credentialForVerify: WebAuthnCredential = {
    id: response.id,
    publicKey: new Uint8Array(record.publicKeyCose),
    counter: record.counter,
  };

  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge: pending.challenge,
    expectedOrigin: config.WEBAUTHN_ORIGIN,
    expectedRPID: config.WEBAUTHN_RP_ID,
    credential: credentialForVerify,
  });

  if (!verification.verified) {
    throw new Error('Passkey login could not be verified');
  }

  // Platform passkeys (iOS/Android/Windows Hello) always report counter 0, so
  // in the common case there is nothing to persist — skip the ~7s on-chain
  // update_counter transaction entirely. When a counter DOES advance (some
  // hardware keys), persist it in the background rather than making the user
  // wait: the assertion is already verified, the counter is only a
  // clone-detection heuristic for FUTURE logins.
  const newCounter = verification.authenticationInfo.newCounter;
  if (newCounter > record.counter) {
    registryUpdateCounter(credentialIdHash, newCounter).catch(err =>
      log.warn({ err: (err as Error).message }, 'Background counter update failed'),
    );
  }

  log.info({ walletAddress: record.wallet }, 'Passkey login verified');

  const token = issuePasskeySessionToken(record.wallet);
  return { walletAddress: record.wallet, token };
}

// ─── Add a backup passkey (recovery) ───────────────────────────────────────
//
// Three round trips, two separate WebAuthn ceremonies:
//   1. startAddBackupPasskey            -> WebAuthn REGISTRATION options for the new backup credential
//   2. verifyBackupPasskeyRegistration  -> verifies it, prepares the on-chain add_signer call,
//                                          returns WebAuthn AUTHENTICATION options whose challenge
//                                          IS the exact hash that call's auth entry needs signed
//   3. finishAddBackupPasskey           -> the user signs that challenge with an EXISTING passkey;
//                                          we verify it, submit add_signer, and register the new
//                                          credential in passkey-registry at its new signer index

interface PendingAddSigner {
  stage: 'register' | 'authorize';
  walletAddress: string;
  challenge: string;
  expiresAt: number;
  // Set once stage transitions to 'authorize':
  newCredentialId?: string;
  newPublicKeyCose?: Buffer;
  prepared?: PreparedAuthorization;
}

const pendingAddSigner = new Map<string, PendingAddSigner>();

function purgeExpiredAddSigner() {
  const now = Date.now();
  for (const [k, v] of pendingAddSigner) if (v.expiresAt < now) pendingAddSigner.delete(k);
}

/** Step 1: begin registering a new backup passkey for an existing, already-authenticated wallet. */
export async function startAddBackupPasskey(walletAddress: string, userName: string): Promise<{
  sessionId: string;
  options: Awaited<ReturnType<typeof generateRegistrationOptions>>;
}> {
  purgeExpiredAddSigner();
  const options = await generateRegistrationOptions({
    rpName: config.WEBAUTHN_RP_NAME,
    rpID: config.WEBAUTHN_RP_ID,
    userName,
    attestationType: 'none',
    authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
    supportedAlgorithmIDs: [-7],
  });

  const sessionId = newSessionId();
  pendingAddSigner.set(sessionId, {
    stage: 'register',
    walletAddress,
    challenge: options.challenge,
    expiresAt: Date.now() + CHALLENGE_TTL_MS,
  });
  return { sessionId, options };
}

// ─── Shared prepare/authorize core ─────────────────────────────────────────
// Both add-backup-passkey (above/below) and the generic passkey-transaction
// flow (further below) are built on these two functions. Neither knows or
// cares what method is being called — only that *some* wallet auth entry
// needs a WebAuthn-backed signature.

/** Simulate `contractId.method(...args)`, requiring the wallet's own auth, and turn the resulting payload hash into a WebAuthn challenge for an existing signer to sign. */
async function prepareInvocationChallenge(
  walletAddress: string,
  contractId: string,
  method: string,
  args: import('@stellar/stellar-sdk').xdr.ScVal[],
): Promise<{ prepared: PreparedAuthorization; challenge: string; options: Awaited<ReturnType<typeof generateAuthenticationOptions>> }> {
  const adminPublicKey = Keypair.fromSecret(config.ADMIN_SECRET_KEY).publicKey();
  const prepared = await getStellarClient().prepareAuthorizedInvocation({
    contractId,
    method,
    args,
    authAddress: walletAddress,
    feePayerPublicKey: adminPublicKey,
  });

  const options = await generateAuthenticationOptions({
    rpID: config.WEBAUTHN_RP_ID,
    userVerification: 'preferred',
    // The challenge an EXISTING signer must sign is the exact 32-byte hash
    // Soroban will check against — not a random value generated for its own sake.
    challenge: new Uint8Array(prepared.payloadHash),
  });

  return { prepared, challenge: options.challenge, options };
}

/** Resolve which registered signer produced `response`, verify it off-chain, and build the on-chain WebAuthnSignature ScVal. Throws if the assertion doesn't belong to `walletAddress` or doesn't verify. */
async function resolveAuthorizingSignature(
  walletAddress: string,
  challenge: string,
  response: AuthenticationResponseJSON,
): Promise<{ signatureScVal: ReturnType<typeof buildWebAuthnSignatureScVal> }> {
  const authCredentialIdHash = hashCredentialId(response.id);
  const authRecord = await registryResolve(authCredentialIdHash);
  if (!authRecord || authRecord.wallet !== walletAddress) {
    throw new Error('Authorizing passkey does not belong to this wallet');
  }

  // Verify off-chain first — fail fast with a clear error instead of an
  // opaque on-chain trap if the signature or challenge is wrong.
  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge: challenge,
    expectedOrigin: config.WEBAUTHN_ORIGIN,
    expectedRPID: config.WEBAUTHN_RP_ID,
    credential: {
      id: response.id,
      publicKey: new Uint8Array(authRecord.publicKeyCose),
      counter: authRecord.counter,
    },
  });
  if (!verification.verified) {
    throw new Error('Authorization signature invalid');
  }
  // Same counter rationale as finishPasskeyLogin — but here a real admin-signed
  // transaction follows immediately, so when a counter does advance we must
  // await (a background tx from the same admin account would collide on the
  // sequence number). Platform passkeys always report 0, so this await is
  // skipped in the common case.
  const newAuthCounter = verification.authenticationInfo.newCounter;
  if (newAuthCounter > authRecord.counter) {
    await registryUpdateCounter(authCredentialIdHash, newAuthCounter);
  }

  const signatureScVal = buildWebAuthnSignatureScVal({
    signerIndex: authRecord.signerIndex,
    authenticatorData: Buffer.from(response.response.authenticatorData, 'base64url'),
    clientDataJson: Buffer.from(response.response.clientDataJSON, 'base64url'),
    signature: derToRawLowS(Buffer.from(response.response.signature, 'base64url')),
  });
  return { signatureScVal };
}

/**
 * Step 2: verify the new backup credential's attestation, then prepare the
 * on-chain `add_signer` call and hand back a WebAuthn AUTHENTICATION
 * challenge — the user must sign this with an EXISTING passkey on the same
 * wallet to actually authorize adding the new one.
 */
export async function verifyBackupPasskeyRegistration(
  sessionId: string,
  response: RegistrationResponseJSON,
): Promise<{ sessionId: string; options: Awaited<ReturnType<typeof generateAuthenticationOptions>> }> {
  purgeExpiredAddSigner();
  const pending = pendingAddSigner.get(sessionId);
  if (!pending || pending.stage !== 'register') {
    throw new Error('Add-signer session not found or expired');
  }

  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge: pending.challenge,
    expectedOrigin: config.WEBAUTHN_ORIGIN,
    expectedRPID: config.WEBAUTHN_RP_ID,
  });
  if (!verification.verified || !verification.registrationInfo) {
    pendingAddSigner.delete(sessionId);
    throw new Error('Backup passkey registration could not be verified');
  }

  const { credential } = verification.registrationInfo;
  const publicKeyCose = Buffer.from(credential.publicKey);
  const publicKeySec1 = Buffer.from(convertCOSEtoPKCS(credential.publicKey));
  if (publicKeySec1.length !== 65 || publicKeySec1[0] !== 0x04) {
    pendingAddSigner.delete(sessionId);
    throw new Error('Unsupported passkey public key format (expected uncompressed secp256r1)');
  }

  const { prepared, challenge, options } = await prepareInvocationChallenge(
    pending.walletAddress,
    pending.walletAddress,
    'add_signer',
    [nativeToScVal(publicKeySec1, { type: 'bytes' })],
  );

  pendingAddSigner.set(sessionId, {
    stage: 'authorize',
    walletAddress: pending.walletAddress,
    challenge,
    expiresAt: Date.now() + CHALLENGE_TTL_MS,
    newCredentialId: credential.id,
    newPublicKeyCose: publicKeyCose,
    prepared,
  });

  return { sessionId, options };
}

/** Step 3: an existing signer authorizes adding the new backup passkey; submit on-chain and register it. */
export async function finishAddBackupPasskey(
  sessionId: string,
  response: AuthenticationResponseJSON,
): Promise<{ success: true; signerIndex: number }> {
  purgeExpiredAddSigner();
  const pending = pendingAddSigner.get(sessionId);
  if (!pending || pending.stage !== 'authorize' || !pending.prepared || !pending.newPublicKeyCose || !pending.newCredentialId) {
    throw new Error('Add-signer session not found or expired');
  }
  pendingAddSigner.delete(sessionId);

  const { signatureScVal } = await resolveAuthorizingSignature(pending.walletAddress, pending.challenge, response);

  await getStellarClient().submitAuthorizedInvocation({
    prepared: pending.prepared,
    signatureScVal,
    feePayerSecretKey: config.ADMIN_SECRET_KEY,
  });

  const signersResult = await getStellarClient().callView(pending.walletAddress, 'get_signers', []);
  const signers = scValToNative(signersResult) as unknown[];
  const newSignerIndex = signers.length - 1;

  await registryRegister(hashCredentialId(pending.newCredentialId), pending.walletAddress, pending.newPublicKeyCose, newSignerIndex);

  log.info({ walletAddress: pending.walletAddress, newSignerIndex }, 'Backup passkey added');
  return { success: true, signerIndex: newSignerIndex };
}

// ─── Generic passkey-authorized transactions ───────────────────────────────
// Same prepare/authorize/submit mechanism as add-backup-passkey above, but
// for *any* contract call — the caller names a contract, method, and typed
// args (see utils/scval-args.ts) instead of this module hard-coding one.

interface PendingTransaction {
  walletAddress: string;
  challenge: string;
  expiresAt: number;
  prepared: PreparedAuthorization;
}

const pendingTransactions = new Map<string, PendingTransaction>();

function purgeExpiredTransactions() {
  const now = Date.now();
  for (const [k, v] of pendingTransactions) if (v.expiresAt < now) pendingTransactions.delete(k);
}

/** Step 1: simulate the call and get back a WebAuthn challenge for an existing signer on `walletAddress` to sign. */
export async function startPasskeyTransaction(
  walletAddress: string,
  contractId: string,
  method: string,
  argSpecs: ScValArgSpec[],
): Promise<{ sessionId: string; options: Awaited<ReturnType<typeof generateAuthenticationOptions>> }> {
  purgeExpiredTransactions();
  const args = argSpecs.map(buildArgScVal);
  const { prepared, challenge, options } = await prepareInvocationChallenge(walletAddress, contractId, method, args);

  const sessionId = newSessionId();
  pendingTransactions.set(sessionId, {
    walletAddress,
    challenge,
    expiresAt: Date.now() + CHALLENGE_TTL_MS,
    prepared,
  });
  return { sessionId, options };
}

/** Step 2: an existing signer authorizes the call; submit it on-chain. */
export async function finishPasskeyTransaction(
  sessionId: string,
  response: AuthenticationResponseJSON,
): Promise<{ txHash: string; result: unknown }> {
  purgeExpiredTransactions();
  const pending = pendingTransactions.get(sessionId);
  if (!pending) {
    throw new Error('Transaction session not found or expired');
  }
  pendingTransactions.delete(sessionId);

  const { signatureScVal } = await resolveAuthorizingSignature(pending.walletAddress, pending.challenge, response);

  const { txHash, result } = await getStellarClient().submitAuthorizedInvocation({
    prepared: pending.prepared,
    signatureScVal,
    feePayerSecretKey: config.ADMIN_SECRET_KEY,
  });

  log.info({ walletAddress: pending.walletAddress, txHash }, 'Passkey-authorized transaction submitted');
  return { txHash, result: result ? scValToNative(result) : null };
}

// ─── Session issuance ───────────────────────────────────────────────────────
// Reuses the exact same JWT shape as the SEP-10 flow (auth.routes.ts), so the
// apiKeyAuth middleware and validateSessionToken() need no changes at all.

function issuePasskeySessionToken(walletAddress: string): string {
  return jwt.sign({ sub: walletAddress }, config.JWT_SECRET, { expiresIn: 86400 });
}
