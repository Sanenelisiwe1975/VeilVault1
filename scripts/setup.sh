#!/usr/bin/env bash
# VeilVault1 setup script — install all tooling and dependencies
set -euo pipefail

GREEN="\033[0;32m"
YELLOW="\033[1;33m"
NC="\033[0m"

info()  { echo -e "${GREEN}[setup]${NC} $*"; }
warn()  { echo -e "${YELLOW}[warn]${NC}  $*"; }

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# ── Rust / Soroban ────────────────────────────────────────────────────────────
info "Checking Rust toolchain..."
if ! command -v rustup &>/dev/null; then
  info "Installing Rust..."
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable
  source "$HOME/.cargo/env"
fi

rustup target add wasm32-unknown-unknown
info "Rust wasm target installed."

if ! command -v stellar &>/dev/null; then
  info "Installing Stellar CLI..."
  cargo install --locked stellar-cli --features opt
fi
info "Stellar CLI: $(stellar --version)"

# ── Node.js ───────────────────────────────────────────────────────────────────
if ! command -v node &>/dev/null; then
  warn "Node.js not found. Please install Node.js >= 20 from https://nodejs.org"
  exit 1
fi
info "Node.js: $(node --version)"

info "Installing backend dependencies..."
cd "$REPO_ROOT/backend" && npm install

info "Installing SDK dependencies..."
cd "$REPO_ROOT/sdk" && npm install

# ── Environment ───────────────────────────────────────────────────────────────
if [[ ! -f "$REPO_ROOT/.env" ]]; then
  info "Creating .env from .env.example..."
  cp "$REPO_ROOT/.env.example" "$REPO_ROOT/.env"
  warn "Please fill in the required values in .env before running deploy scripts."
fi

info "Setup complete!"
info "Next steps:"
info "  1. Fill in .env with your keys and contract IDs"
info "  2. Run: ./scripts/deploy-testnet.sh"
info "  3. Run: cd backend && npm run dev"
