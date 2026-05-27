/**
 * Tests for vault business logic that can run without a live Soroban node.
 * These validate share/asset math and input validation used by vault.service.ts.
 */

describe('Share / asset conversion math', () => {
  // Mirrors the Rust guardrails::assets_to_shares logic:
  //   if total_shares == 0: shares = amount  (1:1 bootstrap)
  //   else: shares = amount * total_shares / total_assets
  function assetsToShares(amount: bigint, totalShares: bigint, totalAssets: bigint): bigint {
    if (totalShares === 0n) return amount;
    if (totalAssets === 0n) throw new Error('ZeroDivision');
    return (amount * totalShares) / totalAssets;
  }

  // Mirrors guardrails::shares_to_assets:
  //   assets = shares * total_assets / total_shares
  function sharesToAssets(shares: bigint, totalShares: bigint, totalAssets: bigint): bigint {
    if (totalShares === 0n) throw new Error('ZeroDivision');
    return (shares * totalAssets) / totalShares;
  }

  it('first depositor gets 1:1 shares', () => {
    expect(assetsToShares(100_000_000n, 0n, 0n)).toBe(100_000_000n);
  });

  it('subsequent depositor gets proportional shares', () => {
    // 100 USDC in, 100 shares outstanding, vault holds 100 USDC
    // → depositing 50 USDC should yield 50 shares
    expect(assetsToShares(50_000_000n, 100_000_000n, 100_000_000n)).toBe(50_000_000n);
  });

  it('share price reflects vault growth (yield earned)', () => {
    // Vault grew from 100 → 120 USDC; 100 shares outstanding
    // → 50 shares should redeem for 60 USDC
    expect(sharesToAssets(50_000_000n, 100_000_000n, 120_000_000n)).toBe(60_000_000n);
  });

  it('assetsToShares dilutes correctly after yield', () => {
    // Vault has 120 USDC, 100 shares → each share = 1.2 USDC
    // → depositing 12 USDC should yield 10 shares
    expect(assetsToShares(12_000_000n, 100_000_000n, 120_000_000n)).toBe(10_000_000n);
  });

  it('roundtrip: deposit then immediate withdraw returns same amount', () => {
    const deposit = 50_000_000n;
    const ts = 100_000_000n;
    const ta = 100_000_000n;
    const shares = assetsToShares(deposit, ts, ta);
    const returned = sharesToAssets(shares, ts + shares, ta + deposit);
    // Due to integer division rounding, allow ±1 stroop
    expect(Math.abs(Number(returned - deposit))).toBeLessThanOrEqual(1);
  });
});

describe('Drawdown guardrail check', () => {
  // Mirrors guardrails::check_withdrawal logic:
  //   if max_drawdown_bps > 0: assets <= total_assets * max_drawdown_bps / 10_000
  function checkWithdrawal(assets: bigint, totalAssets: bigint, maxDrawdownBps: number): boolean {
    if (maxDrawdownBps === 0) return true;
    const cap = (totalAssets * BigInt(maxDrawdownBps)) / 10_000n;
    return assets <= cap;
  }

  it('allows withdrawal within 50% drawdown cap', () => {
    expect(checkWithdrawal(40_000_000n, 100_000_000n, 5000)).toBe(true);
  });

  it('blocks withdrawal exceeding 50% drawdown cap', () => {
    expect(checkWithdrawal(60_000_000n, 100_000_000n, 5000)).toBe(false);
  });

  it('allows any withdrawal when cap is 0 (unlimited)', () => {
    expect(checkWithdrawal(99_000_000n, 100_000_000n, 0)).toBe(true);
  });

  it('blocks withdrawal at exactly max + 1', () => {
    // cap = 100_000_000 * 5000 / 10000 = 50_000_000
    expect(checkWithdrawal(50_000_001n, 100_000_000n, 5000)).toBe(false);
  });

  it('allows withdrawal at exactly the cap', () => {
    expect(checkWithdrawal(50_000_000n, 100_000_000n, 5000)).toBe(true);
  });
});

describe('Daily spending cap check', () => {
  function checkDailySpending(amount: bigint, alreadySpent: bigint, dailyCap: bigint): boolean {
    if (dailyCap === 0n) return true;
    return alreadySpent + amount <= dailyCap;
  }

  it('allows spending within cap', () => {
    expect(checkDailySpending(30_000_000n, 10_000_000n, 50_000_000n)).toBe(true);
  });

  it('blocks spending that exceeds cap', () => {
    expect(checkDailySpending(41_000_000n, 10_000_000n, 50_000_000n)).toBe(false);
  });

  it('unlimited cap (0) always allows', () => {
    expect(checkDailySpending(1_000_000_000n, 500_000_000n, 0n)).toBe(true);
  });
});

describe('Position size guardrail', () => {
  function checkPositionSize(amount: bigint, totalAssets: bigint, maxBps: number): boolean {
    if (maxBps === 0) return true;
    const cap = (totalAssets * BigInt(maxBps)) / 10_000n;
    return amount <= cap;
  }

  it('allows position within 70% cap', () => {
    expect(checkPositionSize(65_000_000n, 100_000_000n, 7000)).toBe(true);
  });

  it('blocks position exceeding 70% cap', () => {
    expect(checkPositionSize(75_000_000n, 100_000_000n, 7000)).toBe(false);
  });
});
