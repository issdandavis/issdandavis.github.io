#!/usr/bin/env bash
# start.sh — start Polly backend on Linux/WSL, optionally behind ProtonVPN
# Usage: ./start.sh [--no-firewall]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Load .env ─────────────────────────────────────────────────────────────────
if [[ -f "$SCRIPT_DIR/.env" ]]; then
  echo "[env]  Loading .env"
  set -o allexport
  # shellcheck disable=SC1091
  source "$SCRIPT_DIR/.env"
  set +o allexport
else
  echo "[warn] No .env found. Copy .env.example to .env and set your values."
fi

# ── Detect ProtonVPN port forwarding (Linux CLI) ──────────────────────────────
detect_proton_port() {
  # Option A: protonvpn-cli status output
  if command -v protonvpn &>/dev/null; then
    local status
    status=$(protonvpn status 2>/dev/null || true)
    if [[ "$status" =~ Port\ Forwarding:\ ([0-9]{4,5}) ]]; then
      echo "${BASH_REMATCH[1]}"
      return
    fi
  fi

  # Option B: natpmpc — ProtonVPN uses NAT-PMP under the hood on some servers
  if command -v natpmpc &>/dev/null; then
    local pmp
    pmp=$(natpmpc 2>/dev/null | grep -oP 'mapped public port \K[0-9]+' || true)
    [[ -n "$pmp" ]] && { echo "$pmp"; return; }
  fi

  # Option C: ProtonVPN state file (Linux app)
  local state_dir="$HOME/.config/protonvpn"
  if [[ -d "$state_dir" ]]; then
    local port
    port=$(grep -roP '"port_forwarding_port"\s*:\s*\K[0-9]+' "$state_dir" 2>/dev/null | head -1 || true)
    [[ -n "$port" ]] && { echo "$port"; return; }
  fi

  echo ""
}

DETECTED_PORT=$(detect_proton_port)
FINAL_PORT="${POLLY_PORT:-8001}"

if [[ -n "$DETECTED_PORT" ]]; then
  echo "[vpn]  Detected ProtonVPN forwarded port: $DETECTED_PORT"
  FINAL_PORT="$DETECTED_PORT"
  export POLLY_PORT="$FINAL_PORT"
elif [[ -n "${POLLY_PORT:-}" ]]; then
  echo "[port] Using POLLY_PORT from .env: $POLLY_PORT"
  echo ""
  echo "  NOTE: Could not auto-detect ProtonVPN port."
  echo "  Linux: run 'protonvpn status' and look for the Port Forwarding line."
  echo "  Update POLLY_PORT in .env to match."
  echo ""
else
  echo ""
  echo "  ACTION REQUIRED:"
  echo "  1. Connect ProtonVPN:  sudo protonvpn connect --p2p"
  echo "  2. Enable port fwd:    protonvpn config set port-forwarding on"
  echo "  3. Check the port:     protonvpn status | grep Port"
  echo "  4. Set POLLY_PORT=<port> in .env and re-run."
  echo ""
  echo "  Defaulting to 8001 (not Proton-exposed)."
fi

# ── Firewall (ufw / iptables) ─────────────────────────────────────────────────
if [[ "${1:-}" != "--no-firewall" ]]; then
  if command -v ufw &>/dev/null && ufw status | grep -q "Status: active"; then
    if ! ufw status numbered | grep -q "$FINAL_PORT/tcp"; then
      echo "[fw]   Adding ufw rule for port $FINAL_PORT"
      sudo ufw allow "$FINAL_PORT/tcp" comment "Polly backend (ProtonVPN)" || true
    else
      echo "[fw]   ufw rule already exists for port $FINAL_PORT"
    fi
  fi
fi

# ── Start server ──────────────────────────────────────────────────────────────
POLLY_HOST="${POLLY_HOST:-0.0.0.0}"

echo ""
echo "  Starting Polly backend"
echo "  Bind   : ${POLLY_HOST}:${FINAL_PORT}"
echo "  Model  : ${POLLY_MODEL:-llama3.2:3b} (via ${OLLAMA_BASE_URL:-http://localhost:11434})"
echo "  Eggs   : ${POLLY_EGG_DIR:-eggs/} (clutch=${POLLY_CLUTCH_SIZE:-12})"
[[ -n "$DETECTED_PORT" ]] && echo "  VPN    : ProtonVPN port forwarding active on $FINAL_PORT"
echo ""
echo "  Health check: http://localhost:${FINAL_PORT}/health"
echo ""

cd "$SCRIPT_DIR"
python3 -m uvicorn server:app --host "$POLLY_HOST" --port "$FINAL_PORT" --no-access-log
