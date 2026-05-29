/**
 * Stellar transaction utilities.
 * Builds, signs, and submits native Stellar transactions from the frontend.
 */
import {
  Horizon,
  TransactionBuilder,
  Asset,
  Operation,
  Keypair,
  Networks,
  Memo,
  Transaction,
} from "@stellar/stellar-sdk";

const HORIZON_URL = "https://horizon-testnet.stellar.org";
const NETWORK_PASSPHRASE = Networks.TESTNET;
const BASE_FEE = "100"; // stroops

export const horizonServer = new Horizon.Server(HORIZON_URL);

// ─── Transaction building ─────────────────────────────────────────────────────

export async function buildPaymentTx(params: {
  from:   string;
  to:     string;
  amount: string;   // in XLM (e.g. "10.5")
  asset?: "XLM" | "USDC";
  memo?:  string;
}): Promise<Transaction> {
  const account = await horizonServer.loadAccount(params.from);
  const builder = new TransactionBuilder(account, {
    fee:              BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  });

  const asset = params.asset === "USDC"
    ? new Asset("USDC", "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN")
    : Asset.native();

  builder.addOperation(
    Operation.payment({ destination: params.to, asset, amount: params.amount })
  );

  if (params.memo) builder.addMemo(Memo.text(params.memo.slice(0, 28)));
  builder.setTimeout(30);

  return builder.build();
}

// ─── Signing ──────────────────────────────────────────────────────────────────

/** Sign with a raw secret key. */
export function signWithSecret(tx: Transaction, secretKey: string): Transaction {
  const kp = Keypair.fromSecret(secretKey);
  tx.sign(kp);
  return tx;
}

/** Sign a challenge message with a secret key (for auth). */
export function signChallenge(challenge: string, secretKey: string): string {
  const kp  = Keypair.fromSecret(secretKey);
  const sig = kp.sign(Buffer.from(challenge, "utf8"));
  return sig.toString("base64");
}

// ─── Submission ───────────────────────────────────────────────────────────────

export async function submitTx(tx: Transaction): Promise<string> {
  const result = await horizonServer.submitTransaction(tx);
  return result.hash;
}

/** Build → sign → submit in one call (secret-key path). */
export async function sendPayment(params: {
  fromSecret: string;
  to:         string;
  amount:     string;
  asset?:     "XLM" | "USDC";
  memo?:      string;
}): Promise<string> {
  const from = Keypair.fromSecret(params.fromSecret).publicKey();
  const tx   = await buildPaymentTx({ from, to: params.to, amount: params.amount, asset: params.asset, memo: params.memo });
  signWithSecret(tx, params.fromSecret);
  return submitTx(tx);
}

/** Build → sign via Freighter → submit. */
export async function sendPaymentFreighter(params: {
  from:   string;
  to:     string;
  amount: string;
  asset?: "XLM" | "USDC";
  memo?:  string;
  signFreighter: (xdr: string) => Promise<string>;
}): Promise<string> {
  const tx        = await buildPaymentTx(params);
  const signedXdr = await params.signFreighter(tx.toXDR());
  const signed    = TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE) as Transaction;
  return submitTx(signed);
}

// ─── Freighter detection ──────────────────────────────────────────────────────

export function isFreighterAvailable(): boolean {
  return typeof window !== "undefined" && !!(window as Window & { freighter?: unknown }).freighter;
}
