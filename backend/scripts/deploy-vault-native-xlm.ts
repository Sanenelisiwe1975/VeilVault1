/**
 * One-shot redeploy of the vault contract configured for native XLM instead
 * of USDC.
 *
 * The live VAULT_CONTRACT_ID's `asset` is the testnet USDC SAC
 * (CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA) — but every
 * label in the deposit UI says XLM, and there's no USDC issuer key anywhere
 * in this project to mint test USDC. A vault's `asset` is set once at
 * initialize() with no admin update method, so the fix is a fresh instance
 * with `asset` = the native XLM Stellar Asset Contract, matching what the UI
 * already says everywhere. The existing instance is left untouched —
 * nothing has real deposits in it yet on this testnet.
 *
 * Run with: npx ts-node scripts/deploy-vault-native-xlm.ts
 * Then copy the printed VAULT_CONTRACT_ID into the root .env and restart
 * the backend dev server.
 */
import * as fs from 'fs';
import * as path from 'path';
import { Address, Asset, Keypair, Networks, nativeToScVal, xdr } from '@stellar/stellar-sdk';
import { getStellarClient } from '../src/integrations/stellar/client';
import { config } from '../src/config';

/** Soroban encodes #[contracttype] structs as a Map with Symbol keys (not
 *  String) — see the same issue fixed in zk-attestation.service.ts's Proof
 *  argument earlier in this project's history. */
function guardrailsConfigScVal(): xdr.ScVal {
  const entries: [string, xdr.ScVal][] = [
    ['max_drawdown_bps',       nativeToScVal(5000, { type: 'u32' })],
    ['daily_spending_cap',     nativeToScVal(0n, { type: 'i128' })],
    ['time_lock_seconds',      nativeToScVal(0n, { type: 'u64' })],
    ['whitelisted_protocols',  nativeToScVal([], { type: ['address'] })],
    ['max_position_size_bps',  nativeToScVal(7000, { type: 'u32' })],
    ['max_leverage_bps',       nativeToScVal(0, { type: 'u32' })],
    ['emergency_stop',         nativeToScVal(false)],
  ];
  // Map entries must be sorted by key (Soroban's canonical map ordering).
  entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return xdr.ScVal.scvMap(
    entries.map(([key, val]) => new xdr.ScMapEntry({
      key: nativeToScVal(key, { type: 'symbol' }),
      val,
    })),
  );
}

async function main() {
  const stellar = getStellarClient();
  const adminPublicKey = Keypair.fromSecret(config.ADMIN_SECRET_KEY).publicKey();

  const nativeAssetId = new Address(Asset.native().contractId(Networks.TESTNET)).toString();
  console.log('Native XLM SAC address:', nativeAssetId);

  const wasmPath = path.resolve(__dirname, '../../contracts/target/wasm32-unknown-unknown/release/vault.optimized.wasm');
  console.log(`Reading wasm from ${wasmPath}`);
  const wasm = fs.readFileSync(wasmPath);

  console.log('Uploading wasm...');
  const { wasmHash } = await stellar.uploadWasm(wasm, config.ADMIN_SECRET_KEY);

  console.log('Deploying contract instance...');
  const { contractAddress } = await stellar.deployContract({ wasmHash, deployerSecretKey: config.ADMIN_SECRET_KEY });

  console.log('Initializing vault with native XLM asset...');
  await stellar.invokeContract({
    contractId: contractAddress,
    method: 'initialize',
    args: [
      new Address(adminPublicKey).toScVal(),
      nativeToScVal('VeilVault1-Testnet', { type: 'string' }),
      new Address(nativeAssetId).toScVal(),
      guardrailsConfigScVal(),
    ],
    signerSecretKey: config.ADMIN_SECRET_KEY,
  });

  console.log('Wiring agent registry / dwallet verifier / x402 verifier (matching the old instance)...');
  if (config.AGENT_REGISTRY_CONTRACT_ID) {
    await stellar.invokeContract({
      contractId: contractAddress, method: 'set_agent_registry',
      args: [new Address(config.AGENT_REGISTRY_CONTRACT_ID).toScVal()],
      signerSecretKey: config.ADMIN_SECRET_KEY,
    });
  }
  if (config.DWALLET_VERIFIER_CONTRACT_ID) {
    await stellar.invokeContract({
      contractId: contractAddress, method: 'set_dwallet_verifier',
      args: [new Address(config.DWALLET_VERIFIER_CONTRACT_ID).toScVal()],
      signerSecretKey: config.ADMIN_SECRET_KEY,
    });
  }
  if (config.X402_VERIFIER_CONTRACT_ID) {
    await stellar.invokeContract({
      contractId: contractAddress, method: 'set_x402_verifier',
      args: [new Address(config.X402_VERIFIER_CONTRACT_ID).toScVal()],
      signerSecretKey: config.ADMIN_SECRET_KEY,
    });
  }

  console.log('\nDone. Set this in the root .env and restart the backend dev server:\n');
  console.log(`VAULT_CONTRACT_ID=${contractAddress}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
