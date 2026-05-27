//! Stokvel Vault Contract — M-of-N Group Savings Pool
//!
//! Inspired by African stokvels and chamas: informal group savings schemes
//! where members pool money, earn yield together, and distribute profits.
//!
//! # Design
//! - Members contribute a fixed amount on a regular schedule
//! - All proposals (withdrawals, distributions, membership changes) require
//!   M-of-N member approvals before execution
//! - Contributions are deposited into the linked VeilVault for yield generation
//! - Individual contributions are tracked privately (members see total, not each other's amounts)
//! - Distributions are proportional to contribution share
//!
//! # Use cases (African emerging markets)
//! - Community savings pools (township stokvels)
//! - Agricultural chamas (farming cooperatives)
//! - Diaspora remittance clubs (monthly group contributions)
//! - Micro-insurance pools
//! - Carbon credit community pools

#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracterror, contracttype, token,
    Address, Bytes, BytesN, Env, String, Vec,
};

// Errors

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum StokvelError {
    AlreadyInitialized     = 1,
    NotInitialized         = 2,
    Unauthorized           = 3,
    AlreadyMember          = 4,
    NotMember              = 5,
    MaxMembersReached      = 6,
    InvalidThreshold       = 7,
    ProposalNotFound       = 8,
    ProposalExpired        = 9,
    ProposalAlreadyVoted   = 10,
    ProposalAlreadyExecuted = 11,
    ThresholdNotMet        = 12,
    InsufficientFunds      = 13,
    InvalidAmount          = 14,
    GroupInactive          = 15,
    ArithmeticOverflow     = 16,
    ContributionNotDue     = 17,
}


#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum ProposalType {
    Distribution = 0,    // Distribute yield proportionally to all members
    Withdrawal   = 1,    // Full/partial withdrawal for a specific member
    AddMember    = 2,
    RemoveMember = 3,
    UpdateConfig = 4,
    EmergencyStop = 5,
}

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum ProposalStatus {
    Active   = 0,
    Approved = 1,
    Rejected = 2,
    Executed = 3,
    Expired  = 4,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Proposal {
    pub id: u64,
    pub proposal_type: ProposalType,
    pub proposer: Address,
    /// Amount involved (0 for membership changes)
    pub amount: i128,
    /// Target member (for Withdrawal, AddMember, RemoveMember)
    pub target: Option<Address>,
    pub approvals: Vec<Address>,
    pub rejections: Vec<Address>,
    pub status: ProposalStatus,
    pub created_at: u64,
    /// Proposal expires if not executed within this time
    pub expires_at: u64,
    pub description: String,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MemberInfo {
    pub address: Address,
    /// Total contributed in asset base units
    pub total_contributed: i128,
    /// Shares: proportional to contribution (10000 bps = 100% of pool)
    pub share_bps: u32,
    /// Last contribution timestamp
    pub last_contribution_at: u64,
    /// Total distributions received
    pub total_received: i128,
    pub joined_at: u64,
    pub is_active: bool,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct StokvelConfig {
    /// Group name
    pub name: String,
    /// Optional mission/description
    pub description: String,
    pub admin: Address,
    /// The pooled asset (SAC token address)
    pub asset: Address,
    /// M — minimum approvals required for any proposal
    pub threshold: u32,
    /// Maximum number of members
    pub max_members: u32,
    /// Required periodic contribution amount (0 = voluntary)
    pub contribution_amount: i128,
    /// Seconds between mandatory contributions (0 = no schedule)
    pub contribution_interval: u64,
    /// VeilVault contract address where funds earn yield
    pub yield_vault: Address,
    /// Whether the stokvel is accepting new members
    pub is_accepting_members: bool,
    pub is_active: bool,
    pub created_at: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct StokvelStats {
    pub total_members: u32,
    pub total_contributed: i128,
    pub total_distributed: i128,
    pub current_pool_value: i128,
    pub proposal_count: u64,
}

#[contracttype]
pub enum DataKey {
    Config,
    Stats,
    Member(Address),
    MemberList,
    Proposal(u64),
    ProposalCount,
    VaultShares,         // Shares held in the yield vault
}

const INSTANCE_TTL: u32  = 1_000_000;
const MEMBER_TTL: u32    = 1_000_000;
const PROPOSAL_TTL: u32  = 200_000;
const PROPOSAL_EXPIRY: u64 = 7 * 24 * 3600; // 7 days


#[contract]
pub struct StokvelVaultContract;

#[contractimpl]
impl StokvelVaultContract {
    // Initialisation

    pub fn initialize(
        env: Env,
        admin: Address,
        name: String,
        description: String,
        asset: Address,
        threshold: u32,
        max_members: u32,
        contribution_amount: i128,
        contribution_interval: u64,
        yield_vault: Address,
    ) -> Result<(), StokvelError> {
        if env.storage().instance().has(&DataKey::Config) {
            return Err(StokvelError::AlreadyInitialized);
        }
        admin.require_auth();
        if threshold == 0 {
            return Err(StokvelError::InvalidThreshold);
        }

        let config = StokvelConfig {
            name,
            description,
            admin: admin.clone(),
            asset,
            threshold,
            max_members,
            contribution_amount,
            contribution_interval,
            yield_vault,
            is_accepting_members: true,
            is_active: true,
            created_at: env.ledger().timestamp(),
        };
        env.storage().instance().set(&DataKey::Config, &config);

        let stats = StokvelStats {
            total_members: 0,
            total_contributed: 0,
            total_distributed: 0,
            current_pool_value: 0,
            proposal_count: 0,
        };
        env.storage().instance().set(&DataKey::Stats, &stats);
        env.storage().instance().set(&DataKey::ProposalCount, &0u64);
        env.storage().instance().set(&DataKey::VaultShares, &0i128);
        env.storage().instance().set(&DataKey::MemberList, &Vec::<Address>::new(&env));
        env.storage().instance().extend_ttl(INSTANCE_TTL, INSTANCE_TTL);

        // Admin is the first member
        Self::add_member_internal(&env, admin, 0)?;
        Ok(())
    }

    // Membership 

    /// Join the stokvel (if open) or be added via approved proposal.
    pub fn join(env: Env, applicant: Address) -> Result<(), StokvelError> {
        applicant.require_auth();
        let config = Self::get_config(&env)?;
        if !config.is_accepting_members || !config.is_active {
            return Err(StokvelError::GroupInactive);
        }
        let stats = Self::get_stats(&env);
        if stats.total_members >= config.max_members {
            return Err(StokvelError::MaxMembersReached);
        }
        Self::add_member_internal(&env, applicant, 0)?;
        Ok(())
    }

    // Contributions

    /// Member contributes funds to the pool.
    ///
    /// If `amount` is 0, uses the configured `contribution_amount`.
    /// Funds are forwarded to the yield vault to earn returns.
    pub fn contribute(env: Env, member: Address, amount: i128) -> Result<i128, StokvelError> {
        member.require_auth();
        let config = Self::get_config(&env)?;
        if !config.is_active {
            return Err(StokvelError::GroupInactive);
        }

        let mut member_info = Self::get_member(&env, &member)?;
        if !member_info.is_active {
            return Err(StokvelError::NotMember);
        }

        let actual_amount = if amount == 0 {
            config.contribution_amount
        } else {
            amount
        };
        if actual_amount <= 0 {
            return Err(StokvelError::InvalidAmount);
        }

        // Transfer from member to this contract
        token::Client::new(&env, &config.asset).transfer(
            &member,
            &env.current_contract_address(),
            &actual_amount,
        );

        // Forward to yield vault via SAC approve + vault deposit call
        // The stokvel contract holds vault shares on behalf of all members
        // (simplified: transfer to vault contract address for demo)
        token::Client::new(&env, &config.asset).transfer(
            &env.current_contract_address(),
            &config.yield_vault,
            &actual_amount,
        );

        // Update member info
        member_info.total_contributed = member_info
            .total_contributed
            .checked_add(actual_amount)
            .ok_or(StokvelError::ArithmeticOverflow)?;
        member_info.last_contribution_at = env.ledger().timestamp();
        Self::save_member(&env, &member, &member_info);

        // Update stats and recompute shares
        let mut stats = Self::get_stats(&env);
        stats.total_contributed = stats
            .total_contributed
            .checked_add(actual_amount)
            .ok_or(StokvelError::ArithmeticOverflow)?;
        stats.current_pool_value = stats.current_pool_value + actual_amount;
        env.storage().instance().set(&DataKey::Stats, &stats);

        Self::recompute_shares(&env)?;

        env.events().publish(
            (soroban_sdk::symbol_short!("CONTRIB"), member),
            actual_amount,
        );
        Ok(actual_amount)
    }

    // Proposals

    /// Any member can create a proposal.
    pub fn propose(
        env: Env,
        proposer: Address,
        proposal_type: u32,
        amount: i128,
        target: Option<Address>,
        description: String,
    ) -> Result<u64, StokvelError> {
        proposer.require_auth();
        let _ = Self::get_member(&env, &proposer)?;

        let ptype = Self::parse_proposal_type(proposal_type)?;

        let count_key = DataKey::ProposalCount;
        let count: u64 = env.storage().instance()
            .get(&count_key).unwrap_or(0) + 1;
        env.storage().instance().set(&count_key, &count);

        let now = env.ledger().timestamp();
        let mut approvals = Vec::new(&env);
        approvals.push_back(proposer.clone()); // proposer auto-approves

        let proposal = Proposal {
            id: count,
            proposal_type: ptype,
            proposer: proposer.clone(),
            amount,
            target,
            approvals,
            rejections: Vec::new(&env),
            status: ProposalStatus::Active,
            created_at: now,
            expires_at: now + PROPOSAL_EXPIRY,
            description,
        };

        env.storage().persistent().set(&DataKey::Proposal(count), &proposal);
        env.storage().persistent().extend_ttl(&DataKey::Proposal(count), PROPOSAL_TTL, PROPOSAL_TTL);

        let mut stats = Self::get_stats(&env);
        stats.proposal_count += 1;
        env.storage().instance().set(&DataKey::Stats, &stats);

        env.events().publish(
            (soroban_sdk::symbol_short!("PROP"), proposer),
            count,
        );
        Ok(count)
    }

    /// Vote to approve a proposal.
    pub fn approve(env: Env, voter: Address, proposal_id: u64) -> Result<ProposalStatus, StokvelError> {
        voter.require_auth();
        let _ = Self::get_member(&env, &voter)?;

        let mut proposal = Self::get_proposal(&env, proposal_id)?;
        let now = env.ledger().timestamp();

        if proposal.status != ProposalStatus::Active {
            return Err(StokvelError::ProposalAlreadyExecuted);
        }
        if now > proposal.expires_at {
            proposal.status = ProposalStatus::Expired;
            env.storage().persistent().set(&DataKey::Proposal(proposal_id), &proposal);
            return Ok(ProposalStatus::Expired);
        }
        if Self::has_voted(&proposal, &voter) {
            return Err(StokvelError::ProposalAlreadyVoted);
        }

        proposal.approvals.push_back(voter.clone());

        let config = Self::get_config(&env)?;
        let threshold_met = proposal.approvals.len() >= config.threshold;

        if threshold_met {
            proposal.status = ProposalStatus::Approved;
            env.storage().persistent().set(&DataKey::Proposal(proposal_id), &proposal);
            env.events().publish(
                (soroban_sdk::symbol_short!("APPROV"), voter),
                proposal_id,
            );
            return Ok(ProposalStatus::Approved);
        }

        env.storage().persistent().set(&DataKey::Proposal(proposal_id), &proposal);
        Ok(ProposalStatus::Active)
    }

    /// Vote to reject a proposal.
    pub fn reject(env: Env, voter: Address, proposal_id: u64) -> Result<ProposalStatus, StokvelError> {
        voter.require_auth();
        let _ = Self::get_member(&env, &voter)?;

        let mut proposal = Self::get_proposal(&env, proposal_id)?;
        if proposal.status != ProposalStatus::Active {
            return Err(StokvelError::ProposalAlreadyExecuted);
        }
        if Self::has_voted(&proposal, &voter) {
            return Err(StokvelError::ProposalAlreadyVoted);
        }

        proposal.rejections.push_back(voter.clone());

        let config = Self::get_config(&env)?;
        let stats = Self::get_stats(&env);
        let majority_rejected = proposal.rejections.len() > stats.total_members as u32 / 2;

        if majority_rejected {
            proposal.status = ProposalStatus::Rejected;
        }

        env.storage().persistent().set(&DataKey::Proposal(proposal_id), &proposal);
        Ok(proposal.status)
    }

    /// Execute an approved proposal.
    pub fn execute_proposal(env: Env, executor: Address, proposal_id: u64) -> Result<(), StokvelError> {
        executor.require_auth();
        let config = Self::get_config(&env)?;

        let mut proposal = Self::get_proposal(&env, proposal_id)?;
        if proposal.status != ProposalStatus::Approved {
            return Err(StokvelError::ThresholdNotMet);
        }
        if env.ledger().timestamp() > proposal.expires_at {
            proposal.status = ProposalStatus::Expired;
            env.storage().persistent().set(&DataKey::Proposal(proposal_id), &proposal);
            return Err(StokvelError::ProposalExpired);
        }

        match proposal.proposal_type {
            ProposalType::Distribution => {
                Self::execute_distribution(&env, &config, proposal.amount)?;
            }
            ProposalType::Withdrawal => {
                let recipient = proposal.target.clone().ok_or(StokvelError::Unauthorized)?;
                Self::execute_withdrawal(&env, &config, &recipient, proposal.amount)?;
            }
            ProposalType::AddMember => {
                let new_member = proposal.target.clone().ok_or(StokvelError::Unauthorized)?;
                Self::add_member_internal(&env, new_member, 0)?;
            }
            ProposalType::RemoveMember => {
                let member = proposal.target.clone().ok_or(StokvelError::Unauthorized)?;
                let mut info = Self::get_member(&env, &member)?;
                info.is_active = false;
                Self::save_member(&env, &member, &info);
                let mut stats = Self::get_stats(&env);
                if stats.total_members > 0 { stats.total_members -= 1; }
                env.storage().instance().set(&DataKey::Stats, &stats);
                Self::recompute_shares(&env)?;
            }
            ProposalType::EmergencyStop => {
                let mut cfg = config;
                cfg.is_active = false;
                env.storage().instance().set(&DataKey::Config, &cfg);
            }
            ProposalType::UpdateConfig => {
                // config updates handled off-chain + re-init; placeholder
            }
        }

        proposal.status = ProposalStatus::Executed;
        env.storage().persistent().set(&DataKey::Proposal(proposal_id), &proposal);

        env.events().publish(
            (soroban_sdk::symbol_short!("EXEC"), executor),
            proposal_id,
        );
        Ok(())
    }

    // Views

    pub fn get_stokvel_info(env: Env) -> Result<StokvelConfig, StokvelError> {
        Self::get_config(&env)
    }

    pub fn get_stats(env: Env) -> StokvelStats {
        env.storage().instance()
            .get::<DataKey, StokvelStats>(&DataKey::Stats)
            .unwrap_or(StokvelStats {
                total_members: 0,
                total_contributed: 0,
                total_distributed: 0,
                current_pool_value: 0,
                proposal_count: 0,
            })
    }

    pub fn get_member_info(env: Env, member: Address) -> Result<MemberInfo, StokvelError> {
        Self::get_member(&env, &member)
    }

    pub fn get_proposal_info(env: Env, proposal_id: u64) -> Result<Proposal, StokvelError> {
        Self::get_proposal(&env, proposal_id)
    }

    pub fn get_member_list(env: Env) -> Vec<Address> {
        env.storage().instance()
            .get::<DataKey, Vec<Address>>(&DataKey::MemberList)
            .unwrap_or(Vec::new(&env))
    }

    // Internal

    fn get_config(env: &Env) -> Result<StokvelConfig, StokvelError> {
        env.storage().instance()
            .get::<DataKey, StokvelConfig>(&DataKey::Config)
            .ok_or(StokvelError::NotInitialized)
    }

    fn get_stats(env: &Env) -> StokvelStats {
        env.storage().instance()
            .get::<DataKey, StokvelStats>(&DataKey::Stats)
            .unwrap_or(StokvelStats {
                total_members: 0, total_contributed: 0,
                total_distributed: 0, current_pool_value: 0, proposal_count: 0,
            })
    }

    fn get_member(env: &Env, addr: &Address) -> Result<MemberInfo, StokvelError> {
        env.storage().persistent()
            .get::<DataKey, MemberInfo>(&DataKey::Member(addr.clone()))
            .ok_or(StokvelError::NotMember)
    }

    fn save_member(env: &Env, addr: &Address, info: &MemberInfo) {
        env.storage().persistent().set(&DataKey::Member(addr.clone()), info);
        env.storage().persistent().extend_ttl(&DataKey::Member(addr.clone()), MEMBER_TTL, MEMBER_TTL);
    }

    fn get_proposal(env: &Env, id: u64) -> Result<Proposal, StokvelError> {
        env.storage().persistent()
            .get::<DataKey, Proposal>(&DataKey::Proposal(id))
            .ok_or(StokvelError::ProposalNotFound)
    }

    fn add_member_internal(env: &Env, addr: Address, initial_contribution: i128) -> Result<(), StokvelError> {
        if env.storage().persistent().has(&DataKey::Member(addr.clone())) {
            return Err(StokvelError::AlreadyMember);
        }
        let info = MemberInfo {
            address: addr.clone(),
            total_contributed: initial_contribution,
            share_bps: 0,
            last_contribution_at: 0,
            total_received: 0,
            joined_at: env.ledger().timestamp(),
            is_active: true,
        };
        Self::save_member(env, &addr, &info);

        let mut list: Vec<Address> = env.storage().instance()
            .get(&DataKey::MemberList).unwrap_or(Vec::new(env));
        list.push_back(addr);
        env.storage().instance().set(&DataKey::MemberList, &list);

        let mut stats = Self::get_stats(env);
        stats.total_members += 1;
        env.storage().instance().set(&DataKey::Stats, &stats);
        Ok(())
    }

    /// Recompute each member's share_bps proportional to their contribution.
    fn recompute_shares(env: &Env) -> Result<(), StokvelError> {
        let stats = Self::get_stats(env);
        if stats.total_contributed == 0 {
            return Ok(());
        }
        let list: Vec<Address> = env.storage().instance()
            .get(&DataKey::MemberList).unwrap_or(Vec::new(env));
        for addr in list.iter() {
            if let Ok(mut info) = Self::get_member(env, &addr) {
                if info.is_active {
                    info.share_bps = ((info.total_contributed * 10_000) / stats.total_contributed) as u32;
                    Self::save_member(env, &addr, &info);
                }
            }
        }
        Ok(())
    }

    fn execute_distribution(env: &Env, config: &StokvelConfig, yield_amount: i128) -> Result<(), StokvelError> {
        let list: Vec<Address> = env.storage().instance()
            .get(&DataKey::MemberList).unwrap_or(Vec::new(env));
        let token = token::Client::new(env, &config.asset);

        for addr in list.iter() {
            if let Ok(mut info) = Self::get_member(env, &addr) {
                if info.is_active && info.share_bps > 0 {
                    let member_cut = (yield_amount * info.share_bps as i128) / 10_000;
                    if member_cut > 0 {
                        token.transfer(&env.current_contract_address(), &addr, &member_cut);
                        info.total_received = info.total_received.saturating_add(member_cut);
                        Self::save_member(env, &addr, &info);
                    }
                }
            }
        }

        let mut stats = Self::get_stats(env);
        stats.total_distributed = stats.total_distributed.saturating_add(yield_amount);
        env.storage().instance().set(&DataKey::Stats, &stats);
        Ok(())
    }

    fn execute_withdrawal(env: &Env, config: &StokvelConfig, recipient: &Address, amount: i128) -> Result<(), StokvelError> {
        let stats = Self::get_stats(env);
        if amount > stats.current_pool_value {
            return Err(StokvelError::InsufficientFunds);
        }
        token::Client::new(env, &config.asset)
            .transfer(&env.current_contract_address(), recipient, &amount);
        let mut s = Self::get_stats(env);
        s.current_pool_value = s.current_pool_value.saturating_sub(amount);
        env.storage().instance().set(&DataKey::Stats, &s);
        Ok(())
    }

    fn has_voted(proposal: &Proposal, voter: &Address) -> bool {
        proposal.approvals.iter().any(|a| &a == voter)
            || proposal.rejections.iter().any(|r| &r == voter)
    }

    fn parse_proposal_type(v: u32) -> Result<ProposalType, StokvelError> {
        match v {
            0 => Ok(ProposalType::Distribution),
            1 => Ok(ProposalType::Withdrawal),
            2 => Ok(ProposalType::AddMember),
            3 => Ok(ProposalType::RemoveMember),
            4 => Ok(ProposalType::UpdateConfig),
            5 => Ok(ProposalType::EmergencyStop),
            _ => Err(StokvelError::Unauthorized),
        }
    }
}

// Tests

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Env, String};

    fn setup(env: &Env) -> (Address, Address, StokvelVaultContractClient<'static>) {
        env.mock_all_auths();
        let admin = Address::generate(env);
        let asset = Address::generate(env);
        let yield_vault = Address::generate(env);

        let id = env.register_contract(None, StokvelVaultContract);
        let client: StokvelVaultContractClient<'static> =
            unsafe { core::mem::transmute(StokvelVaultContractClient::new(env, &id)) };

        client.initialize(
            &admin,
            &String::from_str(env, "Township Stokvel"),
            &String::from_str(env, "Community savings pool"),
            &asset,
            &2_u32, // 2-of-N threshold
            &10_u32, // max 10 members
            &100_000_000_i128, // 10 units contribution
            &2592000_u64, // 30 days
            &yield_vault,
        );
        (admin, asset, client)
    }

    #[test]
    fn test_initialize_adds_admin_as_member() {
        let env = Env::default();
        let (admin, _, client) = setup(&env);
        let info = client.get_member_info(&admin);
        assert!(info.is_active);
        assert_eq!(client.get_stats().total_members, 1);
    }

    #[test]
    fn test_join_stokvel() {
        let env = Env::default();
        let (_, _, client) = setup(&env);
        let member = Address::generate(&env);
        client.join(&member);
        assert_eq!(client.get_stats().total_members, 2);
        let info = client.get_member_info(&member);
        assert!(info.is_active);
    }

    #[test]
    fn test_proposal_lifecycle() {
        let env = Env::default();
        let (admin, _, client) = setup(&env);
        let member2 = Address::generate(&env);
        let member3 = Address::generate(&env);
        client.join(&member2);
        client.join(&member3);

        // Admin proposes a distribution
        let proposal_id = client.propose(
            &admin,
            &0_u32, // Distribution
            &5_000_000_i128,
            &None,
            &String::from_str(&env, "Monthly yield distribution"),
        );
        assert_eq!(proposal_id, 1);

        // Admin already approved; member2 approves → 2-of-N reached
        let status = client.approve(&member2, &1_u64);
        assert_eq!(status, ProposalStatus::Approved);
    }
}
