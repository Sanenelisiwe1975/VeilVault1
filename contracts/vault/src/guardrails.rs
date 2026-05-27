use soroban_sdk::{Address, Env};
use crate::error::VaultError;
use crate::storage::{self, GuardrailsConfig};

/// Validate a deposit against active guardrails.
pub fn check_deposit(env: &Env, config: &GuardrailsConfig, amount: i128) -> Result<(), VaultError> {
    if config.emergency_stop {
        return Err(VaultError::EmergencyStopActive);
    }
    if amount <= 0 {
        return Err(VaultError::InvalidAmount);
    }
    Ok(())
}

/// Validate a withdrawal against active guardrails.
///
/// `total_assets` is the vault's current total asset value (vault balance
/// + deployed capital).
pub fn check_withdrawal(
    env: &Env,
    config: &GuardrailsConfig,
    amount: i128,
    total_assets: i128,
) -> Result<(), VaultError> {
    if config.emergency_stop {
        return Err(VaultError::EmergencyStopActive);
    }
    if amount <= 0 {
        return Err(VaultError::InvalidAmount);
    }

    // Max drawdown: no single withdrawal may exceed max_drawdown_bps of total assets.
    if config.max_drawdown_bps > 0 && total_assets > 0 {
        let drawdown_bps = checked_mul_div(amount, 10_000, total_assets)?;
        if drawdown_bps as u32 > config.max_drawdown_bps {
            return Err(VaultError::DrawdownLimitExceeded);
        }
    }

    // Daily spending cap.
    if config.daily_spending_cap > 0 {
        let day = env.ledger().timestamp() / 86_400;
        let spent = storage::get_daily_spending(env, day);
        if spent.checked_add(amount).ok_or(VaultError::ArithmeticOverflow)? > config.daily_spending_cap {
            return Err(VaultError::SpendingCapExceeded);
        }
    }

    Ok(())
}

/// Validate opening a position (deploying vault capital to a protocol).
pub fn check_position_open(
    env: &Env,
    config: &GuardrailsConfig,
    protocol: &Address,
    amount: i128,
    total_assets: i128,
) -> Result<(), VaultError> {
    if config.emergency_stop {
        return Err(VaultError::EmergencyStopActive);
    }
    if amount <= 0 {
        return Err(VaultError::InvalidAmount);
    }

    // Protocol must be whitelisted.
    let is_whitelisted = config
        .whitelisted_protocols
        .iter()
        .any(|addr| &addr == protocol);
    if !is_whitelisted {
        return Err(VaultError::ProtocolNotWhitelisted);
    }

    // Max position size.
    if config.max_position_size_bps > 0 && total_assets > 0 {
        let size_bps = checked_mul_div(amount, 10_000, total_assets)?;
        if size_bps as u32 > config.max_position_size_bps {
            return Err(VaultError::PositionSizeTooLarge);
        }
    }

    // Daily spending cap applies to position openings too.
    if config.daily_spending_cap > 0 {
        let day = env.ledger().timestamp() / 86_400;
        let spent = storage::get_daily_spending(env, day);
        if spent.checked_add(amount).ok_or(VaultError::ArithmeticOverflow)? > config.daily_spending_cap {
            return Err(VaultError::SpendingCapExceeded);
        }
    }

    Ok(())
}

/// Record outgoing spending for the current day.
pub fn record_spending(env: &Env, amount: i128) {
    let day = env.ledger().timestamp() / 86_400;
    storage::add_daily_spending(env, day, amount);
}

// ── Arithmetic helpers ────────────────────────────────────────────────────────

/// Computes `(a * b) / c` with checked arithmetic.
pub fn checked_mul_div(a: i128, b: i128, c: i128) -> Result<i128, VaultError> {
    a.checked_mul(b)
        .and_then(|v| v.checked_div(c))
        .ok_or(VaultError::ArithmeticOverflow)
}

/// ERC4626-style share calculation: shares = amount * total_shares / total_assets
pub fn assets_to_shares(amount: i128, total_shares: i128, total_assets: i128) -> Result<i128, VaultError> {
    if total_shares == 0 || total_assets == 0 {
        return Ok(amount); // 1:1 for first deposit
    }
    checked_mul_div(amount, total_shares, total_assets)
}

/// ERC4626-style asset calculation: assets = shares * total_assets / total_shares
pub fn shares_to_assets(shares: i128, total_shares: i128, total_assets: i128) -> Result<i128, VaultError> {
    if total_shares == 0 {
        return Ok(0);
    }
    checked_mul_div(shares, total_assets, total_shares)
}
