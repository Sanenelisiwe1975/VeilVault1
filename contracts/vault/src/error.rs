use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum VaultError {
    AlreadyInitialized      = 1,
    NotInitialized          = 2,
    Unauthorized            = 3,
    VaultPaused             = 4,
    InvalidAmount           = 5,
    InsufficientShares      = 6,
    InsufficientAssets      = 7,
    ZeroShares              = 8,
    TimeLockActive          = 9,
    DrawdownLimitExceeded   = 10,
    SpendingCapExceeded     = 11,
    ProtocolNotWhitelisted  = 12,
    PositionSizeTooLarge    = 13,
    LeverageExceeded        = 14,
    PositionNotFound        = 15,
    PositionAlreadyClosed   = 16,
    AgentNotAuthorized      = 17,
    AgentAlreadyAuthorized  = 18,
    InvalidGuardrails       = 19,
    EmergencyStopActive     = 20,
    PaymentNotVerified      = 21,
    ArithmeticOverflow      = 22,
    InvalidStrategyType     = 23,
    PositionExpired         = 24,
    ExternalCallFailed      = 25,
}
