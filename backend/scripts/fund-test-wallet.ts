/**
 * Send testnet XLM from the admin account to any address — classic (G...)
 * or a Soroban contract address like a passkey smart-wallet (C...).
 *
 * Friendbot only funds classic accounts, and a classic `payment` operation
 * can't target a contract address — moving XLM into a contract address
 * requires calling the native XLM Stellar Asset Contract's `transfer`
 * directly, which is what this does. Dev/testnet convenience only.
 *
 * Run with: npx ts-node scripts/fund-test-wallet.ts <address> [xlmAmount=50]
 */
import { Address, Asset, Keypair, Networks, TransactionBuilder, Contract, nativeToScVal, rpc as SorobanRpc } from '@stellar/stellar-sdk';
import { config } from '../src/config';

async function main() {
  const targetAddress = process.argv[2];
  const xlmAmount = Number(process.argv[3] ?? '50');
  if (!targetAddress) throw new Error('Usage: fund-test-wallet.ts <address> [xlmAmount=50]');

  const server = new SorobanRpc.Server(config.STELLAR_RPC_URL);
  const networkPassphrase = Networks.TESTNET;
  const admin = Keypair.fromSecret(config.ADMIN_SECRET_KEY);
  const account = await server.getAccount(admin.publicKey());

  const nativeAssetId = Asset.native().contractId(networkPassphrase);
  const contract = new Contract(nativeAssetId);
  const stroops = BigInt(Math.round(xlmAmount * 1e7));

  const tx = new TransactionBuilder(account, { fee: '500000', networkPassphrase })
    .addOperation(contract.call(
      'transfer',
      new Address(admin.publicKey()).toScVal(),
      new Address(targetAddress).toScVal(),
      nativeToScVal(stroops, { type: 'i128' }),
    ))
    .setTimeout(30)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (SorobanRpc.Api.isSimulationError(sim)) {
    console.error('Simulation failed:', sim.error);
    process.exit(1);
  }
  const prepared = SorobanRpc.assembleTransaction(tx, sim).build();
  prepared.sign(admin);

  const response = await server.sendTransaction(prepared);
  if (response.status === 'ERROR') {
    console.error('Submission failed:', response.errorResult?.toXDR('base64'));
    process.exit(1);
  }

  console.log(`Submitted ${response.hash} — waiting for confirmation...`);
  for (let i = 0; i < 15; i++) {
    const result = await server.getTransaction(response.hash);
    if (result.status === 'SUCCESS') {
      console.log(`Sent ${xlmAmount} XLM to ${targetAddress}`);
      return;
    }
    if (result.status === 'FAILED') {
      console.error('Transaction failed:', JSON.stringify(result, (_k, v) => typeof v === 'bigint' ? v.toString() : v).slice(0, 1000));
      process.exit(1);
    }
    await new Promise(r => setTimeout(r, 2000));
  }
  console.log('Still pending — check the hash above on stellar.expert/explorer.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
