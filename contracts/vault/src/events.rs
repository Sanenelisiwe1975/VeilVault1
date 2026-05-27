use soroban_sdk::{Address, Env, Symbol, symbol_short};
use crate::storage::StrategyType;

pub fn emit_initialized(env: &Env, admin: &Address, asset: &Address) {
    let topics = (symbol_short!("INIT"), admin.clone());
    env.events().publish(topics, asset.clone());
}

pub fn emit_deposit(env: &Env, from: &Address, amount: i128, shares: i128) {
    let topics = (symbol_short!("DEPOSIT"), from.clone());
    env.events().publish(topics, (amount, shares));
}

pub fn emit_withdraw(env: &Env, from: &Address, assets: i128, shares: i128) {
    let topics = (symbol_short!("WITHDRAW"), from.clone());
    env.events().publish(topics, (assets, shares));
}

pub fn emit_position_opened(
    env: &Env,
    position_id: u64,
    agent: &Address,
    protocol: &Address,
    amount: i128,
    strategy_type: StrategyType,
) {
    let topics = (symbol_short!("POS_OPEN"), agent.clone());
    env.events().publish(topics, (position_id, protocol.clone(), amount, strategy_type as u32));
}

pub fn emit_position_closed(
    env: &Env,
    position_id: u64,
    agent: &Address,
    return_amount: i128,
    pnl: i128,
) {
    let topics = (symbol_short!("POS_CLOSE"), agent.clone());
    env.events().publish(topics, (position_id, return_amount, pnl));
}

pub fn emit_agent_added(env: &Env, admin: &Address, agent: &Address) {
    let topics = (symbol_short!("AGT_ADD"), admin.clone());
    env.events().publish(topics, agent.clone());
}

pub fn emit_agent_removed(env: &Env, admin: &Address, agent: &Address) {
    let topics = (symbol_short!("AGT_REM"), admin.clone());
    env.events().publish(topics, agent.clone());
}

pub fn emit_guardrails_updated(env: &Env, admin: &Address) {
    let topics = (symbol_short!("GUARD_UP"), admin.clone());
    env.events().publish(topics, env.ledger().timestamp());
}

pub fn emit_paused(env: &Env, admin: &Address, paused: bool) {
    let topics = (symbol_short!("PAUSE"), admin.clone());
    env.events().publish(topics, paused);
}

pub fn emit_upgraded(env: &Env, admin: &Address) {
    let topics = (symbol_short!("UPGRADE"), admin.clone());
    env.events().publish(topics, env.ledger().timestamp());
}

pub fn emit_emergency_stop(env: &Env, caller: &Address, active: bool) {
    let topics = (symbol_short!("EMERG"), caller.clone());
    env.events().publish(topics, active);
}
