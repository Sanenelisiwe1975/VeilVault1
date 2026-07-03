import { getStellarClient } from '../src/integrations/stellar/client';
import { config } from '../src/config';
import { Keypair, Address, nativeToScVal } from '@stellar/stellar-sdk';

const NATIVE_SAC = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';
const WASM_HASH = Buffer.from('5ac0911bc0cd4f4196e9379a257a8ce8dd270648337c3a600dff24d164fe8f3c', 'hex');

(async () => {
  const c = getStellarClient();
  const admin = Keypair.fromSecret(config.ADMIN_SECRET_KEY).publicKey();

  const { contractAddress } = await c.deployContract({ wasmHash: WASM_HASH, deployerSecretKey: config.ADMIN_SECRET_KEY });
  console.log('deployed:', contractAddress);

  const guardrails = nativeToScVal({
    daily_spending_cap: 0n,
    emergency_stop: false,
    max_drawdown_bps: 5000,
    max_leverage_bps: 0,
    max_position_size_bps: 7000,
    time_lock_seconds: 0n,
    whitelisted_protocols: [],
  }, { type: {
    daily_spending_cap: ['symbol', 'i128'],
    emergency_stop: ['symbol', null],
    max_drawdown_bps: ['symbol', 'u32'],
    max_leverage_bps: ['symbol', 'u32'],
    max_position_size_bps: ['symbol', 'u32'],
    time_lock_seconds: ['symbol', 'u64'],
    whitelisted_protocols: ['symbol', null],
  }});

  await c.invokeContract(contractAddress, 'initialize', [
    new Address(admin).toScVal(),
    nativeToScVal('VeilVault1-Testnet', { type: 'string' }),
    new Address(NATIVE_SAC).toScVal(),
    guardrails,
  ], config.ADMIN_SECRET_KEY);
  console.log('initialized with native XLM');

  for (const [fn, cid] of [
    ['set_agent_registry',   'CBND24UI7RBAYCXLZM5RH42EVXQLBG6XR3Y4ONA673YBTQQEBPZ6S2TA'],
    ['set_dwallet_verifier', 'CDO5BCWNNRK3BOKKLEUKSK4B4PA656725UFNCBA5SJCXO75GNFPIZQGG'],
    ['set_x402_verifier',    'CATRAJKXFDKULWQ2V47LFOBEQFXUPKAF7S73UNMZ4H2YTLIZEKEIBK5N'],
  ] as const) {
    try {
      await c.invokeContract(contractAddress, fn, [new Address(cid).toScVal()], config.ADMIN_SECRET_KEY);
      console.log(fn, 'OK');
    } catch (e) { console.log(fn, 'FAILED:', (e as Error).message.slice(0, 120)); }
  }
  console.log('NEW_VAULT=' + contractAddress);
})();
