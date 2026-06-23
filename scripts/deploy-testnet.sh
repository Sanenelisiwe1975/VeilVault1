#!/usr/bin/env bash
# Deploy VeilVault1 contracts to Stellar Testnet
set -euo pipefail

GREEN="\033[0;32m"
YELLOW="\033[1;33m"
RED="\033[0;31m"
NC="\033[0m"

info()  { echo -e "${GREEN}[deploy]${NC} $*"; }
warn()  { echo -e "${YELLOW}[warn]${NC}  $*"; }
error() { echo -e "${RED}[error]${NC} $*"; exit 1; }

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTRACTS_DIR="$REPO_ROOT/contracts"
NETWORK="testnet"

# Load .env
if [[ -f "$REPO_ROOT/.env" ]]; then
  set -a && source "$REPO_ROOT/.env" && set +a
fi

[[ -z "${ADMIN_SECRET_KEY:-}" ]] && error "ADMIN_SECRET_KEY not set in .env"

stellar keys generate admin 2>/dev/null || true
ADMIN_PK=$(stellar keys address admin)

# Fund testnet account if needed
info "Funding admin account on testnet..."
stellar keys fund admin --network "$NETWORK" 2>/dev/null || warn "Fund request failed (account may already exist)"

# agent-registry uses an M-of-N admin multisig (see contracts/agent-registry).
# Set ADDITIONAL_ADMIN_PKS (comma-separated G... public keys) in .env to add
# more independent admin signers; ADMIN_THRESHOLD overrides the default
# majority threshold. With no additional admins this is a 1-of-1 deployment
# (fine for a solo testnet demo, but production should use >=3 independent
# keys with threshold >=2 so no single key can ban/slash an agent alone).
EXTRA_ADMINS=()
if [[ -n "${ADDITIONAL_ADMIN_PKS:-}" ]]; then
  IFS=',' read -ra EXTRA_ADMINS <<< "$ADDITIONAL_ADMIN_PKS"
fi
ADMINS_JSON="[\"$ADMIN_PK\""
for pk in "${EXTRA_ADMINS[@]}"; do
  ADMINS_JSON="$ADMINS_JSON,\"$pk\""
done
ADMINS_JSON="$ADMINS_JSON]"
TOTAL_ADMINS=$(( 1 + ${#EXTRA_ADMINS[@]} ))
DEFAULT_THRESHOLD=$(( TOTAL_ADMINS / 2 + 1 ))
[[ $DEFAULT_THRESHOLD -gt $TOTAL_ADMINS ]] && DEFAULT_THRESHOLD=$TOTAL_ADMINS
ADMIN_THRESHOLD="${ADMIN_THRESHOLD:-$DEFAULT_THRESHOLD}"
info "agent-registry admins: $ADMINS_JSON (threshold $ADMIN_THRESHOLD-of-$TOTAL_ADMINS)"

# Build contracts
info "Building Soroban contracts (optimized release)..."
cd "$CONTRACTS_DIR"

# Build vault dependencies first — contractimport! reads their WASMs at compile time
cargo build --release --target wasm32-unknown-unknown -p x402-verifier
cargo build --release --target wasm32-unknown-unknown -p dwallet-verifier
cargo build --release --target wasm32-unknown-unknown -p agent-registry
# Now vault can find the WASMs it imports
cargo build --release --target wasm32-unknown-unknown -p vault
cargo build --release --target wasm32-unknown-unknown -p strategy-marketplace
cargo build --release --target wasm32-unknown-unknown -p stokvel-vault
cargo build --release --target wasm32-unknown-unknown -p zk-attestation
cargo build --release --target wasm32-unknown-unknown -p privacy-pool
cargo build --release --target wasm32-unknown-unknown -p passkey-registry

# Optimize WASM binaries
for contract in vault x402_verifier dwallet_verifier agent_registry strategy_marketplace stokvel_vault zk_attestation privacy_pool passkey_registry; do
  WASM="target/wasm32-unknown-unknown/release/${contract}.wasm"
  if command -v stellar &>/dev/null; then
    stellar contract optimize --wasm "$WASM" 2>/dev/null || warn "Optimize skipped for $contract"
  fi
done

info "Contracts built."

#Deploy x402-verifier
info "Deploying x402-verifier..."
X402_ID=$(stellar contract deploy \
  --wasm "target/wasm32-unknown-unknown/release/x402_verifier.optimized.wasm" \
  --source admin \
  --network "$NETWORK" \
  --ignore-checks)
info "x402-verifier deployed: $X402_ID"

# Initialize x402-verifier
stellar keys generate oracle 2>/dev/null || true
ORACLE_PK=$(stellar keys address oracle)

stellar contract invoke \
  --id "$X402_ID" \
  --source admin \
  --network "$NETWORK" \
  -- initialize \
  --admin "$ADMIN_PK" \
  --oracle "$ORACLE_PK"
info "x402-verifier initialized."

# Deploy dwallet-verifier
info "Deploying dwallet-verifier..."
DWALLET_ID=$(stellar contract deploy \
  --wasm "target/wasm32-unknown-unknown/release/dwallet_verifier.optimized.wasm" \
  --source admin \
  --network "$NETWORK" \
  --ignore-checks)
info "dwallet-verifier deployed: $DWALLET_ID"

stellar contract invoke \
  --id "$DWALLET_ID" \
  --source admin \
  --network "$NETWORK" \
  -- initialize \
  --admin "$ADMIN_PK"
info "dwallet-verifier initialized."

#Deploy vault
info "Deploying vault contract..."
VAULT_ID=$(stellar contract deploy \
  --wasm "target/wasm32-unknown-unknown/release/vault.optimized.wasm" \
  --source admin \
  --network "$NETWORK" \
  --ignore-checks)
info "Vault deployed: $VAULT_ID"

# Get the USDC testnet SAC address (or use native XLM)
USDC_TESTNET="CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA"

# Initialize vault with default guardrails
stellar contract invoke \
  --id "$VAULT_ID" \
  --source admin \
  --network "$NETWORK" \
  -- initialize \
  --admin "$ADMIN_PK" \
  --name "VeilVault1-Testnet" \
  --asset "$USDC_TESTNET" \
  --guardrails '{"daily_spending_cap":"0","emergency_stop":false,"max_drawdown_bps":5000,"max_leverage_bps":0,"max_position_size_bps":7000,"time_lock_seconds":0,"whitelisted_protocols":[]}'
info "Vault initialized."

# Deploy agent registry
info "Deploying agent-registry..."
REGISTRY_ID=$(stellar contract deploy \
  --wasm "target/wasm32-unknown-unknown/release/agent_registry.optimized.wasm" \
  --source admin \
  --network "$NETWORK" \
  --ignore-checks)
info "agent-registry deployed: $REGISTRY_ID"

stellar contract invoke \
  --id "$REGISTRY_ID" \
  --source admin \
  --network "$NETWORK" \
  -- initialize \
  --admins "$ADMINS_JSON" \
  --admin_threshold "$ADMIN_THRESHOLD"
info "agent-registry initialized."

# Deploy strategy-marketplace
info "Deploying strategy-marketplace..."
MARKETPLACE_ID=$(stellar contract deploy \
  --wasm "target/wasm32-unknown-unknown/release/strategy_marketplace.optimized.wasm" \
  --source admin \
  --network "$NETWORK" \
  --ignore-checks)
info "strategy-marketplace deployed: $MARKETPLACE_ID"

stellar contract invoke \
  --id "$MARKETPLACE_ID" \
  --source admin \
  --network "$NETWORK" \
  -- initialize \
  --admin "$ADMIN_PK" \
  --platform_treasury "$ADMIN_PK" \
  --platform_fee_bps 200
info "strategy-marketplace initialized."

# Deploy stokvel-vault
info "Deploying stokvel-vault..."
STOKVEL_ID=$(stellar contract deploy \
  --wasm "target/wasm32-unknown-unknown/release/stokvel_vault.optimized.wasm" \
  --source admin \
  --network "$NETWORK" \
  --ignore-checks)
info "stokvel-vault deployed: $STOKVEL_ID"
# Note: stokvel init is called by the group admin, not the deployer

# Deploy zk-attestation
info "Deploying zk-attestation..."
ZK_ID=$(stellar contract deploy \
  --wasm "target/wasm32-unknown-unknown/release/zk_attestation.optimized.wasm" \
  --source admin \
  --network "$NETWORK" \
  --ignore-checks)
info "zk-attestation deployed: $ZK_ID"

stellar contract invoke \
  --id "$ZK_ID" \
  --source admin \
  --network "$NETWORK" \
  -- initialize \
  --admin "$ADMIN_PK"
info "zk-attestation initialized."

# Wire up verifiers
stellar contract invoke \
  --id "$VAULT_ID" \
  --source admin \
  --network "$NETWORK" \
  -- set_x402_verifier \
  --verifier "$X402_ID"

stellar contract invoke \
  --id "$VAULT_ID" \
  --source admin \
  --network "$NETWORK" \
  -- set_dwallet_verifier \
  --verifier "$DWALLET_ID"

# Wire agent-registry into vault
stellar contract invoke \
  --id "$VAULT_ID" \
  --source admin \
  --network "$NETWORK" \
  -- set_agent_registry \
  --registry "$REGISTRY_ID"

# Wire zk-attestation into agent-registry for selective-disclosure attribute proofs
stellar contract invoke \
  --id "$REGISTRY_ID" \
  --source admin \
  --network "$NETWORK" \
  -- set_zk_verifier \
  --caller "$ADMIN_PK" \
  --zk_verifier "$ZK_ID"
info "agent-registry: zk verifier wired."

# Deploy privacy-pool (10 USDC denomination)
info "Deploying privacy-pool..."
POOL_ID=$(stellar contract deploy \
  --wasm "target/wasm32-unknown-unknown/release/privacy_pool.optimized.wasm" \
  --source admin \
  --network "$NETWORK" \
  --ignore-checks)
info "privacy-pool deployed: $POOL_ID"

stellar contract invoke \
  --id "$POOL_ID" \
  --source admin \
  --network "$NETWORK" \
  -- initialize \
  --admin "$ADMIN_PK" \
  --asset "$USDC_TESTNET" \
  --denomination 10000000
info "privacy-pool initialized (denomination: 10 USDC)."

# Wire privacy-pool → zk-attestation (requires WITHDRAW_CIRCUIT_ID in .env)
if [[ -n "${WITHDRAW_CIRCUIT_ID:-}" ]]; then
  info "Wiring privacy-pool to zk-attestation verifier (circuit: $WITHDRAW_CIRCUIT_ID)..."
  stellar contract invoke \
    --id "$POOL_ID" \
    --source admin \
    --network "$NETWORK" \
    -- set_verifier \
    --zk_verifier "$ZK_ID" \
    --withdraw_circuit_id "$WITHDRAW_CIRCUIT_ID"
  info "privacy-pool: verifier wired."
else
  warn "WITHDRAW_CIRCUIT_ID not set — skipping set_verifier."
  warn "After registering a circuit, run:"
  warn "  stellar contract invoke --id $POOL_ID --source admin --network $NETWORK"
  warn "  -- set_verifier --zk_verifier $ZK_ID --withdraw_circuit_id <CIRCUIT_ID>"
fi

# Deploy passkey-registry (durable credential -> smart-wallet index, used by
# the passkey/account-abstraction sign-in option)
info "Deploying passkey-registry..."
PASSKEY_REGISTRY_ID=$(stellar contract deploy \
  --wasm "target/wasm32-unknown-unknown/release/passkey_registry.optimized.wasm" \
  --source admin \
  --network "$NETWORK" \
  --ignore-checks)
info "passkey-registry deployed: $PASSKEY_REGISTRY_ID"

stellar contract invoke \
  --id "$PASSKEY_REGISTRY_ID" \
  --source admin \
  --network "$NETWORK" \
  -- initialize \
  --admin "$ADMIN_PK"
info "passkey-registry initialized."

# Write contract IDs to .env
info "Updating .env with deployed contract IDs..."
ENV_FILE="$REPO_ROOT/.env"

update_env() {
  local key="$1" val="$2"
  if grep -q "^${key}=" "$ENV_FILE"; then
    # portable sed: works on GNU (Linux/WSL/Git Bash) and BSD (macOS)
    sed -i.bak "s|^${key}=.*|${key}=${val}|" "$ENV_FILE" && rm -f "${ENV_FILE}.bak"
  else
    echo "${key}=${val}" >> "$ENV_FILE"
  fi
}

update_env "VAULT_CONTRACT_ID" "$VAULT_ID"
update_env "X402_VERIFIER_CONTRACT_ID" "$X402_ID"
update_env "DWALLET_VERIFIER_CONTRACT_ID" "$DWALLET_ID"
update_env "AGENT_REGISTRY_CONTRACT_ID" "$REGISTRY_ID"
update_env "STRATEGY_MARKETPLACE_CONTRACT_ID" "$MARKETPLACE_ID"
update_env "STOKVEL_REGISTRY_CONTRACT_ID" "$STOKVEL_ID"
update_env "ZK_VERIFIER_CONTRACT_ID" "$ZK_ID"
update_env "PRIVACY_POOL_CONTRACT_ID" "$POOL_ID"
update_env "PASSKEY_REGISTRY_CONTRACT_ID" "$PASSKEY_REGISTRY_ID"
# WITHDRAW_CIRCUIT_ID is set separately after running: cd prover && cargo run -- setup

echo ""
info "═══════════════════════════════════════════════════════════"
info "VeilVault1 Testnet Deployment Complete"
info "═══════════════════════════════════════════════════════════"
info "Vault Contract:              $VAULT_ID"
info "x402 Verifier:               $X402_ID"
info "dWallet Verifier:            $DWALLET_ID"
info "Agent Registry (KYA):        $REGISTRY_ID"
info "Strategy Marketplace:        $MARKETPLACE_ID"
info "Stokvel Vault:               $STOKVEL_ID"
info "ZK Attestation:              $ZK_ID"
info "Privacy Pool (10 USDC):      $POOL_ID"
info "Network:                     $NETWORK"
info "Admin:                       $ADMIN_PK"
info ""
info "Stellar Expert:"
info "  https://testnet.stellar.expert/explorer/testnet/contract/$VAULT_ID"
info "═══════════════════════════════════════════════════════════"
