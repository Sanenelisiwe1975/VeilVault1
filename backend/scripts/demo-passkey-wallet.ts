/**
 * Reviewer/investor-facing demo — NOT part of the test suite or CI.
 *
 * Walks through VeilVault's passkey account-abstraction story end to end
 * against the REAL backend HTTP API (no separate `npm run dev` needed — this
 * script starts the server in-process on an ephemeral port) and REAL Stellar
 * testnet:
 *
 *   1. Register a brand-new passkey wallet — no seed phrase shown to the
 *      user, ever. This deploys a smart-wallet Soroban contract instance.
 *   2. Add a backup passkey (recovery) — authorized by the FIRST passkey's
 *      WebAuthn signature, a real on-chain transaction, not just a UI toggle.
 *   3. Remove a passkey via the *generic* passkey-transaction endpoint
 *      (/api/passkey/tx/*), proving the mechanism isn't special-cased to
 *      "add a backup" — any contract call this wallet can authorize works.
 *
 * There's no real browser here, so this script plays the part of the
 * authenticator: it generates real P-256 keypairs, signs real WebAuthn
 * assertions/attestations with Node's crypto, and CBOR-encodes a "none"
 * attestation object by hand (see buildAttestationObject) — exactly what a
 * platform passkey (Face ID / Touch ID / Windows Hello) would hand back,
 * just without the fingerprint sensor. Everything downstream — the HTTP
 * routes, @simplewebauthn/server's verification, the Soroban contract calls
 * — is the real, unmodified production code path.
 *
 * Run with: npx ts-node scripts/demo-passkey-wallet.ts
 * Costs real (testnet) fees and takes ~1-2 minutes for ledger confirmations.
 */
import { createServer } from '../src/api/server';
import { generateKeyPairSync, createSign, createHash, randomBytes } from 'crypto';
import { encodeCBOR, type CBORType } from '@levischuck/tiny-cbor';
import { getStellarClient } from '../src/integrations/stellar/client';
import { derToRawLowS } from '../src/utils/ecdsa';
import { config } from '../src/config';
import type { AddressInfo } from 'net';

const B64_NO_PAD = (b: Buffer) => b.toString('base64url');
const log = (msg: string) => console.log(msg);

function p256KeyPair() {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = publicKey.export({ format: 'jwk' }) as { x: string; y: string };
  const sec1 = Buffer.concat([Buffer.from([0x04]), Buffer.from(jwk.x, 'base64url'), Buffer.from(jwk.y, 'base64url')]);
  return { privateKey, sec1 };
}

function sec1ToCoseKey(sec1: Buffer): Buffer {
  const cose = new Map<number, number | Uint8Array>([
    [1, 2], [3, -7], [-1, 1], [-2, sec1.subarray(1, 33)], [-3, sec1.subarray(33, 65)],
  ]);
  return Buffer.from(encodeCBOR(cose));
}

function rpIdHash(): Buffer {
  return createHash('sha256').update(config.WEBAUTHN_RP_ID).digest();
}

/** Builds a "none"-format attestationObject — what navigator.credentials.create() returns, minus an attestation signature (which "none" deliberately omits). */
function buildAttestationObject(credentialId: Buffer, coseKey: Buffer): Buffer {
  const flags = 0x45; // User Present | User Verified | Attested credential data included
  const authData = Buffer.concat([
    rpIdHash(),
    Buffer.from([flags]),
    Buffer.alloc(4), // counter
    Buffer.alloc(16), // aaguid
    (() => { const b = Buffer.alloc(2); b.writeUInt16BE(credentialId.length); return b; })(),
    credentialId,
    coseKey,
  ]);
  const attestationObject = new Map<string, CBORType>([
    ['fmt', 'none'],
    ['attStmt', new Map()],
    ['authData', authData],
  ]);
  return Buffer.from(encodeCBOR(attestationObject));
}

/** Simulates navigator.credentials.create() for a brand-new passkey. */
function simulateRegistration(challenge: string) {
  const credentialId = randomBytes(16);
  const key = p256KeyPair();
  const clientDataJson = Buffer.from(JSON.stringify({
    type: 'webauthn.create',
    challenge,
    origin: config.WEBAUTHN_ORIGIN,
  }));
  const attestationObject = buildAttestationObject(credentialId, sec1ToCoseKey(key.sec1));
  return {
    key,
    credentialId,
    response: {
      id: B64_NO_PAD(credentialId),
      rawId: B64_NO_PAD(credentialId),
      response: {
        clientDataJSON: B64_NO_PAD(clientDataJson),
        attestationObject: B64_NO_PAD(attestationObject),
      },
      clientExtensionResults: {},
      type: 'public-key' as const,
    },
  };
}

/** Simulates navigator.credentials.get() — an existing passkey signing a challenge. */
function simulateAssertion(privateKey: import('crypto').KeyObject, credentialId: Buffer, challenge: string) {
  const clientDataJson = Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge, origin: config.WEBAUTHN_ORIGIN }));
  const flags = 0x05; // User Present | User Verified
  const authenticatorData = Buffer.concat([rpIdHash(), Buffer.from([flags]), Buffer.alloc(4)]);
  const clientDataHash = createHash('sha256').update(clientDataJson).digest();
  const der = createSign('SHA256').update(Buffer.concat([authenticatorData, clientDataHash])).sign(privateKey);
  return {
    id: B64_NO_PAD(credentialId),
    rawId: B64_NO_PAD(credentialId),
    response: {
      clientDataJSON: B64_NO_PAD(clientDataJson),
      authenticatorData: B64_NO_PAD(authenticatorData),
      signature: B64_NO_PAD(der),
    },
    clientExtensionResults: {},
    type: 'public-key' as const,
  };
}

async function postJSON<T>(base: string, path: string, body: unknown, token?: string): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}: ${JSON.stringify(data)}`);
  return data as T;
}

async function main() {
  log('Deploying a fresh passkey-registry instance for this demo run...');
  const stellar = getStellarClient();
  const { Keypair, Address, nativeToScVal } = await import('@stellar/stellar-sdk');
  const adminPublicKey = Keypair.fromSecret(config.ADMIN_SECRET_KEY).publicKey();
  const fs = await import('fs');
  const path = await import('path');
  const registryWasm = fs.readFileSync(path.resolve(__dirname, '../../contracts/target/wasm32-unknown-unknown/release/passkey_registry.optimized.wasm'));
  const { wasmHash } = await stellar.uploadWasm(registryWasm, config.ADMIN_SECRET_KEY);
  const { contractAddress: registryAddress } = await stellar.deployContract({ wasmHash, deployerSecretKey: config.ADMIN_SECRET_KEY });
  await stellar.invokeContract(registryAddress, 'initialize', [new Address(adminPublicKey).toScVal()], config.ADMIN_SECRET_KEY);
  (config as { PASSKEY_REGISTRY_CONTRACT_ID?: string }).PASSKEY_REGISTRY_CONTRACT_ID = registryAddress;

  const app = createServer();
  const server = app.listen(0);
  const { port } = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}`;

  try {
    log('\n=== 1. Registering a brand-new passkey wallet (no seed phrase) ===');
    const reg = await postJSON<{ sessionId: string; options: { challenge: string } }>(
      base, '/api/auth/passkey/register/options', { userName: 'demo-user' },
    );
    const passkeyA = simulateRegistration(reg.options.challenge);
    const { walletAddress, token } = await postJSON<{ walletAddress: string; token: string }>(
      base, '/api/auth/passkey/register/verify', { sessionId: reg.sessionId, response: passkeyA.response },
    );
    log(`    Wallet deployed: ${walletAddress}`);
    log('    This Soroban contract address IS the wallet. The user never saw a secret key.');

    log('\n=== 2. Adding a backup passkey — recovery, authorized by the wallet itself ===');
    const addOpts = await postJSON<{ sessionId: string; options: { challenge: string } }>(
      base, '/api/passkey/signers/add/options', { userName: 'backup-device' }, token,
    );
    const passkeyB = simulateRegistration(addOpts.options.challenge);
    const verifyResult = await postJSON<{ sessionId: string; options: { challenge: string } }>(
      base, '/api/passkey/signers/add/register-verify', { sessionId: addOpts.sessionId, response: passkeyB.response }, token,
    );
    log('    Backend prepared the on-chain add_signer call and handed back a challenge —');
    log('    that challenge is the EXACT hash Soroban will check, not an arbitrary nonce.');

    const authAssertion = simulateAssertion(passkeyA.key.privateKey, passkeyA.credentialId, verifyResult.options.challenge);
    const addResult = await postJSON<{ success: true; signerIndex: number }>(
      base, '/api/passkey/signers/add/authorize', { sessionId: verifyResult.sessionId, response: authAssertion }, token,
    );
    log(`    Backup passkey authorized by the ORIGINAL passkey's signature, submitted on-chain.`);
    log(`    Wallet now has signer index ${addResult.signerIndex} as a backup — lose device A, recover with device B.`);

    log('\n=== 3. Generic passkey-authorized transaction — removing a signer, no bespoke route ===');
    const txPrepare = await postJSON<{ sessionId: string; options: { challenge: string } }>(
      base, '/api/passkey/tx/prepare',
      { contractId: walletAddress, method: 'remove_signer', args: [{ type: 'u32', value: addResult.signerIndex }] },
      token,
    );
    log('    Same /api/passkey/tx/prepare endpoint works for ANY contract method this wallet can');
    log('    authorize — add_signer above used the dedicated recovery routes; this uses the generic ones.');
    const removeAssertion = simulateAssertion(passkeyA.key.privateKey, passkeyA.credentialId, txPrepare.options.challenge);
    const txResult = await postJSON<{ txHash: string }>(
      base, '/api/passkey/tx/submit', { sessionId: txPrepare.sessionId, response: removeAssertion }, token,
    );
    log(`    Submitted on-chain: ${txResult.txHash}`);
    log('    Backup passkey removed — wallet is back to a single signer, all via the generic path.');

    log('\nPASS — full passkey lifecycle (register, recover, generic-authorize) verified against live testnet.');
  } finally {
    server.close();
  }
}

main().catch((err) => {
  console.error('\nFAIL —', err);
  process.exitCode = 1;
});
