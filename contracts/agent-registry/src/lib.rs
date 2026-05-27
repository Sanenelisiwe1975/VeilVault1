//! Agent Registry — Know Your Agent (KYA) Contract
//!
//! Implements agent identity and reputation infrastructure for VeilVault1.
//!
//! # Design
//! - Agents register with a W3C DID and a SHA-256 hash of their Verifiable Credential document
//! - Reputation is a score 0–10000 bps maintained from vault performance events
//! - Four reputation tiers: Unverified → Verified → Trusted → Elite
//! - Vault contracts query minimum reputation before authorising agent operations
//! - Slash mechanism penalises bad-faith agents; ban mechanism for severe violations
//!
//! # Reputation scoring
//! | Event                        | Score delta |
//! |------------------------------|-------------|
//! | VC submitted and accepted    | +500        |
//! | Successful strategy close    | +10 per 1%  |
//! | Failed / liquidated position | −200        |
//! | Slash (admin)                | −N (custom) |
//! | Perfect execution streak     | +50 bonus   |

#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracterror, contracttype,
    Address, Bytes, BytesN, Env, String, Vec,
};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum RegistryError {
    AlreadyInitialized      = 1,
    NotInitialized          = 2,
    Unauthorized            = 3,
    AgentNotFound           = 4,
    AgentAlreadyRegistered  = 5,
    AgentBanned             = 6,
    InvalidDID              = 7,
    InvalidVCHash           = 8,
    ReputationUnderflow     = 9,
    InvalidSlashAmount      = 10,
    VCAlreadyPending        = 11,
    NoPendingVC             = 12,
}

/// Reputation tier based on score.
/// Tier thresholds (in bps, out of 10000):
///   Unverified: 0–999
///   Verified:   1000–3999
///   Trusted:    4000–7999
///   Elite:      8000–10000
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum ReputationLevel {
    Unverified = 0,
    Verified   = 1,
    Trusted    = 2,
    Elite      = 3,
}

impl ReputationLevel {
    pub fn from_score(score: u32) -> Self {
        match score {
            8000..=10000 => Self::Elite,
            4000..=7999  => Self::Trusted,
            1000..=3999  => Self::Verified,
            _            => Self::Unverified,
        }
    }
}

/// An agent's on-chain identity and reputation record.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AgentProfile {
    /// W3C DID string (e.g. "did:stellar:GABC…")
    pub did: String,
    /// Stellar address (must own the DID)
    pub stellar_address: Address,
    /// SHA-256 hash of the W3C Verifiable Credential JSON-LD document.
    /// The full VC lives off-chain (IPFS / Arweave) pointed to by vc_uri.
    pub vc_hash: BytesN<32>,
    /// Content-addressed URI to the VC document (max 256 chars)
    pub vc_uri: String,
    /// Reputation score 0–10000 bps
    pub reputation_score: u32,
    /// Cached tier derived from score
    pub level: ReputationLevel,
    /// Total strategy executions
    pub total_executions: u64,
    /// Executions that closed with positive PnL
    pub successful_executions: u64,
    /// Cumulative deployed volume in asset base units
    pub total_volume: i128,
    /// Current consecutive-win streak
    pub win_streak: u32,
    /// Whether the agent is banned (cannot be reinstated without admin action)
    pub banned: bool,
    pub registered_at: u64,
    pub last_updated: u64,
}

/// Pending VC update waiting for admin attestation.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PendingVC {
    pub new_vc_hash: BytesN<32>,
    pub new_vc_uri: String,
    pub submitted_at: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RegistryConfig {
    pub admin: Address,
    /// Addresses permitted to update reputation (typically the Vault contract)
    pub reputation_updaters: Vec<Address>,
}

#[contracttype]
pub enum DataKey {
    Config,
    Agent(Address),         // stellar_address → AgentProfile
    PendingVC(Address),     // stellar_address → PendingVC
    AgentCount,
}

const INSTANCE_TTL: u32   = 1_000_000;
const AGENT_TTL: u32      = 1_000_000;

// Reputation score constants

const SCORE_VC_ACCEPTED: u32    = 500;
const SCORE_SUCCESS_BASE: u32   = 10;   // × return_pct (integer %)
const SCORE_FAILURE: u32        = 200;
const SCORE_STREAK_BONUS: u32   = 50;   // applied at every 5-win streak
const STREAK_BONUS_INTERVAL: u32 = 5;
const SCORE_MAX: u32            = 10_000;
const SCORE_SLASH_CAP: u32      = 2_000; // max single slash


#[contract]
pub struct AgentRegistryContract;

#[contractimpl]
impl AgentRegistryContract {

    pub fn initialize(env: Env, admin: Address) -> Result<(), RegistryError> {
        if env.storage().instance().has(&DataKey::Config) {
            return Err(RegistryError::AlreadyInitialized);
        }
        admin.require_auth();
        let config = RegistryConfig {
            admin,
            reputation_updaters: Vec::new(&env),
        };
        env.storage().instance().set(&DataKey::Config, &config);
        env.storage().instance().set(&DataKey::AgentCount, &0u64);
        env.storage().instance().extend_ttl(INSTANCE_TTL, INSTANCE_TTL);
        Ok(())
    }

    /// Grant a contract address (e.g. the Vault) permission to update reputations.
    pub fn add_reputation_updater(env: Env, updater: Address) -> Result<(), RegistryError> {
        let mut config = Self::require_admin(&env)?;
        config.reputation_updaters.push_back(updater);
        env.storage().instance().set(&DataKey::Config, &config);
        Ok(())
    }

    // Agent registration

    /// Register a new agent with a W3C DID and Verifiable Credential.
    ///
    /// The agent must sign this transaction. The VC is not verified on-chain —
    /// the admin must call `accept_vc` to boost the reputation score.
    pub fn register(
        env: Env,
        agent: Address,
        did: String,
        vc_hash: BytesN<32>,
        vc_uri: String,
    ) -> Result<(), RegistryError> {
        agent.require_auth();

        let key = DataKey::Agent(agent.clone());
        if env.storage().persistent().has(&key) {
            return Err(RegistryError::AgentAlreadyRegistered);
        }
        if did.len() < 12 {
            return Err(RegistryError::InvalidDID);
        }

        let now = env.ledger().timestamp();
        let profile = AgentProfile {
            did,
            stellar_address: agent.clone(),
            vc_hash,
            vc_uri,
            reputation_score: 0,
            level: ReputationLevel::Unverified,
            total_executions: 0,
            successful_executions: 0,
            total_volume: 0,
            win_streak: 0,
            banned: false,
            registered_at: now,
            last_updated: now,
        };

        env.storage().persistent().set(&key, &profile);
        env.storage().persistent().extend_ttl(&key, AGENT_TTL, AGENT_TTL);

        let count: u64 = env.storage().instance()
            .get(&DataKey::AgentCount).unwrap_or(0) + 1;
        env.storage().instance().set(&DataKey::AgentCount, &count);

        env.events().publish(
            (soroban_sdk::symbol_short!("AGT_REG"), agent),
            now,
        );
        Ok(())
    }

    /// Agent submits a new or updated VC for admin review.
    pub fn submit_vc_update(
        env: Env,
        agent: Address,
        new_vc_hash: BytesN<32>,
        new_vc_uri: String,
    ) -> Result<(), RegistryError> {
        agent.require_auth();
        let _ = Self::get_active_profile(&env, &agent)?;

        let vc_key = DataKey::PendingVC(agent.clone());
        if env.storage().temporary().has(&vc_key) {
            return Err(RegistryError::VCAlreadyPending);
        }

        let pending = PendingVC {
            new_vc_hash,
            new_vc_uri,
            submitted_at: env.ledger().timestamp(),
        };
        env.storage().temporary().set(&vc_key, &pending);
        // TTL: ~7 days at 5s/ledger = 120960 ledgers
        env.storage().temporary().extend_ttl(&vc_key, 120_960, 120_960);
        Ok(())
    }

    /// Admin accepts a pending VC update and awards the reputation bonus.
    pub fn accept_vc(env: Env, agent: Address) -> Result<(), RegistryError> {
        let config = Self::require_admin(&env)?;

        let vc_key = DataKey::PendingVC(agent.clone());
        let pending: PendingVC = env
            .storage()
            .temporary()
            .get(&vc_key)
            .ok_or(RegistryError::NoPendingVC)?;

        let mut profile = Self::get_active_profile(&env, &agent)?;
        profile.vc_hash = pending.new_vc_hash;
        profile.vc_uri = pending.new_vc_uri;
        profile.reputation_score = (profile.reputation_score + SCORE_VC_ACCEPTED).min(SCORE_MAX);
        profile.level = ReputationLevel::from_score(profile.reputation_score);
        profile.last_updated = env.ledger().timestamp();

        env.storage().persistent().set(&DataKey::Agent(agent.clone()), &profile);
        env.storage().temporary().remove(&vc_key);

        env.events().publish(
            (soroban_sdk::symbol_short!("VC_ACC"), agent),
            profile.reputation_score,
        );
        Ok(())
    }

    // Reputation updates (called by vault / authorised contracts)

    /// Record a successful strategy close. `return_bps` is the actual return (basis points, may be 0).
    pub fn record_success(
        env: Env,
        agent: Address,
        return_bps: u32,
        volume: i128,
    ) -> Result<(), RegistryError> {
        Self::require_reputation_updater(&env)?;
        let mut profile = Self::get_active_profile(&env, &agent)?;

        // Base score: 10 pts per 1% return, capped at 200
        let return_pct = return_bps / 100;
        let score_delta = (SCORE_SUCCESS_BASE * return_pct).min(200);
        profile.reputation_score = (profile.reputation_score + score_delta).min(SCORE_MAX);

        profile.total_executions += 1;
        profile.successful_executions += 1;
        profile.total_volume = profile.total_volume.saturating_add(volume);
        profile.win_streak += 1;

        // Streak bonus every STREAK_BONUS_INTERVAL consecutive wins
        if profile.win_streak % STREAK_BONUS_INTERVAL == 0 {
            profile.reputation_score = (profile.reputation_score + SCORE_STREAK_BONUS).min(SCORE_MAX);
            env.events().publish(
                (soroban_sdk::symbol_short!("STREAK"), agent.clone()),
                profile.win_streak,
            );
        }

        profile.level = ReputationLevel::from_score(profile.reputation_score);
        profile.last_updated = env.ledger().timestamp();
        Self::save_profile(&env, &agent, &profile);
        Ok(())
    }

    /// Record a failed / liquidated position.
    pub fn record_failure(
        env: Env,
        agent: Address,
        volume: i128,
    ) -> Result<(), RegistryError> {
        Self::require_reputation_updater(&env)?;
        let mut profile = Self::get_active_profile(&env, &agent)?;

        profile.reputation_score = profile.reputation_score.saturating_sub(SCORE_FAILURE);
        profile.total_executions += 1;
        profile.total_volume = profile.total_volume.saturating_add(volume);
        profile.win_streak = 0; // reset streak

        profile.level = ReputationLevel::from_score(profile.reputation_score);
        profile.last_updated = env.ledger().timestamp();
        Self::save_profile(&env, &agent, &profile);
        Ok(())
    }

    // Admin actions

    /// Slash an agent's reputation by a custom amount.
    pub fn slash(
        env: Env,
        agent: Address,
        amount: u32,
        _reason: String,
    ) -> Result<(), RegistryError> {
        Self::require_admin(&env)?;
        if amount == 0 || amount > SCORE_SLASH_CAP {
            return Err(RegistryError::InvalidSlashAmount);
        }
        let mut profile = Self::get_profile(&env, &agent)?;
        profile.reputation_score = profile.reputation_score.saturating_sub(amount);
        profile.level = ReputationLevel::from_score(profile.reputation_score);
        profile.last_updated = env.ledger().timestamp();
        Self::save_profile(&env, &agent, &profile);

        env.events().publish(
            (soroban_sdk::symbol_short!("SLASH"), agent),
            amount,
        );
        Ok(())
    }

    /// Permanently ban an agent. Cannot be undone except by admin unban.
    pub fn ban(env: Env, agent: Address) -> Result<(), RegistryError> {
        Self::require_admin(&env)?;
        let mut profile = Self::get_profile(&env, &agent)?;
        profile.banned = true;
        profile.reputation_score = 0;
        profile.level = ReputationLevel::Unverified;
        profile.last_updated = env.ledger().timestamp();
        Self::save_profile(&env, &agent, &profile);

        env.events().publish(
            (soroban_sdk::symbol_short!("BAN"), agent),
            env.ledger().timestamp(),
        );
        Ok(())
    }

    /// Unban an agent (admin only).
    pub fn unban(env: Env, agent: Address) -> Result<(), RegistryError> {
        Self::require_admin(&env)?;
        let mut profile = Self::get_profile(&env, &agent)?;
        profile.banned = false;
        profile.last_updated = env.ledger().timestamp();
        Self::save_profile(&env, &agent, &profile);
        Ok(())
    }

    // Views

    pub fn get_agent(env: Env, agent: Address) -> Result<AgentProfile, RegistryError> {
        Self::get_profile(&env, &agent)
    }

    pub fn get_reputation_level(env: Env, agent: Address) -> Result<u32, RegistryError> {
        let profile = Self::get_profile(&env, &agent)?;
        Ok(profile.level as u32)
    }

    pub fn meets_minimum_level(
        env: Env,
        agent: Address,
        min_level: u32,
    ) -> Result<bool, RegistryError> {
        let profile = Self::get_profile(&env, &agent)?;
        if profile.banned {
            return Ok(false);
        }
        Ok((profile.level as u32) >= min_level)
    }

    pub fn get_agent_count(env: Env) -> u64 {
        env.storage().instance().get(&DataKey::AgentCount).unwrap_or(0)
    }

    pub fn get_success_rate(env: Env, agent: Address) -> Result<u32, RegistryError> {
        let profile = Self::get_profile(&env, &agent)?;
        if profile.total_executions == 0 {
            return Ok(0);
        }
        Ok((profile.successful_executions * 10_000 / profile.total_executions) as u32)
    }

    // Internal helpers

    fn get_config(env: &Env) -> Result<RegistryConfig, RegistryError> {
        env.storage()
            .instance()
            .get::<DataKey, RegistryConfig>(&DataKey::Config)
            .ok_or(RegistryError::NotInitialized)
    }

    fn require_admin(env: &Env) -> Result<RegistryConfig, RegistryError> {
        let config = Self::get_config(env)?;
        config.admin.require_auth();
        Ok(config)
    }

    fn require_reputation_updater(env: &Env) -> Result<(), RegistryError> {
        let config = Self::get_config(env)?;
        // The caller must be one of the authorised updaters
        for updater in config.reputation_updaters.iter() {
            if let Ok(()) = updater.try_require_auth() {
                return Ok(());
            }
        }
        // Admin can also update
        if let Ok(()) = config.admin.try_require_auth() {
            return Ok(());
        }
        Err(RegistryError::Unauthorized)
    }

    fn get_profile(env: &Env, agent: &Address) -> Result<AgentProfile, RegistryError> {
        env.storage()
            .persistent()
            .get::<DataKey, AgentProfile>(&DataKey::Agent(agent.clone()))
            .ok_or(RegistryError::AgentNotFound)
    }

    fn get_active_profile(env: &Env, agent: &Address) -> Result<AgentProfile, RegistryError> {
        let profile = Self::get_profile(env, agent)?;
        if profile.banned {
            return Err(RegistryError::AgentBanned);
        }
        Ok(profile)
    }

    fn save_profile(env: &Env, agent: &Address, profile: &AgentProfile) {
        let key = DataKey::Agent(agent.clone());
        env.storage().persistent().set(&key, profile);
        env.storage().persistent().extend_ttl(&key, AGENT_TTL, AGENT_TTL);
    }
}

// Tests

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Bytes, Env, String};

    fn setup() -> (Env, Address, AgentRegistryContractClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let id = env.register_contract(None, AgentRegistryContract);
        let client: AgentRegistryContractClient<'static> =
            unsafe { core::mem::transmute(AgentRegistryContractClient::new(&env, &id)) };
        client.initialize(&admin);
        (env, admin, client)
    }

    fn register_agent(client: &AgentRegistryContractClient, env: &Env) -> Address {
        let agent = Address::generate(env);
        let did = String::from_str(env, "did:stellar:GABC1234");
        let vc_hash = BytesN::from_array(env, &[1u8; 32]);
        let vc_uri = String::from_str(env, "ipfs://Qm123abc");
        client.register(&agent, &did, &vc_hash, &vc_uri);
        agent
    }

    #[test]
    fn test_register_agent() {
        let (env, _, client) = setup();
        let agent = register_agent(&client, &env);
        let profile = client.get_agent(&agent);
        assert_eq!(profile.level, ReputationLevel::Unverified);
        assert_eq!(profile.reputation_score, 0);
        assert_eq!(client.get_agent_count(), 1);
    }

    #[test]
    fn test_vc_acceptance_boosts_score() {
        let (env, _, client) = setup();
        let agent = register_agent(&client, &env);

        let new_hash = BytesN::from_array(&env, &[2u8; 32]);
        let new_uri = String::from_str(&env, "ipfs://Qm456def");
        client.submit_vc_update(&agent, &new_hash, &new_uri);
        client.accept_vc(&agent);

        let profile = client.get_agent(&agent);
        assert_eq!(profile.reputation_score, 500);
        assert_eq!(profile.level, ReputationLevel::Unverified); // still under 1000
    }

    #[test]
    fn test_reputation_tiers() {
        assert_eq!(ReputationLevel::from_score(0), ReputationLevel::Unverified);
        assert_eq!(ReputationLevel::from_score(1000), ReputationLevel::Verified);
        assert_eq!(ReputationLevel::from_score(4000), ReputationLevel::Trusted);
        assert_eq!(ReputationLevel::from_score(8000), ReputationLevel::Elite);
    }

    #[test]
    fn test_record_success_increases_score() {
        let (env, admin, client) = setup();
        client.add_reputation_updater(&admin);
        let agent = register_agent(&client, &env);

        client.record_success(&agent, &1000_u32, &1_000_000_i128); // 10% return
        let profile = client.get_agent(&agent);
        assert!(profile.reputation_score > 0);
        assert_eq!(profile.total_executions, 1);
        assert_eq!(profile.successful_executions, 1);
    }

    #[test]
    fn test_slash_reduces_score() {
        let (env, admin, client) = setup();
        client.add_reputation_updater(&admin);
        let agent = register_agent(&client, &env);
        client.record_success(&agent, &5000_u32, &10_000_000_i128);

        let before = client.get_agent(&agent).reputation_score;
        client.slash(&agent, &100_u32, &String::from_str(&env, "test slash"));
        let after = client.get_agent(&agent).reputation_score;
        assert_eq!(before - after, 100);
    }

    #[test]
    fn test_ban_prevents_operations() {
        let (env, _, client) = setup();
        let agent = register_agent(&client, &env);
        client.ban(&agent);

        let profile = client.get_agent(&agent);
        assert!(profile.banned);
        assert!(!client.meets_minimum_level(&agent, &0_u32));
    }

    #[test]
    #[should_panic(expected = "AgentAlreadyRegistered")]
    fn test_double_register_fails() {
        let (env, _, client) = setup();
        let agent = register_agent(&client, &env);
        let did = String::from_str(&env, "did:stellar:GABC1234");
        let vc_hash = BytesN::from_array(&env, &[1u8; 32]);
        let vc_uri = String::from_str(&env, "ipfs://Qm123abc");
        client.register(&agent, &did, &vc_hash, &vc_uri);
    }
}
