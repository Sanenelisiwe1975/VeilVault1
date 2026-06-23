import dotenv from 'dotenv';
import { z } from 'zod';

import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),

  // Stellar / Soroban
  STELLAR_NETWORK: z.enum(['testnet', 'mainnet', 'futurenet']).default('testnet'),
  STELLAR_RPC_URL: z.string().url(),
  STELLAR_HORIZON_URL: z.string().url(),
  STELLAR_NETWORK_PASSPHRASE: z.string(),

  // Contract addresses (populated after deployment)
  VAULT_CONTRACT_ID: z.string().optional(),
  X402_VERIFIER_CONTRACT_ID: z.string().optional(),
  DWALLET_VERIFIER_CONTRACT_ID: z.string().optional(),
  AGENT_REGISTRY_CONTRACT_ID: z.string().optional(),
  STRATEGY_MARKETPLACE_CONTRACT_ID: z.string().optional(),
  STOKVEL_REGISTRY_CONTRACT_ID: z.string().optional(),
  ZK_VERIFIER_CONTRACT_ID: z.string().optional(),
  PRIVACY_POOL_CONTRACT_ID: z.string().optional(),
  WITHDRAW_CIRCUIT_ID: z.string().optional(),
  PASSKEY_REGISTRY_CONTRACT_ID: z.string().optional(),

  // Admin keypair (secret key for signing admin transactions)
  ADMIN_SECRET_KEY: z.string(),

  // SEP-10 Web Authentication
  // Dedicated signing key for SEP-10 challenges; falls back to ADMIN_SECRET_KEY if unset.
  SEP10_SIGNING_SECRET_KEY: z.string().optional(),
  WEB_AUTH_DOMAIN: z.string().default('veilvault1.onrender.com'),
  HOME_DOMAIN: z.string().default('veil-vault1.vercel.app'),

  // Passkey / account-abstraction sign-in (WebAuthn + Soroban smart-wallet contract)
  WEBAUTHN_RP_NAME: z.string().default('VeilVault1'),
  WEBAUTHN_RP_ID: z.string().default('localhost'),
  WEBAUTHN_ORIGIN: z.string().default('http://localhost:5173'),
  SMART_WALLET_WASM_HASH: z.string().optional(),

  // Oracle keypair (for x402 payment attestation)
  ORACLE_SECRET_KEY: z.string(),

  // Ika dWallet API
  IKA_API_URL: z.string().url(),
  IKA_API_KEY: z.string(),
  IKA_NETWORK: z.enum(['testnet', 'mainnet']).default('testnet'),

  // FHE configuration
  FHE_KEY_SIZE: z.coerce.number().default(128),
  FHE_KEYS_DIR: z.string().default('./fhe-keys'),

  // Security
  JWT_SECRET: z.string().min(32),
  API_KEY_HASH: z.string().optional(),

  // Monitoring
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
});

type Env = z.infer<typeof EnvSchema>;

function loadConfig(): Env {
  const result = EnvSchema.safeParse(process.env);
  if (!result.success) {
    const missing = result.error.issues
      .map(i => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Configuration error:\n${missing}`);
  }
  return result.data;
}

export const config = loadConfig();

export const STELLAR_NETWORKS = {
  testnet: {
    rpcUrl: 'https://soroban-testnet.stellar.org',
    horizonUrl: 'https://horizon-testnet.stellar.org',
    passphrase: 'Test SDF Network ; September 2015',
  },
  mainnet: {
    rpcUrl: 'https://mainnet.sorobanrpc.com',
    horizonUrl: 'https://horizon.stellar.org',
    passphrase: 'Public Global Stellar Network ; September 2015',
  },
  futurenet: {
    rpcUrl: 'https://rpc-futurenet.stellar.org',
    horizonUrl: 'https://horizon-futurenet.stellar.org',
    passphrase: 'Test SDF Future Network ; October 2022',
  },
} as const;
