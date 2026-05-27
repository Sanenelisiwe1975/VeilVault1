use soroban_sdk::{Address, Bytes, Env};
use crate::error::VaultError;
use crate::storage::{self, Position, StrategyType};

/// Open a new position. Returns the new position ID.
///
/// Does NOT transfer tokens — the caller (lib.rs) handles the transfer and
/// deployed-assets accounting before/after calling this.
pub fn open(
    env: &Env,
    agent: Address,
    protocol: Address,
    asset: Address,
    amount: i128,
    expires_at: u64,
    strategy_type: StrategyType,
    metadata: Bytes,
) -> Result<u64, VaultError> {
    let id = storage::next_position_id(env);
    let position = Position {
        id,
        agent,
        protocol,
        asset,
        amount,
        entry_value: amount,
        opened_at: env.ledger().timestamp(),
        expires_at,
        strategy_type,
        metadata,
        is_open: true,
    };
    storage::set_position(env, &position);
    Ok(id)
}

/// Close an existing position and return the PnL (may be negative).
///
/// Does NOT transfer tokens — the caller handles the transfer.
pub fn close(
    env: &Env,
    position_id: u64,
    caller: &Address,
    return_amount: i128,
) -> Result<(Position, i128), VaultError> {
    let mut position = storage::get_position(env, position_id)
        .ok_or(VaultError::PositionNotFound)?;

    if !position.is_open {
        return Err(VaultError::PositionAlreadyClosed);
    }

    // Only the agent that opened the position (or admin) may close it.
    // Admin auth is checked in the contract entry point; here we check agent.
    if &position.agent != caller {
        return Err(VaultError::Unauthorized);
    }

    let pnl = return_amount
        .checked_sub(position.amount)
        .ok_or(VaultError::ArithmeticOverflow)?;

    position.is_open = false;
    storage::set_position(env, &position);

    Ok((position, pnl))
}

/// Fetch a position, returning an error if it doesn't exist.
pub fn get(env: &Env, position_id: u64) -> Result<Position, VaultError> {
    storage::get_position(env, position_id).ok_or(VaultError::PositionNotFound)
}
