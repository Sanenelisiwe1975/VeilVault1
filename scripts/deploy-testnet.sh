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

ADMIN_PK=$(stellar keys show admin 2>/dev/null || \
  stellar keys generate --no-fund admin && stellar keys show admin)

# ── Fund testnet account if needed ────────────────────────────────────────────
info "Funding admin account on testnet..."
stellar keys fund admin --network "$NETWORK" 2>/dev/null || warn "Fund request failed (account may already exist)"

# ── Build contracts ───────────────────────────────────────────────────────────
info "Building Soroban contracts (optimized release)..."
cd "$CONTRACTS_DIR"

cargo build --release --target wasm32-unknown-unknown -p vault
cargo build --release --target wasm32-unknown-unknown -p x402-verifier
cargo build --release --target wasm32-unknown-unknown -p dwallet-verifier

# Optimize WASM binaries
for contract in vault x402_verifier dwallet_verifier; do
  WASM="target/wasm32-unknown-unknown/release/${contract}.wasm"
  if command -v stellar &>/dev/null; then
    stellar contract optimize --wasm "$WASM" 2>/dev/null || warn "Optimize skipped for $contract"
  fi
done

info "Contracts built."

# ── Deploy x402-verifier ──────────────────────────────────────────────────────
info "Deploying x402-verifier..."
X402_ID=$(stellar contract deploy \
  --wasm "target/wasm32-unknown-unknown/release/x402_verifier.wasm" \
  --source admin \
  --network "$NETWORK" \
  --ignore-checks)
info "x402-verifier deployed: $X402_ID"

# Initialize x402-verifier
ORACLE_PK=$(stellar keys show oracle 2>/dev/null || \
  stellar keys generate --no-fund oracle && stellar keys show oracle)

stellar contract invoke \
  --id "$X402_ID" \
  --source admin \
  --network "$NETWORK" \
  -- initialize \
  --admin "$ADMIN_PK" \
  --oracle "$ORACLE_PK"
info "x402-verifier initialized."

# ── Deploy dwallet-verifier ───────────────────────────────────────────────────
info "Deploying dwallet-verifier..."
DWALLET_ID=$(stellar contract deploy \
  --wasm "target/wasm32-unknown-unknown/release/dwallet_verifier.wasm" \
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

# ── Deploy vault ──────────────────────────────────────────────────────────────
info "Deploying vault contract..."
VAULT_ID=$(stellar contract deploy \
  --wasm "target/wasm32-unknown-unknown/release/vault.wasm" \
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
  --guardrails "{ \
    \"max_drawdown_bps\": 5000, \
    \"daily_spending_cap\": 0, \
    \"time_lock_seconds\": 0, \
    \"whitelisted_protocols\": [], \
    \"max_position_size_bps\": 7000, \
    \"max_leverage_bps\": 0, \
    \"emergency_stop\": false \
  }"
info "Vault initialized."

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

# ── Write contract IDs to .env ────────────────────────────────────────────────
info "Updating .env with deployed contract IDs..."
ENV_FILE="$REPO_ROOT/.env"

update_env() {
  local key="$1" val="$2"
  if grep -q "^${key}=" "$ENV_FILE"; then
    sed -i "s|^${key}=.*|${key}=${val}|" "$ENV_FILE"
  else
    echo "${key}=${val}" >> "$ENV_FILE"
  fi
}

update_env "VAULT_CONTRACT_ID" "$VAULT_ID"
update_env "X402_VERIFIER_CONTRACT_ID" "$X402_ID"
update_env "DWALLET_VERIFIER_CONTRACT_ID" "$DWALLET_ID"

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
info "═══════════════════════════════════════════════════"
info "VeilVault1 Testnet Deployment Complete"
info "═══════════════════════════════════════════════════"
info "Vault Contract:           $VAULT_ID"
info "x402 Verifier Contract:   $X402_ID"
info "dWallet Verifier Contract: $DWALLET_ID"
info "Network:                  $NETWORK"
info "Admin:                    $ADMIN_PK"
info ""
info "Stellar Expert:"
info "  https://testnet.stellar.expert/explorer/testnet/contract/$VAULT_ID"
info "═══════════════════════════════════════════════════"
