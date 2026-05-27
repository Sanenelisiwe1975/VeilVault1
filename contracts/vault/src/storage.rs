use soroban_sdk::{contracttype, Address, Bytes, Env, String, Vec};

// TTL constants (ledger sequences; ~5 sec/ledger on mainnet)
pub const INSTANCE_TTL_THRESHOLD: u32 = 100_000;
pub const INSTANCE_TTL_BUMP: u32 = 1_000_000;
pub const PERSISTENT_TTL_THRESHOLD: u32 = 50_000;
pub const PERSISTENT_TTL_BUMP: u32 = 500_000;
// Temporary storage: ~2 days at 5s/ledger
pub const TEMP_TTL: u32 = 34_560;

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct GuardrailsConfig {
    /// Max single-tx drawdown in basis points (e.g. 2000 = 20%)
    pub max_drawdown_bps: u32,
    /// Max cumulative daily outflow in asset units (0 = unlimited)
    pub daily_spending_cap: i128,
    /// Seconds after deposit before withdrawal is allowed
    pub time_lock_seconds: u64,
    /// Approved DeFi protocol addresses agents may deploy to
    pub whitelisted_protocols: Vec<Address>,
    /// Max single position as % of vault assets in bps (0 = unlimited)
    pub max_position_size_bps: u32,
    /// Max leverage in bps (10000 = 1x, 30000 = 3x; 0 = unlimited)
    pub max_leverage_bps: u32,
    /// Global circuit breaker — stops all agent operations
    pub emergency_stop: bool,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VaultConfig {
    pub admin: Address,
    pub name: String,
    /// SAC (Stellar Asset Contract) token address for the vault asset
    pub asset: Address,
    pub guardrails: GuardrailsConfig,
    pub paused: bool,
    /// Optional address of the x402-verifier contract
    pub x402_verifier: Option<Address>,
    /// Optional address of the dwallet-verifier contract
    pub dwallet_verifier: Option<Address>,
}

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum StrategyType {
    Lending           = 0,
    LiquidityProvision = 1,
    Staking           = 2,
    Arbitrage         = 3,
    Other             = 4,
}

impl StrategyType {
    pub fn from_u32(v: u32) -> Option<Self> {
        match v {
            0 => Some(Self::Lending),
            1 => Some(Self::LiquidityProvision),
            2 => Some(Self::Staking),
            3 => Some(Self::Arbitrage),
            4 => Some(Self::Other),
            _ => None,
        }
    }
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Position {
    pub id: u64,
    pub agent: Address,
    /// Whitelisted DeFi protocol the capital is deployed to
    pub protocol: Address,
    /// Asset deployed (may differ from vault asset for swapped strategies)
    pub asset: Address,
    /// Amount of vault asset deployed
    pub amount: i128,
    /// Marked-to-market value at open (same units as amount)
    pub entry_value: i128,
    pub opened_at: u64,
    /// 0 = no expiry
    pub expires_at: u64,
    pub strategy_type: StrategyType,
    /// Arbitrary strategy params (can be FHE-encrypted ciphertext)
    pub metadata: Bytes,
    pub is_open: bool,
}

#[contracttype]
pub enum DataKey {
    VaultConfig,
    TotalShares,
    TotalAssets,
    DeployedAssets,
    Balance(Address),
    LastDepositTime(Address),
    AuthorizedAgent(Address),
    Position(u64),
    PositionCount,
    DailySpending(u64), // keyed by unix-day (timestamp / 86400)
}

// ── Instance storage helpers ──────────────────────────────────────────────────

pub fn has_vault_config(env: &Env) -> bool {
    env.storage().instance().has(&DataKey::VaultConfig)
}

pub fn get_vault_config(env: &Env) -> VaultConfig {
    env.storage()
        .instance()
        .get::<DataKey, VaultConfig>(&DataKey::VaultConfig)
        .unwrap()
}

pub fn set_vault_config(env: &Env, config: &VaultConfig) {
    env.storage().instance().set(&DataKey::VaultConfig, config);
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_BUMP);
}

pub fn get_total_shares(env: &Env) -> i128 {
    env.storage()
        .instance()
        .get::<DataKey, i128>(&DataKey::TotalShares)
        .unwrap_or(0)
}

pub fn set_total_shares(env: &Env, shares: i128) {
    env.storage().instance().set(&DataKey::TotalShares, &shares);
}

pub fn get_total_assets(env: &Env) -> i128 {
    env.storage()
        .instance()
        .get::<DataKey, i128>(&DataKey::TotalAssets)
        .unwrap_or(0)
}

pub fn set_total_assets(env: &Env, assets: i128) {
    env.storage().instance().set(&DataKey::TotalAssets, &assets);
}

pub fn get_deployed_assets(env: &Env) -> i128 {
    env.storage()
        .instance()
        .get::<DataKey, i128>(&DataKey::DeployedAssets)
        .unwrap_or(0)
}

pub fn set_deployed_assets(env: &Env, amount: i128) {
    env.storage().instance().set(&DataKey::DeployedAssets, &amount);
}

pub fn get_position_count(env: &Env) -> u64 {
    env.storage()
        .instance()
        .get::<DataKey, u64>(&DataKey::PositionCount)
        .unwrap_or(0)
}

pub fn next_position_id(env: &Env) -> u64 {
    let id = get_position_count(env) + 1;
    env.storage().instance().set(&DataKey::PositionCount, &id);
    id
}

// ── Persistent storage helpers ────────────────────────────────────────────────

pub fn get_balance(env: &Env, address: &Address) -> i128 {
    let key = DataKey::Balance(address.clone());
    env.storage()
        .persistent()
        .get::<DataKey, i128>(&key)
        .unwrap_or(0)
}

pub fn set_balance(env: &Env, address: &Address, balance: i128) {
    let key = DataKey::Balance(address.clone());
    if balance == 0 {
        env.storage().persistent().remove(&key);
    } else {
        env.storage().persistent().set(&key, &balance);
        env.storage()
            .persistent()
            .extend_ttl(&key, PERSISTENT_TTL_THRESHOLD, PERSISTENT_TTL_BUMP);
    }
}

pub fn get_last_deposit_time(env: &Env, address: &Address) -> u64 {
    let key = DataKey::LastDepositTime(address.clone());
    env.storage()
        .persistent()
        .get::<DataKey, u64>(&key)
        .unwrap_or(0)
}

pub fn set_last_deposit_time(env: &Env, address: &Address, ts: u64) {
    let key = DataKey::LastDepositTime(address.clone());
    env.storage().persistent().set(&key, &ts);
    env.storage()
        .persistent()
        .extend_ttl(&key, PERSISTENT_TTL_THRESHOLD, PERSISTENT_TTL_BUMP);
}

pub fn is_authorized_agent(env: &Env, address: &Address) -> bool {
    let key = DataKey::AuthorizedAgent(address.clone());
    env.storage()
        .persistent()
        .get::<DataKey, bool>(&key)
        .unwrap_or(false)
}

pub fn set_agent_authorization(env: &Env, address: &Address, authorized: bool) {
    let key = DataKey::AuthorizedAgent(address.clone());
    if authorized {
        env.storage().persistent().set(&key, &true);
        env.storage()
            .persistent()
            .extend_ttl(&key, PERSISTENT_TTL_THRESHOLD, PERSISTENT_TTL_BUMP);
    } else {
        env.storage().persistent().remove(&key);
    }
}

pub fn get_position(env: &Env, id: u64) -> Option<Position> {
    let key = DataKey::Position(id);
    env.storage().persistent().get::<DataKey, Position>(&key)
}

pub fn set_position(env: &Env, position: &Position) {
    let key = DataKey::Position(position.id);
    env.storage().persistent().set(&key, position);
    env.storage()
        .persistent()
        .extend_ttl(&key, PERSISTENT_TTL_THRESHOLD, PERSISTENT_TTL_BUMP);
}

// ── Temporary storage helpers ─────────────────────────────────────────────────

pub fn get_daily_spending(env: &Env, day: u64) -> i128 {
    let key = DataKey::DailySpending(day);
    env.storage()
        .temporary()
        .get::<DataKey, i128>(&key)
        .unwrap_or(0)
}

pub fn add_daily_spending(env: &Env, day: u64, amount: i128) {
    let key = DataKey::DailySpending(day);
    let prev = get_daily_spending(env, day);
    env.storage().temporary().set(&key, &(prev + amount));
    env.storage().temporary().extend_ttl(&key, TEMP_TTL, TEMP_TTL);
}
