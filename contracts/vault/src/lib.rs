#![no_std]

mod error;
mod events;
mod guardrails;
mod positions;
mod storage;

use soroban_sdk::{
    contract, contractimpl, token, Address, Bytes, BytesN, Env, String,
};

use error::VaultError;
use storage::{GuardrailsConfig, Position, StrategyType, VaultConfig};

// External contract interfaces

mod x402_verifier {
    soroban_sdk::contractimport!(
        file = "../../target/wasm32-unknown-unknown/release/x402_verifier.wasm"
    );
}

mod dwallet_verifier {
    soroban_sdk::contractimport!(
        file = "../../target/wasm32-unknown-unknown/release/dwallet_verifier.wasm"
    );
}

mod agent_registry {
    soroban_sdk::contractimport!(
        file = "../../target/wasm32-unknown-unknown/release/agent_registry.wasm"
    );
}

// Contract

#[contract]
pub struct VaultContract;

#[contractimpl]
impl VaultContract {
    // Initialisation

    /// Create and configure the vault. Can only be called once.
    pub fn initialize(
        env: Env,
        admin: Address,
        name: String,
        asset: Address,
        guardrails: GuardrailsConfig,
    ) -> Result<(), VaultError> {
        if storage::has_vault_config(&env) {
            return Err(VaultError::AlreadyInitialized);
        }
        admin.require_auth();

        let config = VaultConfig {
            admin: admin.clone(),
            name,
            asset,
            guardrails,
            paused: false,
            x402_verifier: None,
            dwallet_verifier: None,
            agent_registry: None,
            min_agent_level: 0,
        };
        storage::set_vault_config(&env, &config);
        storage::set_total_shares(&env, 0);
        storage::set_total_assets(&env, 0);
        storage::set_deployed_assets(&env, 0);

        events::emit_initialized(&env, &admin, &config.asset);
        Ok(())
    }

    // Deposits & Withdrawals

    /// Deposit `amount` of the vault asset; returns shares minted.
    pub fn deposit(env: Env, from: Address, amount: i128) -> Result<i128, VaultError> {
        from.require_auth();
        let config = Self::require_active(&env)?;

        guardrails::check_deposit(&env, &config.guardrails, amount)?;

        let total_assets = storage::get_total_assets(&env);
        let total_shares = storage::get_total_shares(&env);

        let shares = guardrails::assets_to_shares(amount, total_shares, total_assets)?;
        if shares <= 0 {
            return Err(VaultError::ZeroShares);
        }

        token::Client::new(&env, &config.asset).transfer(
            &from,
            &env.current_contract_address(),
            &amount,
        );

        storage::set_balance(&env, &from, storage::get_balance(&env, &from) + shares);
        storage::set_total_shares(&env, total_shares + shares);
        storage::set_total_assets(&env, total_assets + amount);
        storage::set_last_deposit_time(&env, &from, env.ledger().timestamp());

        events::emit_deposit(&env, &from, amount, shares);
        Ok(shares)
    }

    /// Burn `shares`; returns the corresponding asset amount transferred back.
    pub fn withdraw(env: Env, from: Address, shares: i128) -> Result<i128, VaultError> {
        from.require_auth();
        let config = Self::require_active(&env)?;

        // Time-lock check
        if config.guardrails.time_lock_seconds > 0 {
            let last = storage::get_last_deposit_time(&env, &from);
            let now = env.ledger().timestamp();
            if now < last + config.guardrails.time_lock_seconds {
                return Err(VaultError::TimeLockActive);
            }
        }

        let user_shares = storage::get_balance(&env, &from);
        if shares <= 0 || shares > user_shares {
            return Err(VaultError::InsufficientShares);
        }

        let total_shares = storage::get_total_shares(&env);
        let total_assets = storage::get_total_assets(&env);

        let assets = guardrails::shares_to_assets(shares, total_shares, total_assets)?;

        // Ensure the vault actually holds enough liquid (non-deployed) funds
        let deployed = storage::get_deployed_assets(&env);
        let liquid = total_assets.checked_sub(deployed).ok_or(VaultError::ArithmeticOverflow)?;
        if assets > liquid {
            return Err(VaultError::InsufficientAssets);
        }

        guardrails::check_withdrawal(&env, &config.guardrails, assets, total_assets)?;

        storage::set_balance(&env, &from, user_shares - shares);
        storage::set_total_shares(&env, total_shares - shares);
        storage::set_total_assets(&env, total_assets - assets);

        // Record daily spending
        guardrails::record_spending(&env, assets);

        token::Client::new(&env, &config.asset).transfer(
            &env.current_contract_address(),
            &from,
            &assets,
        );

        events::emit_withdraw(&env, &from, assets, shares);
        Ok(assets)
    }

    // Position management (agents)

    /// Open a yield/strategy position. Transfers `amount` from vault to `protocol`.
    ///
    /// `metadata` may contain FHE-encrypted strategy parameters.
    pub fn open_position(
        env: Env,
        agent: Address,
        protocol: Address,
        amount: i128,
        expires_at: u64,
        strategy_type: u32,
        metadata: Bytes,
    ) -> Result<u64, VaultError> {
        agent.require_auth();
        let config = Self::require_active(&env)?;

        if !storage::is_authorized_agent(&env, &agent) {
            return Err(VaultError::AgentNotAuthorized);
        }

        let st = StrategyType::from_u32(strategy_type).ok_or(VaultError::InvalidStrategyType)?;
        let total_assets = storage::get_total_assets(&env);

        guardrails::check_position_open(&env, &config.guardrails, &protocol, amount, total_assets)?;

        // Transfer vault asset to the protocol
        token::Client::new(&env, &config.asset).transfer(
            &env.current_contract_address(),
            &protocol,
            &amount,
        );

        let deployed = storage::get_deployed_assets(&env);
        storage::set_deployed_assets(&env, deployed + amount);

        // Record daily spending
        guardrails::record_spending(&env, amount);

        let position_id = positions::open(
            &env,
            agent.clone(),
            protocol.clone(),
            config.asset.clone(),
            amount,
            expires_at,
            st,
            metadata,
        )?;

        events::emit_position_opened(&env, position_id, &agent, &protocol, amount, st);
        Ok(position_id)
    }

    /// Close an open position. `return_amount` is transferred from `protocol` to the vault.
    pub fn close_position(
        env: Env,
        agent: Address,
        position_id: u64,
        return_amount: i128,
    ) -> Result<i128, VaultError> {
        agent.require_auth();
        let config = Self::require_active(&env)?;

        if !storage::is_authorized_agent(&env, &agent) {
            return Err(VaultError::AgentNotAuthorized);
        }

        let position = positions::get(&env, position_id)?;

        // Transfer return funds from protocol back to vault
        token::Client::new(&env, &config.asset).transfer_from(
            &agent,
            &position.protocol,
            &env.current_contract_address(),
            &return_amount,
        );

        let (pos, pnl) = positions::close(&env, position_id, &agent, return_amount)?;

        // Update accounting
        let deployed = storage::get_deployed_assets(&env);
        let new_deployed = deployed.checked_sub(pos.amount).ok_or(VaultError::ArithmeticOverflow)?;
        storage::set_deployed_assets(&env, new_deployed);

        // Adjust total assets by PnL
        let total_assets = storage::get_total_assets(&env);
        let new_total = total_assets.checked_add(pnl).ok_or(VaultError::ArithmeticOverflow)?;
        storage::set_total_assets(&env, new_total);

        // Update agent reputation on registry (best-effort; non-blocking)
        if let Some(registry_addr) = &config.agent_registry {
            let registry = agent_registry::Client::new(&env, registry_addr);
            // Compute return in bps relative to deployed amount
            let return_bps = if pos.amount > 0 {
                (pnl * 10_000) / pos.amount
            } else {
                0
            };
            if pnl >= 0 {
                // record_success(agent, return_bps)
                registry.record_success(&agent, &(return_bps as u32));
            } else {
                // record_failure(agent)
                registry.record_failure(&agent);
            }
        }

        events::emit_position_closed(&env, position_id, &agent, return_amount, pnl);
        Ok(pnl)
    }

    // Agent management

    pub fn add_agent(env: Env, agent: Address) -> Result<(), VaultError> {
        let config = Self::require_admin(&env)?;
        if storage::is_authorized_agent(&env, &agent) {
            return Err(VaultError::AgentAlreadyAuthorized);
        }

        // Enforce minimum reputation level if registry is wired
        if let Some(registry_addr) = &config.agent_registry {
            if config.min_agent_level > 0 {
                let registry = agent_registry::Client::new(&env, registry_addr);
                if !registry.meets_minimum_level(&agent, &config.min_agent_level) {
                    return Err(VaultError::AgentNotAuthorized);
                }
            }
        }

        storage::set_agent_authorization(&env, &agent, true);
        events::emit_agent_added(&env, &config.admin, &agent);
        Ok(())
    }

    pub fn remove_agent(env: Env, agent: Address) -> Result<(), VaultError> {
        let config = Self::require_admin(&env)?;
        if !storage::is_authorized_agent(&env, &agent) {
            return Err(VaultError::AgentNotAuthorized);
        }
        storage::set_agent_authorization(&env, &agent, false);
        events::emit_agent_removed(&env, &config.admin, &agent);
        Ok(())
    }

    // Guardrails & administration

    pub fn update_guardrails(env: Env, new_guardrails: GuardrailsConfig) -> Result<(), VaultError> {
        let mut config = Self::require_admin(&env)?;
        config.guardrails = new_guardrails;
        storage::set_vault_config(&env, &config);
        events::emit_guardrails_updated(&env, &config.admin);
        Ok(())
    }

    pub fn set_paused(env: Env, paused: bool) -> Result<(), VaultError> {
        let mut config = Self::require_admin(&env)?;
        config.paused = paused;
        storage::set_vault_config(&env, &config);
        events::emit_paused(&env, &config.admin, paused);
        Ok(())
    }

    pub fn emergency_stop(env: Env) -> Result<(), VaultError> {
        let mut config = Self::require_admin(&env)?;
        config.guardrails.emergency_stop = true;
        config.paused = true;
        storage::set_vault_config(&env, &config);
        events::emit_emergency_stop(&env, &config.admin, true);
        Ok(())
    }

    pub fn set_x402_verifier(env: Env, verifier: Address) -> Result<(), VaultError> {
        let mut config = Self::require_admin(&env)?;
        config.x402_verifier = Some(verifier);
        storage::set_vault_config(&env, &config);
        Ok(())
    }

    pub fn set_dwallet_verifier(env: Env, verifier: Address) -> Result<(), VaultError> {
        let mut config = Self::require_admin(&env)?;
        config.dwallet_verifier = Some(verifier);
        storage::set_vault_config(&env, &config);
        Ok(())
    }

    pub fn set_agent_registry(env: Env, registry: Address) -> Result<(), VaultError> {
        let mut config = Self::require_admin(&env)?;
        config.agent_registry = Some(registry);
        storage::set_vault_config(&env, &config);
        Ok(())
    }

    pub fn set_min_agent_level(env: Env, level: u32) -> Result<(), VaultError> {
        if level > 3 {
            return Err(VaultError::InvalidStrategyType); // reuse error for out-of-range
        }
        let mut config = Self::require_admin(&env)?;
        config.min_agent_level = level;
        storage::set_vault_config(&env, &config);
        Ok(())
    }

    /// Allow an authorized agent to hand off a sub-task to a delegate agent.
    /// The delegate must also be authorized in this vault, ensuring both agents
    /// have passed minimum-level checks. Emits an event for off-chain orchestration.
    pub fn delegate_operation(
        env: Env,
        orchestrator: Address,
        delegate: Address,
        operation_id: BytesN<32>,
        metadata: Bytes,
    ) -> Result<(), VaultError> {
        orchestrator.require_auth();
        Self::require_active(&env)?;

        if !storage::is_authorized_agent(&env, &orchestrator) {
            return Err(VaultError::AgentNotAuthorized);
        }
        if !storage::is_authorized_agent(&env, &delegate) {
            return Err(VaultError::AgentNotAuthorized);
        }

        env.events().publish(
            (soroban_sdk::symbol_short!("delegate"), soroban_sdk::symbol_short!("op")),
            (operation_id, orchestrator, delegate, metadata),
        );
        Ok(())
    }

    /// Upgrade the contract WASM (admin-only).
    pub fn upgrade(env: Env, new_wasm_hash: BytesN<32>) -> Result<(), VaultError> {
        let config = Self::require_admin(&env)?;
        env.deployer().update_current_contract_wasm(new_wasm_hash);
        events::emit_upgraded(&env, &config.admin);
        Ok(())
    }

    // View methods

    pub fn get_vault_info(env: Env) -> Result<VaultConfig, VaultError> {
        if !storage::has_vault_config(&env) {
            return Err(VaultError::NotInitialized);
        }
        Ok(storage::get_vault_config(&env))
    }

    pub fn get_balance(env: Env, address: Address) -> i128 {
        storage::get_balance(&env, &address)
    }

    pub fn get_total_shares(env: Env) -> i128 {
        storage::get_total_shares(&env)
    }

    pub fn get_total_assets(env: Env) -> i128 {
        storage::get_total_assets(&env)
    }

    /// Total vault value = liquid assets + deployed capital.
    pub fn get_total_value(env: Env) -> i128 {
        storage::get_total_assets(&env)
    }

    /// How many asset units correspond to `shares`.
    pub fn convert_to_assets(env: Env, shares: i128) -> Result<i128, VaultError> {
        guardrails::shares_to_assets(
            shares,
            storage::get_total_shares(&env),
            storage::get_total_assets(&env),
        )
    }

    /// How many shares correspond to `assets`.
    pub fn convert_to_shares(env: Env, assets: i128) -> Result<i128, VaultError> {
        guardrails::assets_to_shares(
            assets,
            storage::get_total_shares(&env),
            storage::get_total_assets(&env),
        )
    }

    pub fn get_position(env: Env, position_id: u64) -> Result<Position, VaultError> {
        positions::get(&env, position_id)
    }

    pub fn get_position_count(env: Env) -> u64 {
        storage::get_position_count(&env)
    }

    pub fn is_authorized_agent(env: Env, agent: Address) -> bool {
        storage::is_authorized_agent(&env, &agent)
    }

    // Internal helpers

    fn require_active(env: &Env) -> Result<VaultConfig, VaultError> {
        if !storage::has_vault_config(env) {
            return Err(VaultError::NotInitialized);
        }
        let config = storage::get_vault_config(env);
        if config.paused {
            return Err(VaultError::VaultPaused);
        }
        Ok(config)
    }

    fn require_admin(env: &Env) -> Result<VaultConfig, VaultError> {
        if !storage::has_vault_config(env) {
            return Err(VaultError::NotInitialized);
        }
        let config = storage::get_vault_config(env);
        config.admin.require_auth();
        Ok(config)
    }
}
