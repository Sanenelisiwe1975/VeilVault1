/**
 * One-shot manual validation script — NOT part of the test suite or CI.
 *
 * Exercises the new "no manual CLI / no manual attestation paste" withdrawal
 * pipeline end to end against REAL testnet:
 *
 *   1. Register the withdraw circuit's verifying key on zk-attestation
 *      (idempotent — register_circuit overwrites).
 *   2. Deposit one denomination unit (ADMIN account as depositor).
 *   3. Fetch the real Merkle path via GET /privacy-pool/merkle-path/:leafIndex
 *      (the same endpoint the browser worker calls).
 *   4. Generate a Groth16 withdrawal proof via the NATIVE prover binary —
 *      this runs the exact same prover-core circuit/serialize code the
 *      browser WASM build runs (they're now the same crate, see
 *      prover-core/), so this proves the cryptographic logic is correct
 *      without needing a real browser. It does not exercise the
 *      Worker/Cache-API/wasm-bindgen JS glue itself.
 *   5. Submit the proof via the new POST /privacy-pool/attest-withdrawal.
 *   6. Call POST /privacy-pool/withdraw with the resulting attestationId.
 *
 * ADMIN's own account is used as BOTH depositor and recipient — this
 * sidesteps the known limitation that a withdrawal recipient must already
 * be a funded Stellar account (to pay the withdraw tx's fee), since ADMIN's
 * account is already funded from prior deployments in this repo. That's
 * exactly the question this script is meant to help answer: does the
 * pipeline actually need a code fix for that, or is it just an inherent
 * precondition any recipient must satisfy (same as needing an account to
 * exist at all)?
 *
 * Run with: npx ts-node scripts/validate-privacy-pool-withdraw.ts
 * Costs real (testnet) fees and takes a minute or two for confirmations.
 */
import { execFileSync } from 'child_process';
import { randomBytes } from 'crypto';
import * as path from 'path';
import type { AddressInfo } from 'net';
import { Keypair } from '@stellar/stellar-sdk';
import { createServer } from '../src/api/server';
import { config } from '../src/config';

// Disable API-key auth for this isolated in-process server only — does not
// touch the user's real running dev server or .env file.
(config as { API_KEY_HASH?: string }).API_KEY_HASH = '';

const PROVER_BIN = path.resolve(__dirname, '../../prover/target/release/veilpool-prover.exe');
const VK_PATH    = path.resolve(__dirname, '../../prover/prover-keys/vk.bin');
const PK_PATH    = path.resolve(__dirname, '../../prover/prover-keys/pk.bin');

function randHex64(): string {
  return randomBytes(32).toString('hex');
}

async function http<T>(base: string, method: 'GET' | 'POST', p: string, body?: unknown): Promise<T> {
  const res = await fetch(`${base}${p}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`${method} ${p} -> ${res.status}: ${JSON.stringify(data)}`);
  return data as T;
}

async function main() {
  if (!config.WITHDRAW_CIRCUIT_ID) throw new Error('WITHDRAW_CIRCUIT_ID not configured');

  const app = createServer();
  const server = app.listen(0);
  const { port } = server.address() as AddressInfo;
  const base = `http://localhost:${port}/api`;

  try {
    const admin = Keypair.fromSecret(config.ADMIN_SECRET_KEY);

    console.log('[1/6] Registering withdraw circuit on zk-attestation (idempotent)...');
    const vkRaw = execFileSync(PROVER_BIN, [
      'format-vk', '--vk', VK_PATH,
      '--circuit-id', config.WITHDRAW_CIRCUIT_ID,
      '--circuit-name', 'veilpool_withdraw_v1',
    ], { encoding: 'utf8' });
    const vk = JSON.parse(vkRaw);
    await http(base, 'POST', '/attestations/register-circuit', {
      circuitId:   vk.circuit_id,
      circuitName: vk.circuit_name,
      alphaG1Neg:  vk.alpha_g1_neg,
      betaG2:      vk.beta_g2,
      gammaG2:     vk.gamma_g2,
      deltaG2:     vk.delta_g2,
      ic:          vk.ic,
      adminSecret: config.ADMIN_SECRET_KEY,
    });
    console.log('      registered');

    console.log('[2/6] Depositing one denomination unit (ADMIN as depositor)...');
    const secret = randHex64();
    const nullifier = randHex64();
    const commitRes = await http<{ success: boolean; data: { commitment: string; nullifierHash: string } }>(
      base, 'POST', '/privacy-pool/commitment', { secret, nullifier },
    );
    const { commitment, nullifierHash } = commitRes.data;
    const depRes = await http<{ success: boolean; data: { leafIndex: number; txHash: string } }>(
      base, 'POST', '/privacy-pool/deposit', { depositorSecret: config.ADMIN_SECRET_KEY, commitment },
    );
    const { leafIndex, txHash: depositTx } = depRes.data;
    console.log(`      leafIndex=${leafIndex} txHash=${depositTx}`);

    console.log('[3/6] Fetching pool state + real Merkle path...');
    const stateRes = await http<{ success: boolean; data: { denomination: string; circuitId: string; contractId: string } }>(
      base, 'GET', '/privacy-pool/state',
    );
    const pathRes = await http<{ success: boolean; data: { pathElements: string[]; pathIndices: boolean[]; root: string } }>(
      base, 'GET', `/privacy-pool/merkle-path/${leafIndex}`,
    );
    const { pathElements, pathIndices, root } = pathRes.data;
    console.log(`      root=${root}`);

    console.log('[4/6] Generating withdrawal proof via native prover-core (same logic as the browser WASM build)...');
    const recipientHex = admin.rawPublicKey().toString('hex');
    const proofRaw = execFileSync(PROVER_BIN, [
      'prove',
      '--secret', secret,
      '--nullifier', nullifier,
      '--path-elements', JSON.stringify(pathElements),
      '--path-indices', JSON.stringify(pathIndices),
      '--root', root,
      '--recipient', recipientHex,
      '--denomination', stateRes.data.denomination,
      '--circuit-id', stateRes.data.circuitId,
      '--pk', PK_PATH,
    ], { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
    const proof = JSON.parse(proofRaw);
    console.log('      proof generated + locally verified by the CLI');

    console.log('[5/6] Submitting proof via POST /privacy-pool/attest-withdrawal...');
    const attestRes = await http<{ success: boolean; data: { attestationId: string } }>(
      base, 'POST', '/privacy-pool/attest-withdrawal',
      { circuit_id: proof.circuit_id, proof: proof.proof, public_inputs: proof.public_inputs },
    );
    const { attestationId } = attestRes.data;
    console.log(`      attestationId=${attestationId}`);

    console.log('[6/6] Withdrawing (ADMIN as recipient)...');
    const withdrawRes = await http<{ success: boolean; data: { txHash: string; recipient: string } }>(
      base, 'POST', '/privacy-pool/withdraw',
      { recipientSecret: config.ADMIN_SECRET_KEY, root, nullifierHash, attestationId },
    );
    console.log(`      withdrawn: txHash=${withdrawRes.data.txHash} recipient=${withdrawRes.data.recipient}`);

    console.log('\nPASS — deposit -> real Merkle path -> proof -> attest-withdrawal -> withdraw succeeded end to end on testnet.');
  } finally {
    server.close();
  }
}

main().catch((e) => { console.error('\nFAIL —', e); process.exitCode = 1; });
