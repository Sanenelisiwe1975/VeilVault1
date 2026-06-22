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

# Safety prompt
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

# Predeployment checks
info "Running pre-deployment checks..."

# Ensure testnet deployment IDs exist (proof of testnet testing)
[[ -z "${VAULT_CONTRACT_ID:-}" ]] && \
  warn "No testnet VAULT_CONTRACT_ID found. Have you deployed to testnet first?"

# Check Rust/WASM toolchain
cargo build --release --target wasm32-unknown-unknown -p vault --dry-run &>/dev/null || \
  error "Build check failed. Fix compilation errors first."

# Build with release profile
info "Building contracts for mainnet (release)..."
cd "$CONTRACTS_DIR"

cargo build --profile release --target wasm32-unknown-unknown

for contract in vault x402_verifier dwallet_verifier agent_registry strategy_marketplace stokvel_vault zk_attestation; do
  stellar contract optimize \
    --wasm "target/wasm32-unknown-unknown/release/${contract}.wasm"
done
info "Contracts built and optimized."

ADMIN_PK=$(stellar keys show admin 2>/dev/null)
ORACLE_PK=$(stellar keys show oracle 2>/dev/null)

info "Admin public key: $ADMIN_PK"
read -p "Confirm this is correct (y/N): " CONFIRM_KEY
[[ "$CONFIRM_KEY" != "y" ]] && error "Cancelled."

# agent-registry uses an M-of-N admin multisig — no single key should be able
# to ban/slash an agent unilaterally on mainnet. Set ADDITIONAL_ADMIN_PKS
# (comma-separated G... public keys) for at least 2 more independent signers.
EXTRA_ADMINS=()
if [[ -n "${ADDITIONAL_ADMIN_PKS:-}" ]]; then
  IFS=',' read -ra EXTRA_ADMINS <<< "$ADDITIONAL_ADMIN_PKS"
fi
if [[ ${#EXTRA_ADMINS[@]} -eq 0 && "${ALLOW_SOLO_ADMIN:-}" != "1" ]]; then
  error "Mainnet deploy needs >=2 additional admin keys (set ADDITIONAL_ADMIN_PKS, comma-separated) so no single key can ban/slash an agent alone. Set ALLOW_SOLO_ADMIN=1 to override (not recommended)."
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

# Deploy
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

info "Deploying agent-registry to mainnet..."
REGISTRY_ID=$(stellar contract deploy \
  --wasm "target/wasm32-unknown-unknown/release/agent_registry.wasm" \
  --source admin \
  --network "$NETWORK")
info "agent-registry: $REGISTRY_ID"
stellar contract invoke --id "$REGISTRY_ID" --source admin --network "$NETWORK" \
  -- initialize --admins "$ADMINS_JSON" --admin_threshold "$ADMIN_THRESHOLD"

info "Deploying strategy-marketplace to mainnet..."
MARKETPLACE_ID=$(stellar contract deploy \
  --wasm "target/wasm32-unknown-unknown/release/strategy_marketplace.wasm" \
  --source admin \
  --network "$NETWORK")
info "strategy-marketplace: $MARKETPLACE_ID"
stellar contract invoke --id "$MARKETPLACE_ID" --source admin --network "$NETWORK" \
  -- initialize --admin "$ADMIN_PK" --platform_treasury "$ADMIN_PK" \
  --platform_fee_bps 200 --agent_registry "$REGISTRY_ID"

info "Deploying stokvel-vault to mainnet..."
STOKVEL_ID=$(stellar contract deploy \
  --wasm "target/wasm32-unknown-unknown/release/stokvel_vault.wasm" \
  --source admin \
  --network "$NETWORK")
info "stokvel-vault: $STOKVEL_ID"

info "Deploying zk-attestation to mainnet..."
ZK_ID=$(stellar contract deploy \
  --wasm "target/wasm32-unknown-unknown/release/zk_attestation.wasm" \
  --source admin \
  --network "$NETWORK")
info "zk-attestation: $ZK_ID"
stellar contract invoke --id "$ZK_ID" --source admin --network "$NETWORK" \
  -- initialize --admin "$ADMIN_PK"

# Wire up verifiers and registry
stellar contract invoke --id "$VAULT_ID" --source admin --network "$NETWORK" \
  -- set_x402_verifier --verifier "$X402_ID"
stellar contract invoke --id "$VAULT_ID" --source admin --network "$NETWORK" \
  -- set_dwallet_verifier --verifier "$DWALLET_ID"
stellar contract invoke --id "$VAULT_ID" --source admin --network "$NETWORK" \
  -- set_agent_registry --registry "$REGISTRY_ID"

# Record deployment 
DEPLOY_LOG="$REPO_ROOT/deployments/mainnet-$(date +%Y%m%d-%H%M%S).json"
mkdir -p "$REPO_ROOT/deployments"
cat > "$DEPLOY_LOG" <<EOF
{
  "network": "mainnet",
  "deployedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "vault": "$VAULT_ID",
  "x402Verifier": "$X402_ID",
  "dwalletVerifier": "$DWALLET_ID",
  "agentRegistry": "$REGISTRY_ID",
  "strategyMarketplace": "$MARKETPLACE_ID",
  "stokvelVault": "$STOKVEL_ID",
  "zkAttestation": "$ZK_ID",
  "admin": "$ADMIN_PK"
}
EOF
info "Deployment recorded: $DEPLOY_LOG"

echo ""
info "═══════════════════════════════════════════════════════════════"
info "VeilVault1 Mainnet Deployment Complete"
info "═══════════════════════════════════════════════════════════════"
info "Vault:               $VAULT_ID"
info "x402 Verifier:       $X402_ID"
info "dWallet Verifier:    $DWALLET_ID"
info "Agent Registry:      $REGISTRY_ID"
info "Strategy Marketplace: $MARKETPLACE_ID"
info "Stokvel Vault:       $STOKVEL_ID"
info "ZK Attestation:      $ZK_ID"
info ""
info "https://stellar.expert/explorer/public/contract/$VAULT_ID"
info "═══════════════════════════════════════════════════════════════"
