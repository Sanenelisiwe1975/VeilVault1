//! Strategy Marketplace Contract
//!
//! A permissionless on-chain marketplace where developers publish audited yield
//! strategies, and AI agents pay a per-execution USDC fee to run them.
//!
//! # Economics
//! - Developer publishes a strategy and sets an execution_fee (SAC token amount)
//! - When an agent executes, the fee is transferred to the developer's address
//! - Platform takes a configurable fee_bps (e.g. 500 = 5%) from each execution
//! - Audited strategies are marked on-chain; audit report hash stored for verifiability
//!
//! # Strategy lifecycle
//!   Published → [Audited] → Active (executable) → Deprecated

#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracterror, contracttype, token,
    Address, Bytes, BytesN, Env, String, Vec,
};

// ── Errors ────────────────────────────────────────────────────────────────────

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum MarketplaceError {
    AlreadyInitialized    = 1,
    NotInitialized        = 2,
    Unauthorized          = 3,
    StrategyNotFound      = 4,
    StrategyAlreadyExists = 5,
    StrategyInactive      = 6,
    AmountBelowMinimum    = 7,
    AmountAboveMaximum    = 8,
    InvalidFee            = 9,
    InsufficientPayment   = 10,
    ArithmeticOverflow    = 11,
    InvalidRiskLevel      = 12,
}

// ── Types ─────────────────────────────────────────────────────────────────────

/// Strategy risk classification.
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum RiskLevel {
    Low    = 0,
    Medium = 1,
    High   = 2,
}

/// Strategy category (determines which guardrail protocol whitelist to use).
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum StrategyCategory {
    Lending             = 0,
    LiquidityProvision  = 1,
    Staking             = 2,
    Arbitrage           = 3,
    RWA                 = 4,   // Real World Assets (invoices, carbon, commodities)
    Remittance          = 5,   // Remittances-powered yield
    Other               = 6,
}

/// On-chain listing for a published strategy.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct StrategyListing {
    /// Unique ID: SHA-256 of (author || name || published_at)
    pub strategy_id: BytesN<32>,
    pub author: Address,
    pub name: String,
    pub description: String,
    /// Soroban DeFi protocol contract address this strategy targets
    pub protocol: Address,
    pub category: StrategyCategory,
    pub risk_level: RiskLevel,
    /// Fee paid to author on each execution (in fee_asset base units)
    pub execution_fee: i128,
    /// SAC token address for the fee (typically USDC)
    pub fee_asset: Address,
    /// Minimum vault deposit for this strategy (in vault asset units)
    pub min_amount: i128,
    /// 0 = unlimited
    pub max_amount: i128,
    /// Estimated APR in basis points (informational, not enforced)
    pub estimated_apr_bps: u32,
    /// Whether the strategy has passed an external security audit
    pub is_audited: bool,
    /// SHA-256 hash of the audit report (0 if not audited)
    pub audit_report_hash: Option<BytesN<32>>,
    /// Cumulative on-chain performance data
    pub total_executions: u64,
    pub total_volume: i128,
    /// Average return across all closed positions (bps, signed)
    pub avg_return_bps: i32,
    pub published_at: u64,
    pub is_active: bool,
    /// Minimum agent reputation level required (0=Unverified, 1=Verified, 2=Trusted, 3=Elite)
    pub min_agent_level: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MarketplaceConfig {
    pub admin: Address,
    /// Platform fee in basis points (e.g. 500 = 5% of execution_fee)
    pub platform_fee_bps: u32,
    /// Address to receive platform fees
    pub platform_treasury: Address,
    pub total_strategies: u64,
    pub total_executions: u64,
}

#[contracttype]
pub enum DataKey {
    Config,
    Strategy(BytesN<32>),      // strategy_id → StrategyListing
    AuthorStrategy(Address, u64), // (author, index) → strategy_id
    AuthorStrategyCount(Address),
}

const INSTANCE_TTL: u32  = 1_000_000;
const STRATEGY_TTL: u32  = 1_000_000;
const MAX_PLATFORM_FEE: u32 = 2_000; // 20% max

// ── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct StrategyMarketplaceContract;

#[contractimpl]
impl StrategyMarketplaceContract {
    pub fn initialize(
        env: Env,
        admin: Address,
        platform_fee_bps: u32,
        platform_treasury: Address,
    ) -> Result<(), MarketplaceError> {
        if env.storage().instance().has(&DataKey::Config) {
            return Err(MarketplaceError::AlreadyInitialized);
        }
        if platform_fee_bps > MAX_PLATFORM_FEE {
            return Err(MarketplaceError::InvalidFee);
        }
        admin.require_auth();
        let config = MarketplaceConfig {
            admin,
            platform_fee_bps,
            platform_treasury,
            total_strategies: 0,
            total_executions: 0,
        };
        env.storage().instance().set(&DataKey::Config, &config);
        env.storage().instance().extend_ttl(INSTANCE_TTL, INSTANCE_TTL);
        Ok(())
    }

    // ── Strategy publication ──────────────────────────────────────────────────

    /// Developer publishes a new strategy.
    pub fn publish_strategy(
        env: Env,
        author: Address,
        name: String,
        description: String,
        protocol: Address,
        category: u32,
        risk_level: u32,
        execution_fee: i128,
        fee_asset: Address,
        min_amount: i128,
        max_amount: i128,
        estimated_apr_bps: u32,
        min_agent_level: u32,
    ) -> Result<BytesN<32>, MarketplaceError> {
        author.require_auth();

        let now = env.ledger().timestamp();

        // Derive strategy ID from author + name + timestamp
        let mut id_input = Bytes::new(&env);
        id_input.append(&Bytes::from_slice(&env, author.to_string().as_bytes()));
        id_input.append(&Bytes::from_slice(&env, name.to_string().as_bytes()));
        let ts_bytes = now.to_be_bytes();
        id_input.append(&Bytes::from_slice(&env, &ts_bytes));
        let strategy_id: BytesN<32> = env.crypto().sha256(&id_input).into();

        let cat = Self::parse_category(category)?;
        let risk = Self::parse_risk_level(risk_level)?;

        let listing = StrategyListing {
            strategy_id: strategy_id.clone(),
            author: author.clone(),
            name,
            description,
            protocol,
            category: cat,
            risk_level: risk,
            execution_fee,
            fee_asset,
            min_amount,
            max_amount,
            estimated_apr_bps,
            is_audited: false,
            audit_report_hash: None,
            total_executions: 0,
            total_volume: 0,
            avg_return_bps: 0,
            published_at: now,
            is_active: true,
            min_agent_level,
        };

        let strat_key = DataKey::Strategy(strategy_id.clone());
        env.storage().persistent().set(&strat_key, &listing);
        env.storage().persistent().extend_ttl(&strat_key, STRATEGY_TTL, STRATEGY_TTL);

        // Index author's strategies
        let count_key = DataKey::AuthorStrategyCount(author.clone());
        let idx: u64 = env.storage().persistent()
            .get::<DataKey, u64>(&count_key)
            .unwrap_or(0);
        env.storage().persistent().set(
            &DataKey::AuthorStrategy(author.clone(), idx),
            &strategy_id,
        );
        env.storage().persistent().set(&count_key, &(idx + 1));

        // Update global stats
        let mut config = Self::get_config(&env)?;
        config.total_strategies += 1;
        env.storage().instance().set(&DataKey::Config, &config);

        env.events().publish(
            (soroban_sdk::symbol_short!("PUB"), author),
            strategy_id.clone(),
        );
        Ok(strategy_id)
    }

    // ── Strategy execution ────────────────────────────────────────────────────

    /// Agent executes a strategy.
    ///
    /// Transfers the execution fee from `agent` to the strategy author (minus platform cut).
    /// Returns the strategy's protocol address for the caller (vault) to use.
    pub fn execute_strategy(
        env: Env,
        agent: Address,
        strategy_id: BytesN<32>,
        execution_amount: i128,
    ) -> Result<Address, MarketplaceError> {
        agent.require_auth();

        let mut listing = Self::get_strategy_active(&env, &strategy_id)?;

        if execution_amount < listing.min_amount {
            return Err(MarketplaceError::AmountBelowMinimum);
        }
        if listing.max_amount > 0 && execution_amount > listing.max_amount {
            return Err(MarketplaceError::AmountAboveMaximum);
        }

        let config = Self::get_config(&env)?;
        let fee = listing.execution_fee;

        if fee > 0 {
            // Calculate platform cut
            let platform_cut = (fee as i128 * config.platform_fee_bps as i128) / 10_000;
            let author_cut = fee - platform_cut;

            // Transfer fee from agent to author
            let fee_token = token::Client::new(&env, &listing.fee_asset);
            fee_token.transfer(&agent, &listing.author, &author_cut);

            if platform_cut > 0 {
                fee_token.transfer(&agent, &config.platform_treasury, &platform_cut);
            }
        }

        // Update stats
        listing.total_executions += 1;
        listing.total_volume = listing.total_volume.saturating_add(execution_amount);
        env.storage().persistent().set(&DataKey::Strategy(strategy_id.clone()), &listing);

        let mut config = Self::get_config(&env)?;
        config.total_executions += 1;
        env.storage().instance().set(&DataKey::Config, &config);

        env.events().publish(
            (soroban_sdk::symbol_short!("EXEC"), agent),
            (strategy_id, execution_amount, fee),
        );

        Ok(listing.protocol)
    }

    /// Update a strategy's aggregated return stats (called by vault on position close).
    pub fn record_return(
        env: Env,
        strategy_id: BytesN<32>,
        return_bps: i32,
    ) -> Result<(), MarketplaceError> {
        // Only the admin / authorised vault can call this
        let config = Self::get_config(&env)?;
        config.admin.require_auth();

        let mut listing = Self::get_strategy(&env, &strategy_id)?;
        if listing.total_executions > 0 {
            listing.avg_return_bps = (listing.avg_return_bps
                .saturating_mul(listing.total_executions as i32 - 1)
                .saturating_add(return_bps))
                / listing.total_executions as i32;
        } else {
            listing.avg_return_bps = return_bps;
        }
        env.storage().persistent().set(&DataKey::Strategy(strategy_id), &listing);
        Ok(())
    }

    // ── Admin actions ─────────────────────────────────────────────────────────

    /// Mark a strategy as audited and record the audit report hash.
    pub fn audit_strategy(
        env: Env,
        strategy_id: BytesN<32>,
        audit_report_hash: BytesN<32>,
    ) -> Result<(), MarketplaceError> {
        Self::require_admin(&env)?;
        let mut listing = Self::get_strategy(&env, &strategy_id)?;
        listing.is_audited = true;
        listing.audit_report_hash = Some(audit_report_hash);
        env.storage().persistent().set(&DataKey::Strategy(strategy_id.clone()), &listing);
        env.events().publish(
            (soroban_sdk::symbol_short!("AUDIT"), strategy_id),
            audit_report_hash,
        );
        Ok(())
    }

    pub fn deactivate_strategy(env: Env, strategy_id: BytesN<32>) -> Result<(), MarketplaceError> {
        let mut listing = Self::get_strategy(&env, &strategy_id)?;
        // Only author or admin can deactivate
        if listing.author.try_require_auth().is_err() {
            Self::require_admin(&env)?;
        }
        listing.is_active = false;
        env.storage().persistent().set(&DataKey::Strategy(strategy_id), &listing);
        Ok(())
    }

    pub fn update_platform_fee(env: Env, new_fee_bps: u32) -> Result<(), MarketplaceError> {
        let mut config = Self::require_admin(&env)?;
        if new_fee_bps > MAX_PLATFORM_FEE {
            return Err(MarketplaceError::InvalidFee);
        }
        config.platform_fee_bps = new_fee_bps;
        env.storage().instance().set(&DataKey::Config, &config);
        Ok(())
    }

    // ── Views ─────────────────────────────────────────────────────────────────

    pub fn get_strategy_info(env: Env, strategy_id: BytesN<32>) -> Result<StrategyListing, MarketplaceError> {
        Self::get_strategy(&env, &strategy_id)
    }

    pub fn get_marketplace_stats(env: Env) -> Result<MarketplaceConfig, MarketplaceError> {
        Self::get_config(&env)
    }

    pub fn get_author_strategy_count(env: Env, author: Address) -> u64 {
        env.storage().persistent()
            .get::<DataKey, u64>(&DataKey::AuthorStrategyCount(author))
            .unwrap_or(0)
    }

    // ── Internal ──────────────────────────────────────────────────────────────

    fn get_config(env: &Env) -> Result<MarketplaceConfig, MarketplaceError> {
        env.storage().instance()
            .get::<DataKey, MarketplaceConfig>(&DataKey::Config)
            .ok_or(MarketplaceError::NotInitialized)
    }

    fn require_admin(env: &Env) -> Result<MarketplaceConfig, MarketplaceError> {
        let config = Self::get_config(env)?;
        config.admin.require_auth();
        Ok(config)
    }

    fn get_strategy(env: &Env, id: &BytesN<32>) -> Result<StrategyListing, MarketplaceError> {
        env.storage().persistent()
            .get::<DataKey, StrategyListing>(&DataKey::Strategy(id.clone()))
            .ok_or(MarketplaceError::StrategyNotFound)
    }

    fn get_strategy_active(env: &Env, id: &BytesN<32>) -> Result<StrategyListing, MarketplaceError> {
        let s = Self::get_strategy(env, id)?;
        if !s.is_active {
            return Err(MarketplaceError::StrategyInactive);
        }
        Ok(s)
    }

    fn parse_category(v: u32) -> Result<StrategyCategory, MarketplaceError> {
        match v {
            0 => Ok(StrategyCategory::Lending),
            1 => Ok(StrategyCategory::LiquidityProvision),
            2 => Ok(StrategyCategory::Staking),
            3 => Ok(StrategyCategory::Arbitrage),
            4 => Ok(StrategyCategory::RWA),
            5 => Ok(StrategyCategory::Remittance),
            6 => Ok(StrategyCategory::Other),
            _ => Err(MarketplaceError::InvalidFee),
        }
    }

    fn parse_risk_level(v: u32) -> Result<RiskLevel, MarketplaceError> {
        match v {
            0 => Ok(RiskLevel::Low),
            1 => Ok(RiskLevel::Medium),
            2 => Ok(RiskLevel::High),
            _ => Err(MarketplaceError::InvalidRiskLevel),
        }
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{
        testutils::Address as _,
        token::{Client as TokenClient, StellarAssetClient},
        Env, String,
    };

    struct Setup {
        env: Env,
        admin: Address,
        treasury: Address,
        client: StrategyMarketplaceContractClient<'static>,
        fee_asset: Address,
    }

    fn setup() -> Setup {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);

        let token_admin = Address::generate(&env);
        let token = env.register_stellar_asset_contract_v2(token_admin.clone());
        let fee_asset = token.address();

        let id = env.register_contract(None, StrategyMarketplaceContract);
        let client: StrategyMarketplaceContractClient<'static> =
            unsafe { core::mem::transmute(StrategyMarketplaceContractClient::new(&env, &id)) };
        client.initialize(&admin, &500_u32, &treasury); // 5% platform fee

        Setup { env, admin, treasury, client, fee_asset }
    }

    #[test]
    fn test_publish_and_get_strategy() {
        let s = setup();
        let author = Address::generate(&s.env);
        let protocol = Address::generate(&s.env);

        let id = s.client.publish_strategy(
            &author,
            &String::from_str(&s.env, "USDC Lending v1"),
            &String::from_str(&s.env, "Lend USDC on Stellar"),
            &protocol,
            &0_u32, // Lending
            &0_u32, // Low risk
            &1_000_000_i128, // 0.1 USDC fee
            &s.fee_asset,
            &1_000_000_i128,
            &0_i128,
            &500_u32, // 5% APR
            &1_u32,   // min Verified level
        );

        let listing = s.client.get_strategy_info(&id);
        assert!(listing.is_active);
        assert!(!listing.is_audited);
        assert_eq!(listing.total_executions, 0);
    }

    #[test]
    fn test_audit_strategy() {
        let s = setup();
        let author = Address::generate(&s.env);
        let protocol = Address::generate(&s.env);

        let id = s.client.publish_strategy(
            &author,
            &String::from_str(&s.env, "Staking v1"),
            &String::from_str(&s.env, "XLM Staking"),
            &protocol,
            &2_u32, &1_u32, &500_000_i128, &s.fee_asset,
            &1_000_000_i128, &0_i128, &800_u32, &0_u32,
        );

        let report_hash = BytesN::from_array(&s.env, &[0xAB; 32]);
        s.client.audit_strategy(&id, &report_hash);

        let listing = s.client.get_strategy_info(&id);
        assert!(listing.is_audited);
        assert_eq!(listing.audit_report_hash, Some(report_hash));
    }
}
