#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger, LedgerInfo},
    token::{Client as TokenClient, StellarAssetClient},
    vec, Address, Bytes, Env, String,
};
use storage::{GuardrailsConfig, StrategyType};

// ── Test helpers ──────────────────────────────────────────────────────────────

fn default_guardrails(env: &Env) -> GuardrailsConfig {
    GuardrailsConfig {
        max_drawdown_bps: 5000,          // 50% max single-tx drawdown
        daily_spending_cap: 0,           // unlimited
        time_lock_seconds: 0,            // no time-lock
        whitelisted_protocols: vec![env],
        max_position_size_bps: 7000,     // 70% max position
        max_leverage_bps: 0,
        emergency_stop: false,
    }
}

struct TestSetup {
    env: Env,
    vault_id: Address,
    vault: VaultContractClient<'static>,
    token: TokenClient<'static>,
    admin: Address,
    alice: Address,
    agent: Address,
}

impl TestSetup {
    fn new() -> Self {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let alice = Address::generate(&env);
        let agent = Address::generate(&env);

        // Deploy a test SAC token
        let token_admin = Address::generate(&env);
        let token_id = env.register_stellar_asset_contract_v2(token_admin.clone());
        let sac = StellarAssetClient::new(&env, &token_id.address());
        let token = TokenClient::new(&env, &token_id.address());

        // Mint tokens for alice
        sac.mint(&alice, &1_000_000_000_i128);

        // Deploy vault
        let vault_id = env.register_contract(None, VaultContract);
        let vault: VaultContractClient<'static> = unsafe {
            core::mem::transmute(VaultContractClient::new(&env, &vault_id))
        };

        let mut guardrails = default_guardrails(&env);

        vault.initialize(
            &admin,
            &String::from_str(&env, "TestVault"),
            &token_id.address(),
            &guardrails,
        );

        Self { env, vault_id, vault, token, admin, alice, agent }
    }
}

// ── Initialisation tests ──────────────────────────────────────────────────────

#[test]
fn test_initialize_success() {
    let setup = TestSetup::new();
    let info = setup.vault.get_vault_info();
    assert_eq!(info.admin, setup.admin);
    assert_eq!(setup.vault.get_total_shares(), 0);
    assert_eq!(setup.vault.get_total_assets(), 0);
}

#[test]
#[should_panic(expected = "AlreadyInitialized")]
fn test_double_initialize_fails() {
    let setup = TestSetup::new();
    setup.vault.initialize(
        &setup.admin,
        &String::from_str(&setup.env, "SecondInit"),
        &setup.token.address,
        &default_guardrails(&setup.env),
    );
}

// ── Deposit tests ─────────────────────────────────────────────────────────────

#[test]
fn test_deposit_mints_shares() {
    let setup = TestSetup::new();
    let shares = setup.vault.deposit(&setup.alice, &100_000_000_i128);
    assert_eq!(shares, 100_000_000); // 1:1 first deposit
    assert_eq!(setup.vault.get_balance(&setup.alice), 100_000_000);
    assert_eq!(setup.vault.get_total_assets(), 100_000_000);
    assert_eq!(setup.vault.get_total_shares(), 100_000_000);
}

#[test]
fn test_second_deposit_proportional_shares() {
    let setup = TestSetup::new();
    let bob = Address::generate(&setup.env);
    let sac = StellarAssetClient::new(&setup.env, &setup.token.address);
    sac.mint(&bob, &200_000_000_i128);

    setup.vault.deposit(&setup.alice, &100_000_000_i128);
    // Vault: 100 assets, 100 shares; bob deposits 200 → should get 200 shares
    let bob_shares = setup.vault.deposit(&bob, &200_000_000_i128);
    assert_eq!(bob_shares, 200_000_000);
    assert_eq!(setup.vault.get_total_assets(), 300_000_000);
    assert_eq!(setup.vault.get_total_shares(), 300_000_000);
}

// ── Withdrawal tests ──────────────────────────────────────────────────────────

#[test]
fn test_withdraw_returns_assets() {
    let setup = TestSetup::new();
    setup.vault.deposit(&setup.alice, &100_000_000_i128);
    let before = setup.token.balance(&setup.alice);
    let assets = setup.vault.withdraw(&setup.alice, &100_000_000_i128);
    assert_eq!(assets, 100_000_000);
    let after = setup.token.balance(&setup.alice);
    assert_eq!(after - before, 100_000_000);
    assert_eq!(setup.vault.get_total_assets(), 0);
    assert_eq!(setup.vault.get_total_shares(), 0);
}

#[test]
#[should_panic(expected = "InsufficientShares")]
fn test_withdraw_more_than_balance_fails() {
    let setup = TestSetup::new();
    setup.vault.deposit(&setup.alice, &100_000_000_i128);
    setup.vault.withdraw(&setup.alice, &200_000_000_i128);
}

#[test]
#[should_panic(expected = "TimeLockActive")]
fn test_time_lock_prevents_immediate_withdrawal() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let alice = Address::generate(&env);

    let token_admin = Address::generate(&env);
    let token_id = env.register_stellar_asset_contract_v2(token_admin.clone());
    StellarAssetClient::new(&env, &token_id.address()).mint(&alice, &1_000_000_000_i128);

    let vault_id = env.register_contract(None, VaultContract);
    let vault = VaultContractClient::new(&env, &vault_id);

    let mut guardrails = default_guardrails(&env);
    guardrails.time_lock_seconds = 3600; // 1 hour lock

    vault.initialize(
        &admin,
        &String::from_str(&env, "LockedVault"),
        &token_id.address(),
        &guardrails,
    );

    vault.deposit(&alice, &100_000_000_i128);
    // Immediately try to withdraw — should fail
    vault.withdraw(&alice, &100_000_000_i128);
}

// ── Agent & position tests ────────────────────────────────────────────────────

#[test]
#[should_panic(expected = "AgentNotAuthorized")]
fn test_unauthorized_agent_cannot_open_position() {
    let setup = TestSetup::new();
    setup.vault.deposit(&setup.alice, &100_000_000_i128);
    setup.vault.open_position(
        &setup.agent,
        &Address::generate(&setup.env),
        &50_000_000_i128,
        &0_u64,
        &0_u32,
        &Bytes::new(&setup.env),
    );
}

#[test]
fn test_add_and_use_agent() {
    let setup = TestSetup::new();
    let protocol = Address::generate(&setup.env);

    // Whitelist the protocol
    let mut g = setup.vault.get_vault_info().guardrails;
    g.whitelisted_protocols = soroban_sdk::vec![&setup.env, protocol.clone()];
    setup.vault.update_guardrails(&g);

    setup.vault.add_agent(&setup.agent);
    assert!(setup.vault.is_authorized_agent(&setup.agent));

    setup.vault.deposit(&setup.alice, &100_000_000_i128);

    let sac = StellarAssetClient::new(&setup.env, &setup.token.address);
    sac.mint(&protocol, &0_i128); // ensure protocol account exists

    let pos_id = setup.vault.open_position(
        &setup.agent,
        &protocol,
        &50_000_000_i128,
        &0_u64,
        &0_u32,
        &Bytes::new(&setup.env),
    );
    assert_eq!(pos_id, 1);
    assert_eq!(setup.vault.get_position_count(), 1);
}

// ── Guardrail tests ───────────────────────────────────────────────────────────

#[test]
#[should_panic(expected = "DrawdownLimitExceeded")]
fn test_drawdown_limit_respected() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let alice = Address::generate(&env);

    let token_admin = Address::generate(&env);
    let token_id = env.register_stellar_asset_contract_v2(token_admin.clone());
    StellarAssetClient::new(&env, &token_id.address()).mint(&alice, &1_000_000_000_i128);

    let vault_id = env.register_contract(None, VaultContract);
    let vault = VaultContractClient::new(&env, &vault_id);

    let mut guardrails = default_guardrails(&env);
    guardrails.max_drawdown_bps = 1000; // 10% max per tx

    vault.initialize(
        &admin,
        &String::from_str(&env, "DrawdownVault"),
        &token_id.address(),
        &guardrails,
    );

    vault.deposit(&alice, &100_000_000_i128);
    // Try to withdraw 50% — exceeds 10% drawdown limit
    vault.withdraw(&alice, &50_000_000_i128);
}

#[test]
#[should_panic(expected = "EmergencyStopActive")]
fn test_emergency_stop_blocks_deposits() {
    let setup = TestSetup::new();
    setup.vault.emergency_stop();
    setup.vault.deposit(&setup.alice, &100_000_000_i128);
}
