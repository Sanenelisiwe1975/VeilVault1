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
 * presents to __check_auth. This script proves that end to end:
 *
 *   1. Deploy a fresh smart-wallet instance, initialize it with passkey A.
 *   2. Deploy + initialize a passkey-registry instance.
 *   3. Call StellarClient.prepareAuthorizedInvocation for add_signer(pubkey_B).
 *   4. Build a realistic WebAuthn assertion (authenticatorData +
 *      clientDataJSON whose challenge is the prepared payload hash),
 *      sign it with passkey A via Node's real P-256 DER signer, run it
 *      through derToRawLowS, and submit.
 *   5. Confirm get_signers() now returns [A, B].
 *
 * Run with: npx ts-node scripts/validate-passkey-tx-auth.ts
 * Costs real (testnet) fees and takes ~1-2 minutes for ledger confirmations.
 */
import { generateKeyPairSync, createSign, createHash } from 'crypto';
import { p256 } from '@noble/curves/nist.js';
import * as fs from 'fs';
import * as path from 'path';
import { Keypair, Address, nativeToScVal, scValToNative } from '@stellar/stellar-sdk';
import { getStellarClient } from '../src/integrations/stellar/client';
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

  const authenticatorData = Buffer.alloc(37);
  authenticatorData[32] = 0x01; // User Present flag

  const clientDataHash = createHash('sha256').update(clientDataJson).digest();
  const signedData = Buffer.concat([authenticatorData, clientDataHash]);
  const digest = createHash('sha256').update(signedData).digest();

  const der = createSign('SHA256').update(signedData).sign(privateKey);
  const rawLowS = derToRawLowS(der);

  return { authenticatorData, clientDataJson, signature: rawLowS, digest };
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

  console.log('[1/6] Generating two p256 keypairs (simulating two passkeys)...');
  const keyA = p256KeyPair();
  const keyB = p256KeyPair();
  console.log(`      keyA.sec1 = ${keyA.sec1.toString('hex')}`);

  console.log('[2/6] Uploading smart-wallet wasm + deploying instance...');
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

  console.log('[3/6] Preparing add_signer(pubkey_B) authorization...');
  const prepared = await stellar.prepareAuthorizedInvocation({
    contractId: walletAddress,
    method: 'add_signer',
    args: [nativeToScVal(keyB.sec1, { type: 'bytes' })],
    authAddress: walletAddress,
    feePayerPublicKey: adminPublicKey,
  });
  console.log(`      payloadHash = ${prepared.payloadHash.toString('hex')}`);

  console.log('[4/6] Signing the prepared payload hash with passkey A (real DER ECDSA + low-S normalize)...');
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

  console.log('[5/6] Submitting authorized add_signer invocation...');
  const result = await stellar.submitAuthorizedInvocation({
    prepared,
    signatureScVal,
    feePayerSecretKey: config.ADMIN_SECRET_KEY,
  });
  console.log(`      txHash = ${result.txHash}`);

  console.log('[6/6] Verifying get_signers() now returns 2 signers...');
  const signersScVal = await stellar.callView(walletAddress, 'get_signers', []);
  const signers = scValToNative(signersScVal) as Buffer[];
  console.log(`      signer count = ${signers.length}`);
  const signerBHex = Buffer.from(signers[1]).toString('hex');
  const expectedHex = keyB.sec1.toString('hex');
  console.log(`      signers[1] === pubkey_B: ${signerBHex === expectedHex}`);

  if (signers.length === 2 && signerBHex === expectedHex) {
    console.log('\n✅ PASS — passkey-authorized on-chain transaction works end to end against real testnet.');
  } else {
    console.log('\n❌ FAIL — unexpected on-chain state.');
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('\n❌ FAIL —', err);
  process.exitCode = 1;
});
