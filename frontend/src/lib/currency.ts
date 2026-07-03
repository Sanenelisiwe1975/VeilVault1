/**
 * Currency display helpers — Rand-first display for non-crypto users
 * (mobile-first, South Africa / emerging markets).
 *
 * Rates are static estimates for testnet display only. A production build
 * would fetch these from a price oracle or FX API.
 */

export const ZAR_PER_XLM  = 2.05;   // ≈ display rate, testnet only
export const ZAR_PER_USDC = 18.42;  // ≈ USD/ZAR

export function xlmToZar(xlm: number): number  { return xlm  * ZAR_PER_XLM;  }
export function usdcToZar(usdc: number): number { return usdc * ZAR_PER_USDC; }

export function formatZar(zar: number, decimals = 2): string {
  return `R ${zar.toLocaleString("en-ZA", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

export function formatXlm(xlm: number, decimals = 2): string {
  return `${xlm.toLocaleString("en-ZA", { maximumFractionDigits: decimals })} XLM`;
}
