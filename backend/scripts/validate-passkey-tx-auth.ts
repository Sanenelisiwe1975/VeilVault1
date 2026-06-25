/**
 * One-shot manual validation script — NOT part of the test suite or CI.
 *
 * Exercises the riskiest, least-previously-tested part of the passkey
 * transaction-authorization feature: StellarClient.prepareAuthorizedInvocation
 * / submitAuthorizedInvocation against REAL testnet, with a REAL secp256r1
 * signature that must pass the smart-wallet contract's REAL __check_auth.
 *
 * This specifically closes a gap the Rust unit tests can't: those use
 * env.mock_all_auths(), which bypasses the SorobanAuthorizationEntry /
 * HashIdPreimage layer entirely. They prove __check_auth's *logic* is
 * correct given a signature_payload, but never prove that the payload hash
 * this script computes client-side is the SAME hash the network actually
 * presents to __check_auth. Part 1 proves that end to end:
 *
 *   1. Deploy a fresh smart-wallet instance, initialize it with passkey A.
 *   2. Call StellarClient.prepareAuthorizedInvocation for add_signer(pubkey_B).
 *   3. Build a realistic WebAuthn assertion (authenticatorData +
 *      clientDataJSON whose challenge is the prepared payload hash),
 *      sign it with passkey A via Node's real P-256 DER signer, run it
 *      through derToRawLowS, and submit.
 *   4. Confirm get_signers() now returns [A, B].
 *
 * Part 2 proves the *generic* passkey-transaction service layer
 * (startPasskeyTransaction / finishPasskeyTransaction, used by the
 * /api/passkey/tx/* routes) generalizes beyond add_signer — not just the
 * lower-level StellarClient methods Part 1 already proved. It deploys a
 * passkey-registry instance, registers passkey A's credential in it (with a
 * hand-built COSE key, since this isn't a real browser credential), then
 * drives remove_signer(1) through the exact same service functions the HTTP
 * routes call — including @simplewebauthn/server's OWN off-chain
 * verification, not just the on-chain check.
 *
 * Run with: npx ts-node scripts/validate-passkey-tx-auth.ts
 * Costs real (testnet) fees and takes ~2-3 minutes for ledger confirmations.
 */
import { generateKeyPairSync, createSign, createHash, randomBytes } from 'crypto';
import { encodeCBOR } from '@levischuck/tiny-cbor';
import { p256 } from '@noble/curves/nist.js';
import * as fs from 'fs';
import * as path from 'path';
import { Keypair, Address, nativeToScVal, scValToNative } from '@stellar/stellar-sdk';
import { getStellarClient } from '../src/integrations/stellar/client';
import { startPasskeyTransaction, finishPasskeyTransaction } from '../src/services/passkey.service';
import { derToRawLowS } from '../src/utils/ecdsa';
import { config } from '../src/config';

const B64_NO_PAD = (b: Buffer) => b.toString('base64url');

function p256KeyPair() {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  // SEC1 uncompressed point: 0x04 || X(32) || Y(32). Node gives us the raw
  // public key via the JWK export, which has base64url x/y coordinates.
  const jwk = publicKey.export({ format: 'jwk' }) as { x: string; y: string };
  const x = Buffer.from(jwk.x, 'base64url');
  const y = Buffer.from(jwk.y, 'base64url');
  const sec1 = Buffer.concat([Buffer.from([0x04]), x, y]);
  return { privateKey, publicKey, sec1 };
}

/** Mirrors contracts/smart-wallet's own Rust test fixture (make_assertion). */
function signAssertion(privateKey: import('crypto').KeyObject, challenge: Buffer) {
  const clientDataJson = Buffer.from(JSON.stringify({
    type: 'webauthn.get',
    challenge: B64_NO_PAD(challenge),
    origin: config.WEBAUTHN_ORIGIN,
  }));

  // rpIdHash(32) || flags(1) || counter(4). The on-chain contract only checks
  // the User Present bit, but @simplewebauthn/server's own
  // verifyAuthenticationResponse (used by Part 2's service-layer test below)
  // also requires rpIdHash to be real and User Verified by default — exactly
  // what a real platform passkey (Face ID / Touch ID / Windows Hello) always
  // reports, since those always perform biometric/PIN verification.
  const rpIdHash = createHash('sha256').update(config.WEBAUTHN_RP_ID).digest();
  const USER_PRESENT = 0x01;
  const USER_VERIFIED = 0x04;
  const authenticatorData = Buffer.concat([rpIdHash, Buffer.from([USER_PRESENT | USER_VERIFIED]), Buffer.alloc(4)]);

  const clientDataHash = createHash('sha256').update(clientDataJson).digest();
  const signedData = Buffer.concat([authenticatorData, clientDataHash]);
  const digest = createHash('sha256').update(signedData).digest();

  const der = createSign('SHA256').update(signedData).sign(privateKey);
  const rawLowS = derToRawLowS(der);

  return { authenticatorData, clientDataJson, signatureDer: der, signature: rawLowS, digest };
}

/** Hand-builds a COSE_Key (EC2/P-256) for a SEC1 uncompressed public key — what a real authenticator's attestationObject would contain, needed here since this is a simulated (non-browser) credential. */
function sec1ToCoseKey(sec1: Buffer): Buffer {
  const x = sec1.subarray(1, 33);
  const y = sec1.subarray(33, 65);
  const cose = new Map<number, number | Uint8Array>([
    [1, 2], // kty: EC2
    [3, -7], // alg: ES256
    [-1, 1], // crv: P-256
    [-2, x],
    [-3, y],
  ]);
  return Buffer.from(encodeCBOR(cose));
}

function buildWebAuthnSignatureScVal(params: { signerIndex: number; authenticatorData: Buffer; clientDataJson: Buffer; signature: Buffer }) {
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

async function main() {
  const stellar = getStellarClient();
  const adminPublicKey = Keypair.fromSecret(config.ADMIN_SECRET_KEY).publicKey();

  console.log('[1/11] Generating two p256 keypairs (simulating two passkeys)...');
  const keyA = p256KeyPair();
  const keyB = p256KeyPair();
  console.log(`      keyA.sec1 = ${keyA.sec1.toString('hex')}`);

  console.log('[2/11] Uploading smart-wallet wasm + deploying instance...');
  const wasmPath = path.resolve(__dirname, '../../contracts/target/wasm32-unknown-unknown/release/smart_wallet.optimized.wasm');
  const wasm = fs.readFileSync(wasmPath);
  const { wasmHash } = await stellar.uploadWasm(wasm, config.ADMIN_SECRET_KEY);
  const { contractAddress: walletAddress } = await stellar.deployContract({ wasmHash, deployerSecretKey: config.ADMIN_SECRET_KEY });
  console.log(`      wallet = ${walletAddress}`);

  await stellar.invokeContract(
    walletAddress,
    'initialize',
    [
      new Address(adminPublicKey).toScVal(),
      nativeToScVal(keyA.sec1, { type: 'bytes' }),
    ],
    config.ADMIN_SECRET_KEY,
  );
  console.log('      initialized with passkey A');

  const storedSignersScVal = await stellar.callView(walletAddress, 'get_signers', []);
  const storedSigners = scValToNative(storedSignersScVal) as Buffer[];
  const storedHex = Buffer.from(storedSigners[0]).toString('hex');
  console.log(`      stored signers[0] === keyA.sec1: ${storedHex === keyA.sec1.toString('hex')} (${storedSigners.length} signer(s))`);

  console.log('[3/11] Preparing add_signer(pubkey_B) authorization...');
  const prepared = await stellar.prepareAuthorizedInvocation({
    contractId: walletAddress,
    method: 'add_signer',
    args: [nativeToScVal(keyB.sec1, { type: 'bytes' })],
    authAddress: walletAddress,
    feePayerPublicKey: adminPublicKey,
  });
  console.log(`      payloadHash = ${prepared.payloadHash.toString('hex')}`);

  console.log('[4/11] Signing the prepared payload hash with passkey A (real DER ECDSA + low-S normalize)...');
  const assertion = signAssertion(keyA.privateKey, prepared.payloadHash);

  // Self-check: does the raw (r||s) low-S signature verify as a RAW ECDSA
  // signature over the already-hashed digest (no internal re-hash) — the
  // exact same operation Soroban's secp256r1_verify performs? This isolates
  // a real crypto mismatch from a transport/encoding bug before submitting.
  // (Node's own crypto.verify(null, ...) is NOT a reliable way to test this —
  // its EC "no algorithm" path doesn't behave as a true prehash verify, so
  // we use @noble/curves' explicit prehash:false option instead.)
  const selfVerified = p256.verify(assertion.signature, assertion.digest, keyA.sec1, { lowS: false, prehash: false });
  console.log(`      self-check (raw P-256 verify over digest, no rehash): ${selfVerified}`);
  if (!selfVerified) throw new Error('Signature does not verify locally — bug is in signing/encoding, not on-chain.');

  const signatureScVal = buildWebAuthnSignatureScVal({
    signerIndex: 0,
    authenticatorData: assertion.authenticatorData,
    clientDataJson: assertion.clientDataJson,
    signature: assertion.signature,
  });

  console.log('[5/11] Submitting authorized add_signer invocation...');
  const result = await stellar.submitAuthorizedInvocation({
    prepared,
    signatureScVal,
    feePayerSecretKey: config.ADMIN_SECRET_KEY,
  });
  console.log(`      txHash = ${result.txHash}`);

  console.log('[6/11] Verifying get_signers() now returns 2 signers...');
  const signersScVal = await stellar.callView(walletAddress, 'get_signers', []);
  const signers = scValToNative(signersScVal) as Buffer[];
  console.log(`      signer count = ${signers.length}`);
  const signerBHex = Buffer.from(signers[1]).toString('hex');
  const expectedHex = keyB.sec1.toString('hex');
  console.log(`      signers[1] === pubkey_B: ${signerBHex === expectedHex}`);

  const part1Passed = signers.length === 2 && signerBHex === expectedHex;
  console.log(part1Passed
    ? '      Part 1 PASS — low-level StellarClient prepare/submit works end to end against real testnet.\n'
    : '      Part 1 FAIL — unexpected on-chain state.\n');

  // ─── Part 2: the generic service layer (remove_signer, a different method
  // and arg type than Part 1's add_signer) ───────────────────────────────

  console.log('[7/11] Deploying + initializing a passkey-registry instance...');
  const registryWasmPath = path.resolve(__dirname, '../../contracts/target/wasm32-unknown-unknown/release/passkey_registry.optimized.wasm');
  const registryWasm = fs.readFileSync(registryWasmPath);
  const { wasmHash: registryWasmHash } = await stellar.uploadWasm(registryWasm, config.ADMIN_SECRET_KEY);
  const { contractAddress: registryAddress } = await stellar.deployContract({ wasmHash: registryWasmHash, deployerSecretKey: config.ADMIN_SECRET_KEY });
  await stellar.invokeContract(registryAddress, 'initialize', [new Address(adminPublicKey).toScVal()], config.ADMIN_SECRET_KEY);
  (config as { PASSKEY_REGISTRY_CONTRACT_ID?: string }).PASSKEY_REGISTRY_CONTRACT_ID = registryAddress;
  console.log(`      registry = ${registryAddress}`);

  console.log('[8/11] Registering passkey A\'s credential (hand-built COSE key — not a real browser credential)...');
  const credentialIdA = randomBytes(16).toString('base64url');
  const publicKeyCoseA = sec1ToCoseKey(keyA.sec1);
  await stellar.invokeContract(
    registryAddress,
    'register',
    [
      nativeToScVal(createHash('sha256').update(Buffer.from(credentialIdA, 'base64url')).digest(), { type: 'bytes' }),
      new Address(walletAddress).toScVal(),
      nativeToScVal(publicKeyCoseA, { type: 'bytes' }),
      nativeToScVal(0, { type: 'u32' }),
    ],
    config.ADMIN_SECRET_KEY,
  );

  console.log('[9/11] startPasskeyTransaction(wallet, "remove_signer", [u32 1]) — removes pubkey_B...');
  const { sessionId, options } = await startPasskeyTransaction(walletAddress, walletAddress, 'remove_signer', [
    { type: 'u32', value: 1 },
  ]);
  console.log(`      challenge = ${options.challenge}`);

  console.log('[10/11] Signing that challenge with passkey A and building a simulated AuthenticationResponseJSON...');
  const challengeBytes = Buffer.from(options.challenge, 'base64url');
  const removeAssertion = signAssertion(keyA.privateKey, challengeBytes);
  const simulatedResponse = {
    id: credentialIdA,
    rawId: credentialIdA,
    response: {
      clientDataJSON: B64_NO_PAD(removeAssertion.clientDataJson),
      authenticatorData: B64_NO_PAD(removeAssertion.authenticatorData),
      signature: B64_NO_PAD(removeAssertion.signatureDer),
    },
    clientExtensionResults: {},
    type: 'public-key' as const,
  };

  console.log('[11/11] finishPasskeyTransaction — verifies off-chain (@simplewebauthn/server) AND submits on-chain...');
  const txResult = await finishPasskeyTransaction(sessionId, simulatedResponse);
  console.log(`      txHash = ${txResult.txHash}`);

  const finalSignersScVal = await stellar.callView(walletAddress, 'get_signers', []);
  const finalSigners = scValToNative(finalSignersScVal) as Buffer[];
  const part2Passed = finalSigners.length === 1 && Buffer.from(finalSigners[0]).toString('hex') === keyA.sec1.toString('hex');
  console.log(`      signer count after remove_signer: ${finalSigners.length} (expected 1, just passkey A)`);

  if (part1Passed && part2Passed) {
    console.log('\n✅ PASS — both the low-level client AND the generic passkey-transaction service layer work end to end against real testnet.');
  } else {
    console.log('\n❌ FAIL — unexpected on-chain state.');
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('\n❌ FAIL —', err);
  process.exitCode = 1;
});
