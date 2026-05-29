/** x402 payment protocol stub — real integration wires to the Stellar backend. */

export const X402_FEE_LAMPORTS = 5000n;

export function formatX402Fee(lamports: bigint): string {
  return `${(Number(lamports) / 1_000_000_000).toFixed(6)} SOL`;
}
