#!/usr/bin/env bash
# MindMate lifecycle manager (Podman).
#
# Usage:
#   ./mindmate.sh start [--build]   Build (if needed) + start frontend :8080 + TTS :5000
#   ./mindmate.sh stop               Stop and remove MindMate containers/pod (keeps images)
#   ./mindmate.sh restart [--build]  stop + start
#   ./mindmate.sh logs [-f] [svc]    Show logs (svc: frontend|tts, default: all)
#   ./mindmate.sh status | ps        Show MindMate containers, pods, images
#   ./mindmate.sh clean [--yes]      stop + remove MindMate containers/pod/IMAGES (app-only)
#
# Notes:
#   - Prefers podman-compose / `podman compose` when available (uses compose.yaml).
#   - Falls back to plain `podman pod` commands — no extra dependencies.
#   - `clean` is intentionally APP-ONLY: it never runs `podman system prune -a`
#     so unrelated containers/images/volumes are left untouched.
#   - Config via .env (see .env.example): GEMINI_API_KEY, JULES_API_KEY,
#     JULES_SOURCE, JULES_STARTING_BRANCH, FRONTEND_PORT, TTS_PORT.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

FRONT_IMAGE="mindmate-frontend:local"
TTS_IMAGE="mindmate-tts:local"
POD="mindmate"
CONTAINERS=("mindmate-frontend" "mindmate-tts")

# Load .env if present (only simple KEY=VALUE lines, no exec).
if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi
FRONTEND_PORT="${FRONTEND_PORT:-8080}"
TTS_PORT="${TTS_PORT:-5000}"

# ── Compose backend detection ──────────────────────────────────────────────
# Sets COMPOSE_CMD array when a compose provider exists, else leaves empty
# to signal native-podman fallback.
COMPOSE_CMD=()
if command -v podman-compose >/dev/null 2>&1; then
  COMPOSE_CMD=(podman-compose)
elif podman compose version >/dev/null 2>&1; then
  COMPOSE_CMD=(podman compose)
elif command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  COMPOSE_CMD=(docker compose)
fi

die() { echo "error: $*" >&2; exit 1; }
info() { echo "==> $*"; }
need_podman() { command -v podman >/dev/null 2>&1 || die "podman not found in PATH"; }

check_assets() {
  local missing=0
  for d in main/models main/animations; do
    [[ -d "$d" ]] || { echo "warning: $d missing (container will serve empty list)" >&2; missing=1; }
  done
  return 0
}

# ── Native podman backend (no compose installed) ───────────────────────────
native_start() {
  local build=0
  [[ "${1:-}" == "--build" ]] && build=1
  need_podman
  check_assets

  if [[ $build -eq 1 ]] || ! podman image exists "$TTS_IMAGE" 2>/dev/null; then
    info "Building $TTS_IMAGE ..."
    podman build -t "$TTS_IMAGE" ./audio-model
  fi
  if [[ $build -eq 1 ]] || ! podman image exists "$FRONT_IMAGE" 2>/dev/null; then
    info "Building $FRONT_IMAGE ..."
    podman build -t "$FRONT_IMAGE" ./frontend
  fi

  # Remove stale containers/pod from a previous run (ignore errors).
  podman rm -f "${CONTAINERS[@]}" >/dev/null 2>&1 || true
  podman pod rm -f "$POD" >/dev/null 2>&1 || true

  info "Creating pod $POD (ports $FRONTEND_PORT->8080, $TTS_PORT->5000) ..."
  podman pod create --name "$POD" -p "${FRONTEND_PORT}:8080" -p "${TTS_PORT}:5000"

  info "Starting TTS ($TTS_IMAGE) ..."
  podman run -d --pod "$POD" --name mindmate-tts --restart unless-stopped "$TTS_IMAGE"

  info "Starting frontend ($FRONT_IMAGE) ..."
  local env_args=(--env PORT=8080 --env ASSETS_DIR=/assets)
  [[ -n "${GEMINI_API_KEY:-}" ]] && env_args+=(--env GEMINI_API_KEY="$GEMINI_API_KEY")
  [[ -n "${JULES_API_KEY:-}" ]] && env_args+=(--env JULES_API_KEY="$JULES_API_KEY")
  [[ -n "${JULES_SOURCE:-}" ]] && env_args+=(--env JULES_SOURCE="$JULES_SOURCE")
  [[ -n "${JULES_STARTING_BRANCH:-}" ]] && env_args+=(--env JULES_STARTING_BRANCH="$JULES_STARTING_BRANCH")
  env_args+=(--env NEXT_PUBLIC_TTS_URL="http://127.0.0.1:${TTS_PORT}")
  podman run -d --pod "$POD" --name mindmate-frontend --restart unless-stopped \
    "${env_args[@]}" \
    -v "$SCRIPT_DIR/main/models:/assets/models:ro" \
    -v "$SCRIPT_DIR/main/animations:/assets/animations:ro" \
    "$FRONT_IMAGE"

  echo ""
  info "Up. Frontend: http://127.0.0.1:${FRONTEND_PORT}  TTS health: http://127.0.0.1:${TTS_PORT}/health"
}

native_stop() {
  need_podman
  info "Stopping MindMate containers/pod (images kept) ..."
  podman rm -f "${CONTAINERS[@]}" >/dev/null 2>&1 || true
  podman pod rm -f "$POD" >/dev/null 2>&1 || true
  info "Stopped."
}

# ── Compose backend ────────────────────────────────────────────────────────
compose_start() {
  local build_flag=""
  [[ "${1:-}" == "--build" ]] && build_flag="--build"
  need_podman
  check_assets
  [[ -f compose.yaml ]] || die "compose.yaml not found"
  if [[ ! -f .env && -f .env.example ]]; then
    echo "hint: no .env found — using defaults (GEMINI fallback). Copy .env.example to .env to set GEMINI_API_KEY." >&2
  fi
  info "Starting via ${COMPOSE_CMD[*]} ..."
  # shellcheck disable=SC2086
  "${COMPOSE_CMD[@]}" up -d $build_flag
  echo ""
  info "Up. Frontend: http://127.0.0.1:${FRONTEND_PORT}  TTS health: http://127.0.0.1:${TTS_PORT}/health"
}

compose_stop() {
  need_podman
  info "Stopping via ${COMPOSE_CMD[*]} ..."
  "${COMPOSE_CMD[@]}" down
  info "Stopped (images kept)."
}

# ── Shared subcommands ─────────────────────────────────────────────────────
cmd_logs() {
  need_podman
  local follow="" svc=""
  for a in "$@"; do
    case "$a" in
      -f|--follow) follow="-f" ;;
      frontend|tts) svc="$a" ;;
      *) die "usage: $0 logs [-f] [frontend|tts]" ;;
    esac
  done
  if [[ ${#COMPOSE_CMD[@]} -gt 0 ]]; then
    # shellcheck disable=SC2086
    exec "${COMPOSE_CMD[@]}" logs $follow $svc
  else
    if [[ -n "$svc" ]]; then
      # shellcheck disable=SC2086
      exec podman logs $follow "mindmate-$svc"
    else
      # shellcheck disable=SC2086
      exec podman logs $follow mindmate-frontend mindmate-tts
    fi
  fi
}

cmd_status() {
  need_podman
  echo "--- containers (mindmate-*) ---"
  podman ps -a --filter "name=mindmate" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" || true
  echo ""
  echo "--- pods ---"
  podman pod ps || true
  echo ""
  echo "--- images ---"
  podman images mindmate-frontend mindmate-tts 2>/dev/null || podman images | head -n 10
  echo ""
  echo "--- storage ---"
  podman system df || true
}

cmd_clean() {
  need_podman
  local assume_yes=0
  [[ "${1:-}" == "--yes" || "${1:-}" == "-y" ]] && assume_yes=1
  if [[ $assume_yes -eq 0 ]]; then
    echo "This will REMOVE (app-only, nothing else is touched):"
    echo "  containers: ${CONTAINERS[*]}, pod: $POD"
    echo "  images: $FRONT_IMAGE $TTS_IMAGE (+ compose local images)"
    echo "It will NOT run 'podman system prune -a'."
    read -r -p "Remove MindMate containers/pod/images? [y/N] " ans
    [[ "$ans" == "y" || "$ans" == "Y" ]] || { echo "Aborted."; exit 0; }
  fi

  if [[ ${#COMPOSE_CMD[@]} -gt 0 ]]; then
    info "compose down (containers + anonymous volumes + local images) ..."
    "${COMPOSE_CMD[@]}" down -v --rmi local 2>/dev/null || "${COMPOSE_CMD[@]}" down -v 2>/dev/null || true
  else
    native_stop || true
  fi

  # Belt-and-braces for the native backend / leftover names.
  podman rm -f "${CONTAINERS[@]}" >/dev/null 2>&1 || true
  podman pod rm -f "$POD" >/dev/null 2>&1 || true
  podman rmi -f "$FRONT_IMAGE" "$TTS_IMAGE" >/dev/null 2>&1 || true
  # Remove dangling images left behind by rebuilds (untagged layers only;
  # tagged images belonging to other apps are never touched).
  podman image prune -f >/dev/null 2>&1 || true

  echo ""
  info "Clean done. Storage now:"
  podman system df || true
}

usage() {
  sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'
}

# ── Dispatch ───────────────────────────────────────────────────────────────
cmd="${1:-help}"
case "$cmd" in
  start)
    if [[ ${#COMPOSE_CMD[@]} -gt 0 ]]; then compose_start "${2:-}"; else native_start "${2:-}"; fi
    ;;
  stop)
    if [[ ${#COMPOSE_CMD[@]} -gt 0 ]]; then compose_stop; else native_stop; fi
    ;;
  restart)
    if [[ ${#COMPOSE_CMD[@]} -gt 0 ]]; then compose_stop || true; compose_start "${2:-}"; else native_stop || true; native_start "${2:-}"; fi
    ;;
  logs) shift; cmd_logs "$@" ;;
  status|ps) cmd_status ;;
  clean) shift; cmd_clean "$@" ;;
  help|-h|--help) usage ;;
  *) die "unknown command '$cmd'. See: $0 help" ;;
esac
