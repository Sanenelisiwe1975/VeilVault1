/**
 * One-shot deploy script for the passkey-registry contract.
 *
 * The backend's /api/auth/passkey/* and /api/passkey/* routes need a
 * deployed passkey-registry instance to record which wallet a credential
 * belongs to. Without PASSKEY_REGISTRY_CONTRACT_ID set, registration fails
 * with "PASSKEY_REGISTRY_CONTRACT_ID not configured" (see passkey.service.ts).
 *
 * Run once per environment: npx ts-node scripts/deploy-passkey-registry.ts
 * Then copy the printed contract ID into backend/.env as
 * PASSKEY_REGISTRY_CONTRACT_ID=<id> and restart the dev server.
 */
import * as fs from 'fs';
import * as path from 'path';
import { Address, Keypair } from '@stellar/stellar-sdk';
import { getStellarClient } from '../src/integrations/stellar/client';
import { config } from '../src/config';

async function main() {
  const stellar = getStellarClient();
  const adminPublicKey = Keypair.fromSecret(config.ADMIN_SECRET_KEY).publicKey();

  const wasmPath = path.resolve(__dirname, '../../contracts/target/wasm32-unknown-unknown/release/passkey_registry.optimized.wasm');
  console.log(`Reading wasm from ${wasmPath}`);
  const wasm = fs.readFileSync(wasmPath);

  console.log('Uploading wasm...');
  const { wasmHash } = await stellar.uploadWasm(wasm, config.ADMIN_SECRET_KEY);

  console.log('Deploying contract instance...');
  const { contractAddress } = await stellar.deployContract({ wasmHash, deployerSecretKey: config.ADMIN_SECRET_KEY });

  console.log('Initializing registry with admin =', adminPublicKey);
  await stellar.invokeContract(contractAddress, 'initialize', [new Address(adminPublicKey).toScVal()], config.ADMIN_SECRET_KEY);

  console.log('\nDone. Set this in backend/.env and restart the dev server:\n');
  console.log(`PASSKEY_REGISTRY_CONTRACT_ID=${contractAddress}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
