//! Agent Registry — Know Your Agent (KYA) Contract
//!
//! Implements agent identity, reputation, and selective-disclosure attribute
//! infrastructure for VeilVault1.
//!
//! # Selective Disclosure
//! Agents prove on-chain predicates (age ≥ 18, jurisdiction, accreditation)
//! without revealing the underlying data. Workflow:
//!
//!   1. Admin registers an AttributeType with a required Groth16 circuit_id.
//!   2. Agent generates a ZK proof off-chain, submits it to the zk-attestation
//!      contract, and receives an attestation_id.
//!   3. Agent calls claim_attribute(type_id, attestation_id).  The registry
//!      cross-contract calls zk-attestation.is_valid(attestation_id).
//!   4. Vaults/marketplace gate access with has_attribute(agent, type_id).
//!
//! # Reputation scoring
//! | Event                        | Score delta |
//! |------------------------------|-------------|
//! | VC submitted and accepted    | +500        |
//! | Successful strategy close    | +10 per 1%  |
//! | Failed / liquidated position | −200        |
//! | Slash (admin)                | −N (custom) |
//! | Perfect execution streak     | +50 bonus   |
//!
//! # Admin authority (M-of-N multisig)
//! Punitive/identity actions that affect a specific agent — `ban`, `unban`,
//! `slash`, and `accept_vc` — cannot be triggered by a single admin key.
//! They go through a propose → approve → execute flow requiring
//! `admin_threshold` distinct admin signatures, mirroring the stokvel-vault
//! contract's M-of-N proposal pattern. This means no single compromised or
//! malicious admin key can unilaterally ban or slash an agent.
//!
//! Lower-risk, one-time configuration actions (`add_reputation_updater`,
//! `set_zk_verifier`, `register_attribute_type`) remain callable by any
//! single admin, since they configure the system rather than act against a
//! specific agent's funds or standing.

#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracterror, contracttype,
    Address, BytesN, Env, String, Symbol, Val, Vec,
};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum RegistryError {
    AlreadyInitialized       = 1,
    NotInitialized           = 2,
    Unauthorized             = 3,
    AgentNotFound            = 4,
    AgentAlreadyRegistered   = 5,
    AgentBanned              = 6,
    InvalidDID               = 7,
    InvalidVCHash            = 8,
    ReputationUnderflow      = 9,
    InvalidSlashAmount       = 10,
    VCAlreadyPending         = 11,
    NoPendingVC              = 12,
    AttributeTypeNotFound    = 13,
    ZkVerifierNotSet         = 14,
    InvalidAttestation       = 15,
    AttributeAlreadyClaimed  = 16,
    InvalidThreshold         = 17,
    NotAdmin                 = 18,
    AdminProposalNotFound    = 19,
    AdminProposalExpired     = 20,
    AdminProposalAlreadyVoted = 21,
    AdminThresholdNotMet     = 22,
    InvalidAdminAction       = 23,
}

/// Reputation tier based on score (bps out of 10000).
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
    pub did: String,
    pub stellar_address: Address,
    pub vc_hash: BytesN<32>,
    pub vc_uri: String,
    pub reputation_score: u32,
    pub level: ReputationLevel,
    pub total_executions: u64,
    pub successful_executions: u64,
    pub total_volume: i128,
    pub win_streak: u32,
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

/// A registered ZK attribute predicate type.
///
/// Example types:
///   - "age_over_18":   proves age ≥ 18 without revealing DOB
///   - "not_sanctioned": proves address not on OFAC list
///   - "accredited":    proves net worth / income threshold
///   - "jurisdiction_za": proves South African residency
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AttributeType {
    pub type_id: BytesN<32>,
    pub name: String,
    /// The circuit that must have been used to generate the proof.
    /// Registered in the zk-attestation contract by the same admin.
    pub required_circuit_id: BytesN<32>,
    pub registered_at: u64,
}

/// A verified attribute claim held by an agent.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AgentAttribute {
    pub type_id: BytesN<32>,
    /// attestation_id from the zk-attestation contract that proved this attribute.
    pub attestation_id: BytesN<32>,
    pub claimed_at: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RegistryConfig {
    /// Set of admin signers authorized to participate in admin proposals.
    pub admins: Vec<Address>,
    /// Number of distinct admin approvals required to execute a punitive
    /// admin action (ban / unban / slash / accept_vc).
    pub admin_threshold: u32,
    pub reputation_updaters: Vec<Address>,
    /// Optional zk attestation contract used to validate attribute proofs.
    pub zk_verifier: Option<Address>,
}

/// Punitive/identity actions gated behind the M-of-N admin proposal flow.
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum AdminAction {
    Ban      = 0,
    Unban    = 1,
    Slash    = 2,
    AcceptVc = 3,
}

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum AdminProposalStatus {
    Active   = 0,
    Approved = 1,
    Executed = 2,
    Expired  = 3,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AdminProposal {
    pub id: u64,
    pub action: AdminAction,
    /// The agent the action applies to.
    pub target: Address,
    /// Used by Slash only; 0 for all other actions.
    pub amount: u32,
    pub proposer: Address,
    pub approvals: Vec<Address>,
    pub status: AdminProposalStatus,
    pub created_at: u64,
    pub expires_at: u64,
}

#[contracttype]
pub enum DataKey {
    Config,
    Agent(Address),
    PendingVC(Address),
    AgentCount,
    AttributeType(BytesN<32>),
    AgentAttributes(Address),
    AgentAttrDetail(Address, BytesN<32>),
    AdminProposal(u64),
    AdminProposalCount,
}

const INSTANCE_TTL: u32 = 1_000_000;
const AGENT_TTL: u32    = 1_000_000;
const ADMIN_PROPOSAL_TTL: u32    = 200_000;
const ADMIN_PROPOSAL_EXPIRY: u64 = 3 * 24 * 3600; // 3 days

const SCORE_VC_ACCEPTED: u32     = 500;
const SCORE_SUCCESS_BASE: u32    = 10;
const SCORE_FAILURE: u32         = 200;
const SCORE_STREAK_BONUS: u32    = 50;
const STREAK_BONUS_INTERVAL: u32 = 5;
const SCORE_MAX: u32             = 10_000;
const SCORE_SLASH_CAP: u32       = 2_000;


#[contract]
pub struct AgentRegistryContract;

#[contractimpl]
impl AgentRegistryContract {

    /// Initialize the registry with a set of admin signers and the number of
    /// approvals (`admin_threshold`) required to execute a punitive action.
    /// The first address in `admins` must sign the deployment transaction.
    pub fn initialize(
        env: Env,
        admins: Vec<Address>,
        admin_threshold: u32,
    ) -> Result<(), RegistryError> {
        if env.storage().instance().has(&DataKey::Config) {
            return Err(RegistryError::AlreadyInitialized);
        }
        if admins.is_empty() || admin_threshold == 0 || admin_threshold > admins.len() {
            return Err(RegistryError::InvalidThreshold);
        }
        let deployer = admins.get(0).ok_or(RegistryError::InvalidThreshold)?;
        deployer.require_auth();

        let config = RegistryConfig {
            admins,
            admin_threshold,
            reputation_updaters: Vec::new(&env),
            zk_verifier: None,
        };
        env.storage().instance().set(&DataKey::Config, &config);
        env.storage().instance().set(&DataKey::AgentCount, &0u64);
        env.storage().instance().set(&DataKey::AdminProposalCount, &0u64);
        env.storage().instance().extend_ttl(INSTANCE_TTL, INSTANCE_TTL);
        Ok(())
    }

    pub fn add_reputation_updater(
        env: Env,
        caller: Address,
        updater: Address,
    ) -> Result<(), RegistryError> {
        let mut config = Self::require_any_admin(&env, &caller)?;
        config.reputation_updaters.push_back(updater);
        env.storage().instance().set(&DataKey::Config, &config);
        Ok(())
    }

    //  Agent registration

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
        env.storage().temporary().extend_ttl(&vc_key, 120_960, 120_960);
        Ok(())
    }

    //  Reputation updates

    pub fn record_success(
        env: Env,
        caller: Address,
        agent: Address,
        return_bps: u32,
        volume: i128,
    ) -> Result<(), RegistryError> {
        Self::require_reputation_updater(&env, &caller)?;
        let mut profile = Self::get_active_profile(&env, &agent)?;

        let return_pct = return_bps / 100;
        let score_delta = (SCORE_SUCCESS_BASE * return_pct).min(200);
        profile.reputation_score = (profile.reputation_score + score_delta).min(SCORE_MAX);

        profile.total_executions += 1;
        profile.successful_executions += 1;
        profile.total_volume = profile.total_volume.saturating_add(volume);
        profile.win_streak += 1;

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

    pub fn record_failure(
        env: Env,
        caller: Address,
        agent: Address,
        volume: i128,
    ) -> Result<(), RegistryError> {
        Self::require_reputation_updater(&env, &caller)?;
        let mut profile = Self::get_active_profile(&env, &agent)?;

        profile.reputation_score = profile.reputation_score.saturating_sub(SCORE_FAILURE);
        profile.total_executions += 1;
        profile.total_volume = profile.total_volume.saturating_add(volume);
        profile.win_streak = 0;

        profile.level = ReputationLevel::from_score(profile.reputation_score);
        profile.last_updated = env.ledger().timestamp();
        Self::save_profile(&env, &agent, &profile);
        Ok(())
    }

    //  Admin proposals (M-of-N multisig) — ban / unban / slash / accept_vc

    /// Propose a punitive/identity action against an agent. The proposer's
    /// own approval is recorded automatically; if `admin_threshold` is 1 the
    /// proposal is immediately approved (single-admin deployments still work).
    pub fn propose_admin_action(
        env: Env,
        proposer: Address,
        action: u32,
        target: Address,
        amount: u32,
    ) -> Result<u64, RegistryError> {
        let config = Self::require_any_admin(&env, &proposer)?;
        let act = Self::parse_admin_action(action)?;

        if act == AdminAction::Slash && (amount == 0 || amount > SCORE_SLASH_CAP) {
            return Err(RegistryError::InvalidSlashAmount);
        }
        if act == AdminAction::AcceptVc {
            // Fail fast if there's nothing pending to accept.
            let _: PendingVC = env.storage().temporary()
                .get(&DataKey::PendingVC(target.clone()))
                .ok_or(RegistryError::NoPendingVC)?;
        }

        let count: u64 = env.storage().instance()
            .get(&DataKey::AdminProposalCount).unwrap_or(0) + 1;
        env.storage().instance().set(&DataKey::AdminProposalCount, &count);

        let now = env.ledger().timestamp();
        let mut approvals = Vec::new(&env);
        approvals.push_back(proposer.clone());

        let status = if config.admin_threshold <= approvals.len() {
            AdminProposalStatus::Approved
        } else {
            AdminProposalStatus::Active
        };

        let proposal = AdminProposal {
            id: count,
            action: act,
            target,
            amount,
            proposer: proposer.clone(),
            approvals,
            status,
            created_at: now,
            expires_at: now + ADMIN_PROPOSAL_EXPIRY,
        };

        env.storage().persistent().set(&DataKey::AdminProposal(count), &proposal);
        env.storage().persistent().extend_ttl(&DataKey::AdminProposal(count), ADMIN_PROPOSAL_TTL, ADMIN_PROPOSAL_TTL);

        env.events().publish(
            (soroban_sdk::symbol_short!("ADM_PROP"), proposer),
            count,
        );
        Ok(count)
    }

    /// Approve a pending admin proposal. Flips to `Approved` once
    /// `admin_threshold` distinct admins have approved.
    pub fn approve_admin_action(
        env: Env,
        approver: Address,
        proposal_id: u64,
    ) -> Result<AdminProposalStatus, RegistryError> {
        let config = Self::require_any_admin(&env, &approver)?;
        let mut proposal = Self::get_admin_proposal(&env, proposal_id)?;
        let now = env.ledger().timestamp();

        if now > proposal.expires_at {
            proposal.status = AdminProposalStatus::Expired;
            env.storage().persistent().set(&DataKey::AdminProposal(proposal_id), &proposal);
            return Err(RegistryError::AdminProposalExpired);
        }
        if proposal.status != AdminProposalStatus::Active {
            return Err(RegistryError::AdminProposalAlreadyVoted);
        }
        if proposal.approvals.iter().any(|a| a == approver) {
            return Err(RegistryError::AdminProposalAlreadyVoted);
        }

        proposal.approvals.push_back(approver.clone());
        if proposal.approvals.len() >= config.admin_threshold {
            proposal.status = AdminProposalStatus::Approved;
        }
        env.storage().persistent().set(&DataKey::AdminProposal(proposal_id), &proposal);

        env.events().publish(
            (soroban_sdk::symbol_short!("ADM_APP"), approver),
            proposal_id,
        );
        Ok(proposal.status)
    }

    /// Execute an approved admin proposal. Any admin may trigger execution
    /// once the threshold has been met.
    pub fn execute_admin_action(
        env: Env,
        executor: Address,
        proposal_id: u64,
    ) -> Result<(), RegistryError> {
        Self::require_any_admin(&env, &executor)?;
        let mut proposal = Self::get_admin_proposal(&env, proposal_id)?;

        if env.ledger().timestamp() > proposal.expires_at {
            proposal.status = AdminProposalStatus::Expired;
            env.storage().persistent().set(&DataKey::AdminProposal(proposal_id), &proposal);
            return Err(RegistryError::AdminProposalExpired);
        }
        if proposal.status != AdminProposalStatus::Approved {
            return Err(RegistryError::AdminThresholdNotMet);
        }

        match proposal.action {
            AdminAction::Ban      => Self::do_ban(&env, &proposal.target)?,
            AdminAction::Unban    => Self::do_unban(&env, &proposal.target)?,
            AdminAction::Slash    => Self::do_slash(&env, &proposal.target, proposal.amount)?,
            AdminAction::AcceptVc => Self::do_accept_vc(&env, &proposal.target)?,
        }

        proposal.status = AdminProposalStatus::Executed;
        env.storage().persistent().set(&DataKey::AdminProposal(proposal_id), &proposal);

        env.events().publish(
            (soroban_sdk::symbol_short!("ADM_EXEC"), executor),
            proposal_id,
        );
        Ok(())
    }

    //  Selective Disclosure Attributes

    /// Set the zk-attestation contract address used to validate attribute proofs.
    pub fn set_zk_verifier(env: Env, caller: Address, zk_verifier: Address) -> Result<(), RegistryError> {
        let mut config = Self::require_any_admin(&env, &caller)?;
        config.zk_verifier = Some(zk_verifier);
        env.storage().instance().set(&DataKey::Config, &config);
        Ok(())
    }

    /// Register a new attribute predicate type.
    ///
    /// `required_circuit_id` is the circuit registered in the zk-attestation
    /// contract whose proofs are accepted as evidence for this attribute.
    pub fn register_attribute_type(
        env: Env,
        caller: Address,
        type_id: BytesN<32>,
        name: String,
        required_circuit_id: BytesN<32>,
    ) -> Result<(), RegistryError> {
        Self::require_any_admin(&env, &caller)?;
        let attr_type = AttributeType {
            type_id: type_id.clone(),
            name,
            required_circuit_id,
            registered_at: env.ledger().timestamp(),
        };
        let key = DataKey::AttributeType(type_id.clone());
        env.storage().persistent().set(&key, &attr_type);
        env.storage().persistent().extend_ttl(&key, AGENT_TTL, AGENT_TTL);
        env.events().publish(
            (soroban_sdk::symbol_short!("ATTR_REG"), type_id),
            env.ledger().timestamp(),
        );
        Ok(())
    }

    /// Claim an attribute by providing an attestation_id from the zk-attestation
    /// contract.  The registry cross-contract calls `is_valid(attestation_id)`
    /// to confirm the proof was previously verified on-chain.
    pub fn claim_attribute(
        env: Env,
        agent: Address,
        attribute_type_id: BytesN<32>,
        attestation_id: BytesN<32>,
    ) -> Result<(), RegistryError> {
        agent.require_auth();
        let _ = Self::get_active_profile(&env, &agent)?;

        // Verify attribute type exists
        if !env.storage().persistent().has(&DataKey::AttributeType(attribute_type_id.clone())) {
            return Err(RegistryError::AttributeTypeNotFound);
        }

        // Prevent duplicate claims
        let detail_key = DataKey::AgentAttrDetail(agent.clone(), attribute_type_id.clone());
        if env.storage().persistent().has(&detail_key) {
            return Err(RegistryError::AttributeAlreadyClaimed);
        }

        // Cross-contract call: confirm the attestation is valid in the zk verifier
        let config = Self::get_config(&env)?;
        let zk_verifier = config.zk_verifier.ok_or(RegistryError::ZkVerifierNotSet)?;
        let mut args: Vec<Val> = Vec::new(&env);
        args.push_back(attestation_id.clone().into());
        let is_valid: bool = env.invoke_contract(
            &zk_verifier,
            &Symbol::new(&env, "is_valid"),
            args,
        );
        if !is_valid {
            return Err(RegistryError::InvalidAttestation);
        }

        // Store the verified attribute
        let attr = AgentAttribute {
            type_id: attribute_type_id.clone(),
            attestation_id: attestation_id.clone(),
            claimed_at: env.ledger().timestamp(),
        };
        env.storage().persistent().set(&detail_key, &attr);
        env.storage().persistent().extend_ttl(&detail_key, AGENT_TTL, AGENT_TTL);

        // Append to agent's attribute list
        let list_key = DataKey::AgentAttributes(agent.clone());
        let mut attrs: Vec<BytesN<32>> = env.storage().persistent()
            .get(&list_key)
            .unwrap_or(Vec::new(&env));
        attrs.push_back(attribute_type_id.clone());
        env.storage().persistent().set(&list_key, &attrs);
        env.storage().persistent().extend_ttl(&list_key, AGENT_TTL, AGENT_TTL);

        env.events().publish(
            (soroban_sdk::symbol_short!("ATTR_CLM"), agent),
            (attribute_type_id, attestation_id),
        );
        Ok(())
    }

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

    /// Returns true if the agent holds the given attribute.
    pub fn has_attribute(env: Env, agent: Address, attribute_type_id: BytesN<32>) -> bool {
        env.storage()
            .persistent()
            .has(&DataKey::AgentAttrDetail(agent, attribute_type_id))
    }

    /// Returns the list of attribute type IDs the agent has claimed.
    pub fn get_agent_attributes(env: Env, agent: Address) -> Vec<BytesN<32>> {
        env.storage()
            .persistent()
            .get(&DataKey::AgentAttributes(agent))
            .unwrap_or(Vec::new(&env))
    }

    pub fn get_attribute_type(
        env: Env,
        type_id: BytesN<32>,
    ) -> Result<AttributeType, RegistryError> {
        env.storage()
            .persistent()
            .get(&DataKey::AttributeType(type_id))
            .ok_or(RegistryError::AttributeTypeNotFound)
    }

    pub fn get_admins(env: Env) -> Result<Vec<Address>, RegistryError> {
        Ok(Self::get_config(&env)?.admins)
    }

    pub fn get_admin_threshold(env: Env) -> Result<u32, RegistryError> {
        Ok(Self::get_config(&env)?.admin_threshold)
    }

    pub fn get_admin_proposal_info(env: Env, proposal_id: u64) -> Result<AdminProposal, RegistryError> {
        Self::get_admin_proposal(&env, proposal_id)
    }

    fn get_config(env: &Env) -> Result<RegistryConfig, RegistryError> {
        env.storage()
            .instance()
            .get::<DataKey, RegistryConfig>(&DataKey::Config)
            .ok_or(RegistryError::NotInitialized)
    }

    fn require_any_admin(env: &Env, caller: &Address) -> Result<RegistryConfig, RegistryError> {
        let config = Self::get_config(env)?;
        if !config.admins.iter().any(|a| a == *caller) {
            return Err(RegistryError::NotAdmin);
        }
        caller.require_auth();
        Ok(config)
    }

    fn require_reputation_updater(env: &Env, caller: &Address) -> Result<(), RegistryError> {
        let config = Self::get_config(env)?;
        for updater in config.reputation_updaters.iter() {
            if updater == *caller {
                caller.require_auth();
                return Ok(());
            }
        }
        if config.admins.iter().any(|a| a == *caller) {
            caller.require_auth();
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

    fn get_admin_proposal(env: &Env, id: u64) -> Result<AdminProposal, RegistryError> {
        env.storage()
            .persistent()
            .get::<DataKey, AdminProposal>(&DataKey::AdminProposal(id))
            .ok_or(RegistryError::AdminProposalNotFound)
    }

    fn parse_admin_action(v: u32) -> Result<AdminAction, RegistryError> {
        match v {
            0 => Ok(AdminAction::Ban),
            1 => Ok(AdminAction::Unban),
            2 => Ok(AdminAction::Slash),
            3 => Ok(AdminAction::AcceptVc),
            _ => Err(RegistryError::InvalidAdminAction),
        }
    }

    //  Internal action implementations (only reachable via execute_admin_action)

    fn do_ban(env: &Env, agent: &Address) -> Result<(), RegistryError> {
        let mut profile = Self::get_profile(env, agent)?;
        profile.banned = true;
        profile.reputation_score = 0;
        profile.level = ReputationLevel::Unverified;
        profile.last_updated = env.ledger().timestamp();
        Self::save_profile(env, agent, &profile);

        env.events().publish(
            (soroban_sdk::symbol_short!("BAN"), agent.clone()),
            env.ledger().timestamp(),
        );
        Ok(())
    }

    fn do_unban(env: &Env, agent: &Address) -> Result<(), RegistryError> {
        let mut profile = Self::get_profile(env, agent)?;
        profile.banned = false;
        profile.last_updated = env.ledger().timestamp();
        Self::save_profile(env, agent, &profile);
        Ok(())
    }

    fn do_slash(env: &Env, agent: &Address, amount: u32) -> Result<(), RegistryError> {
        let mut profile = Self::get_profile(env, agent)?;
        profile.reputation_score = profile.reputation_score.saturating_sub(amount);
        profile.level = ReputationLevel::from_score(profile.reputation_score);
        profile.last_updated = env.ledger().timestamp();
        Self::save_profile(env, agent, &profile);

        env.events().publish(
            (soroban_sdk::symbol_short!("SLASH"), agent.clone()),
            amount,
        );
        Ok(())
    }

    fn do_accept_vc(env: &Env, agent: &Address) -> Result<(), RegistryError> {
        let vc_key = DataKey::PendingVC(agent.clone());
        let pending: PendingVC = env
            .storage()
            .temporary()
            .get(&vc_key)
            .ok_or(RegistryError::NoPendingVC)?;

        let mut profile = Self::get_active_profile(env, agent)?;
        profile.vc_hash = pending.new_vc_hash;
        profile.vc_uri = pending.new_vc_uri;
        profile.reputation_score = (profile.reputation_score + SCORE_VC_ACCEPTED).min(SCORE_MAX);
        profile.level = ReputationLevel::from_score(profile.reputation_score);
        profile.last_updated = env.ledger().timestamp();

        env.storage().persistent().set(&DataKey::Agent(agent.clone()), &profile);
        env.storage().temporary().remove(&vc_key);

        env.events().publish(
            (soroban_sdk::symbol_short!("VC_ACC"), agent.clone()),
            profile.reputation_score,
        );
        Ok(())
    }
}


#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Env, String};

    fn setup() -> (Env, Address, Vec<Address>, AgentRegistryContractClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();
        let admin1 = Address::generate(&env);
        let admin2 = Address::generate(&env);
        let admin3 = Address::generate(&env);
        let mut admins = Vec::new(&env);
        admins.push_back(admin1.clone());
        admins.push_back(admin2.clone());
        admins.push_back(admin3.clone());

        let id = env.register_contract(None, AgentRegistryContract);
        let client: AgentRegistryContractClient<'static> =
            unsafe { core::mem::transmute(AgentRegistryContractClient::new(&env, &id)) };
        client.initialize(&admins, &2_u32); // 2-of-3 threshold
        (env, admin1, admins, client)
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
        let (env, _, _, client) = setup();
        let agent = register_agent(&client, &env);
        let profile = client.get_agent(&agent);
        assert_eq!(profile.level, ReputationLevel::Unverified);
        assert_eq!(profile.reputation_score, 0);
        assert_eq!(client.get_agent_count(), 1);
    }

    #[test]
    fn test_vc_acceptance_via_multisig_boosts_score() {
        let (env, admin1, admins, client) = setup();
        let agent = register_agent(&client, &env);

        let new_hash = BytesN::from_array(&env, &[2u8; 32]);
        let new_uri = String::from_str(&env, "ipfs://Qm456def");
        client.submit_vc_update(&agent, &new_hash, &new_uri);

        let proposal_id = client.propose_admin_action(&admin1, &3_u32, &agent, &0_u32); // AcceptVc
        // One approval (1-of-3) is not enough for a 2-of-3 threshold.
        let info = client.get_admin_proposal_info(&proposal_id);
        assert_eq!(info.status, AdminProposalStatus::Active);

        let admin2 = admins.get(1).unwrap();
        let status = client.approve_admin_action(&admin2, &proposal_id);
        assert_eq!(status, AdminProposalStatus::Approved);

        client.execute_admin_action(&admin1, &proposal_id);

        let profile = client.get_agent(&agent);
        assert_eq!(profile.reputation_score, 500);
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
        let (env, admin1, _, client) = setup();
        client.add_reputation_updater(&admin1, &admin1);
        let agent = register_agent(&client, &env);

        client.record_success(&admin1, &agent, &1000_u32, &1_000_000_i128);
        let profile = client.get_agent(&agent);
        assert!(profile.reputation_score > 0);
        assert_eq!(profile.total_executions, 1);
        assert_eq!(profile.successful_executions, 1);
    }

    #[test]
    fn test_slash_requires_threshold() {
        let (env, admin1, admins, client) = setup();
        client.add_reputation_updater(&admin1, &admin1);
        let agent = register_agent(&client, &env);
        client.record_success(&admin1, &agent, &5000_u32, &10_000_000_i128);
        let before = client.get_agent(&agent).reputation_score;

        let proposal_id = client.propose_admin_action(&admin1, &2_u32, &agent, &100_u32); // Slash

        // Single admin cannot execute — threshold not met yet.
        let result = client.try_execute_admin_action(&admin1, &proposal_id);
        assert!(result.is_err());

        let admin2 = admins.get(1).unwrap();
        client.approve_admin_action(&admin2, &proposal_id);
        client.execute_admin_action(&admin1, &proposal_id);

        let after = client.get_agent(&agent).reputation_score;
        assert_eq!(before - after, 100);
    }

    #[test]
    fn test_ban_via_multisig_prevents_operations() {
        let (env, admin1, admins, client) = setup();
        let agent = register_agent(&client, &env);

        let proposal_id = client.propose_admin_action(&admin1, &0_u32, &agent, &0_u32); // Ban
        let admin2 = admins.get(1).unwrap();
        client.approve_admin_action(&admin2, &proposal_id);
        client.execute_admin_action(&admin1, &proposal_id);

        let profile = client.get_agent(&agent);
        assert!(profile.banned);
        assert!(!client.meets_minimum_level(&agent, &0_u32));
    }

    #[test]
    fn test_double_approval_rejected() {
        let (env, admin1, _, client) = setup();
        let agent = register_agent(&client, &env);
        let proposal_id = client.propose_admin_action(&admin1, &0_u32, &agent, &0_u32);
        let result = client.try_approve_admin_action(&admin1, &proposal_id);
        assert!(result.is_err());
    }

    #[test]
    fn test_non_admin_cannot_propose() {
        let (env, _, _, client) = setup();
        let agent = register_agent(&client, &env);
        let outsider = Address::generate(&env);
        let result = client.try_propose_admin_action(&outsider, &0_u32, &agent, &0_u32);
        assert!(result.is_err());
    }

    #[test]
    fn test_register_attribute_type() {
        let (env, admin1, _, client) = setup();
        let type_id = BytesN::from_array(&env, &[0xAA; 32]);
        let circuit_id = BytesN::from_array(&env, &[0xBB; 32]);
        let name = String::from_str(&env, "age_over_18");

        client.register_attribute_type(&admin1, &type_id, &name, &circuit_id);

        let attr_type = client.get_attribute_type(&type_id);
        assert_eq!(attr_type.type_id, type_id);
        assert_eq!(attr_type.required_circuit_id, circuit_id);
    }

    #[test]
    fn test_has_attribute_returns_false_when_not_claimed() {
        let (env, _, _, client) = setup();
        let agent = register_agent(&client, &env);
        let type_id = BytesN::from_array(&env, &[0xAA; 32]);
        assert!(!client.has_attribute(&agent, &type_id));
    }

    #[test]
    fn test_get_agent_attributes_empty() {
        let (env, _, _, client) = setup();
        let agent = register_agent(&client, &env);
        let attrs = client.get_agent_attributes(&agent);
        assert_eq!(attrs.len(), 0);
    }

    #[test]
    fn test_double_register_fails() {
        let (env, _, _, client) = setup();
        let agent = register_agent(&client, &env);
        let did = String::from_str(&env, "did:stellar:GABC1234");
        let vc_hash = BytesN::from_array(&env, &[1u8; 32]);
        let vc_uri = String::from_str(&env, "ipfs://Qm123abc");
        let result = client.try_register(&agent, &did, &vc_hash, &vc_uri);
        assert!(result.is_err());
    }
}
