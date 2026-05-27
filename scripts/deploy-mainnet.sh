#!/usr/bin/env bash
# Deploy VeilVault1 contracts to Stellar Mainnet
# ⚠️  CAUTION: This deploys to production. Double-check everything before running.
set -euo pipefail

RED="\033[0;31m"
GREEN="\033[0;32m"
YELLOW="\033[1;33m"
NC="\033[0m"

info()  { echo -e "${GREEN}[mainnet]${NC} $*"; }
warn()  { echo -e "${YELLOW}[warn]${NC}   $*"; }
error() { echo -e "${RED}[error]${NC}  $*"; exit 1; }

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTRACTS_DIR="$REPO_ROOT/contracts"
NETWORK="mainnet"

# Load .env
[[ -f "$REPO_ROOT/.env" ]] && { set -a && source "$REPO_ROOT/.env" && set +a; }

[[ -z "${ADMIN_SECRET_KEY:-}" ]] && error "ADMIN_SECRET_KEY not set"

# ── Safety prompt ─────────────────────────────────────────────────────────────
echo -e "${RED}"
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║           ⚠  MAINNET DEPLOYMENT — ARE YOU SURE?  ⚠          ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  This will deploy contracts to Stellar Mainnet.              ║"
echo "║  Ensure you have:                                            ║"
echo "║    ✓ Audited all contracts                                   ║"
echo "║    ✓ Tested thoroughly on Testnet                            ║"
echo "║    ✓ Sufficient XLM for deployment fees                      ║"
echo "║    ✓ Backed up your admin secret key securely                ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"
read -p "Type 'deploy mainnet' to confirm: " CONFIRM
[[ "$CONFIRM" != "deploy mainnet" ]] && error "Deployment cancelled."

# ── Pre-deployment checks ─────────────────────────────────────────────────────
info "Running pre-deployment checks..."

# Ensure testnet deployment IDs exist (proof of testnet testing)
[[ -z "${VAULT_CONTRACT_ID:-}" ]] && \
  warn "No testnet VAULT_CONTRACT_ID found. Have you deployed to testnet first?"

# Check Rust/WASM toolchain
cargo build --release --target wasm32-unknown-unknown -p vault --dry-run &>/dev/null || \
  error "Build check failed. Fix compilation errors first."

# ── Build with release profile ────────────────────────────────────────────────
info "Building contracts for mainnet (release)..."
cd "$CONTRACTS_DIR"

cargo build --profile release --target wasm32-unknown-unknown

for contract in vault x402_verifier dwallet_verifier; do
  stellar contract optimize \
    --wasm "target/wasm32-unknown-unknown/release/${contract}.wasm"
done
info "Contracts built and optimized."

ADMIN_PK=$(stellar keys show admin 2>/dev/null)
ORACLE_PK=$(stellar keys show oracle 2>/dev/null)

info "Admin public key: $ADMIN_PK"
read -p "Confirm this is correct (y/N): " CONFIRM_KEY
[[ "$CONFIRM_KEY" != "y" ]] && error "Cancelled."

# ── Deploy ────────────────────────────────────────────────────────────────────
info "Deploying x402-verifier to mainnet..."
X402_ID=$(stellar contract deploy \
  --wasm "target/wasm32-unknown-unknown/release/x402_verifier.wasm" \
  --source admin \
  --network "$NETWORK")
info "x402-verifier: $X402_ID"

stellar contract invoke --id "$X402_ID" --source admin --network "$NETWORK" \
  -- initialize --admin "$ADMIN_PK" --oracle "$ORACLE_PK"

info "Deploying dwallet-verifier to mainnet..."
DWALLET_ID=$(stellar contract deploy \
  --wasm "target/wasm32-unknown-unknown/release/dwallet_verifier.wasm" \
  --source admin \
  --network "$NETWORK")
info "dwallet-verifier: $DWALLET_ID"

stellar contract invoke --id "$DWALLET_ID" --source admin --network "$NETWORK" \
  -- initialize --admin "$ADMIN_PK"

info "Deploying vault to mainnet..."
VAULT_ID=$(stellar contract deploy \
  --wasm "target/wasm32-unknown-unknown/release/vault.wasm" \
  --source admin \
  --network "$NETWORK")
info "Vault: $VAULT_ID"

# Wire up verifiers
stellar contract invoke --id "$VAULT_ID" --source admin --network "$NETWORK" \
  -- set_x402_verifier --verifier "$X402_ID"
stellar contract invoke --id "$VAULT_ID" --source admin --network "$NETWORK" \
  -- set_dwallet_verifier --verifier "$DWALLET_ID"

# ── Record deployment ─────────────────────────────────────────────────────────
DEPLOY_LOG="$REPO_ROOT/deployments/mainnet-$(date +%Y%m%d-%H%M%S).json"
mkdir -p "$REPO_ROOT/deployments"
cat > "$DEPLOY_LOG" <<EOF
{
  "network": "mainnet",
  "deployedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "vault": "$VAULT_ID",
  "x402Verifier": "$X402_ID",
  "dwalletVerifier": "$DWALLET_ID",
  "admin": "$ADMIN_PK"
}
EOF
info "Deployment recorded: $DEPLOY_LOG"

echo ""
info "═══════════════════════════════════════════════════"
info "VeilVault1 Mainnet Deployment Complete"
info "═══════════════════════════════════════════════════"
info "Vault:           $VAULT_ID"
info "x402 Verifier:   $X402_ID"
info "dWallet Verifier: $DWALLET_ID"
info ""
info "https://stellar.expert/explorer/public/contract/$VAULT_ID"
info "═══════════════════════════════════════════════════"
