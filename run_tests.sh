#!/usr/bin/env bash
# QuantCode full test suite with per-step logging.
#
#   ./run_tests.sh            # everything, incl. live Redis via Docker
#   ./run_tests.sh --offline  # skip the live-Redis (Docker) phase
#   ./run_tests.sh --rm-redis  # tear down the test Redis container at the end
#
# Logs: test_logs/<UTC timestamp>/  (symlinked as test_logs/latest). Exit code is
# nonzero if any step failed. bash 3.2-compatible (stock macOS).

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

PY=".venv/bin/python"
RUFF=".venv/bin/ruff"
MYPY=".venv/bin/mypy"
PYTEST=".venv/bin/pytest"
QUANTCODE=".venv/bin/quantcode"

REDIS_CONTAINER="quantcode-redis-test"
REDIS_PORT="6379"
REDIS_IMAGE="redis/redis-stack-server:latest"

OFFLINE=0
KEEP_REDIS=1
for arg in "$@"; do
  case "$arg" in
    --offline)  OFFLINE=1 ;;
    --rm-redis) KEEP_REDIS=0 ;;
    -h|--help)  echo "usage: ./run_tests.sh [--offline] [--rm-redis]"; exit 0 ;;
    *) echo "unknown arg: $arg (try --help)"; exit 2 ;;
  esac
done

if [ ! -x "$PY" ]; then
  echo "No .venv found. Create it first:"
  echo "  /opt/homebrew/bin/python3.11 -m venv .venv && .venv/bin/python -m pip install -e '.[dev]'"
  exit 1
fi

TS="$(date -u +%Y%m%dT%H%M%SZ)"
LOG_DIR="$ROOT/test_logs/$TS"
mkdir -p "$LOG_DIR"
ln -sfn "$TS" "$ROOT/test_logs/latest"
SUMMARY="$LOG_DIR/summary.txt"
: > "$SUMMARY"

PASS=0
FAIL=0
FAILED_STEPS=""

run_step() {  # run_step <name> <cmd...>  — logs, times, records PASS/FAIL, keeps going
  name="$1"; shift
  log="$LOG_DIR/${name}.log"
  start="$(date +%s)"
  printf '  %-32s ' "$name"
  if "$@" >"$log" 2>&1; then
    dur=$(( $(date +%s) - start ))
    printf 'PASS (%ss)\n' "$dur"
    echo "PASS  $name  ${dur}s" >> "$SUMMARY"
    PASS=$((PASS + 1))
  else
    rc=$?
    dur=$(( $(date +%s) - start ))
    printf 'FAIL (rc=%s, %ss)  -> %s\n' "$rc" "$dur" "$log"
    echo "FAIL  $name  rc=$rc  ${dur}s  log=$log" >> "$SUMMARY"
    FAIL=$((FAIL + 1))
    FAILED_STEPS="$FAILED_STEPS $name"
  fi
}

redis_cli() { docker exec "$REDIS_CONTAINER" redis-cli "$@"; }

# ---- live-Redis step bodies (assert on output, not just exit code) ----
start_redis() {
  if docker ps --format '{{.Names}}' | grep -q "^${REDIS_CONTAINER}$"; then
    echo "container already running"
  elif docker ps -a --format '{{.Names}}' | grep -q "^${REDIS_CONTAINER}$"; then
    docker start "$REDIS_CONTAINER"
  else
    docker run -d --name "$REDIS_CONTAINER" -p "${REDIS_PORT}:6379" "$REDIS_IMAGE"
  fi
  i=0
  while [ "$i" -lt 30 ]; do
    if docker exec "$REDIS_CONTAINER" redis-cli ping 2>/dev/null | grep -q PONG; then
      echo "redis ready"; return 0
    fi
    i=$((i + 1)); sleep 1
  done
  echo "redis did not become ready in 30s"; return 1
}

live_demo() {
  ws="$(mktemp -d)"
  out="$(QC_WORKSPACE="$ws" "$QUANTCODE" demo 2>&1)"; rc=$?
  echo "$out"
  [ $rc -eq 0 ] || { echo "ASSERT: demo exit $rc"; return $rc; }
  echo "$out" | grep -q "memory backend: redis" || { echo "ASSERT: backend is not redis"; return 1; }
  echo "$out" | grep -q "Proof of learning"     || { echo "ASSERT: learning loop not shown"; return 1; }
}

live_keys_and_index() {
  echo "--- KEYS qc:* ---"; redis_cli KEYS 'qc:*'
  n="$(redis_cli KEYS 'qc:*' | grep -c .)"
  echo "qc:* key count = $n"
  [ "$n" -gt 0 ] || { echo "ASSERT: no qc:* keys"; return 1; }
  echo "--- FT._LIST ---"; redis_cli FT._LIST
  redis_cli FT._LIST | grep -q "qc:index:lessons" || { echo "ASSERT: vector index missing"; return 1; }
  echo "--- FT.INFO qc:index:lessons ---"; redis_cli FT.INFO qc:index:lessons
}

live_memory_search() {
  out="$("$QUANTCODE" memory search "earnings proxy weakness" 2>&1)"; rc=$?
  echo "$out"
  [ $rc -eq 0 ] || { echo "ASSERT: memory search exit $rc"; return $rc; }
  echo "$out" | grep -q "backend: redis" || { echo "ASSERT: search not on redis"; return 1; }
}

echo "QuantCode test suite  ($TS)   logs -> test_logs/$TS"
echo

echo "[1/4] static analysis"
run_step "ruff"  "$RUFF" check quantcode/ tests/
run_step "mypy"  "$MYPY" quantcode/

echo "[2/4] offline module self-checks (mock LLM + in-memory)"
for m in config schemas llm workspace agents tools compaction browser memory pipeline cli; do
  run_step "selfcheck_$m" env QC_MEMORY_BACKEND=memory QC_WORKSPACE="$(mktemp -d)" "$PY" -m "quantcode.$m"
done

echo "[3/4] pytest"
run_step "pytest" "$PYTEST" -q

if [ "$OFFLINE" -eq 0 ]; then
  echo "[4/4] live Redis (Docker — real RediSearch vector path)"
  if docker info >/dev/null 2>&1; then
    run_step "redis_start"           start_redis
    run_step "redis_flushall"        redis_cli FLUSHALL
    run_step "live_redis_demo"       live_demo
    run_step "live_redis_keys_index" live_keys_and_index
    run_step "live_redis_search"     live_memory_search
    if [ "$KEEP_REDIS" -eq 0 ]; then
      docker stop "$REDIS_CONTAINER" >/dev/null 2>&1 && docker rm "$REDIS_CONTAINER" >/dev/null 2>&1
      echo "  (removed test Redis container)"
    else
      echo "  (test Redis left running on :$REDIS_PORT — stop with: docker stop $REDIS_CONTAINER && docker rm $REDIS_CONTAINER)"
    fi
  else
    echo "  Docker daemon not running — skipping live Redis. (use --offline to silence)"
  fi
else
  echo "[4/4] live Redis — SKIPPED (--offline)"
fi

echo
echo "==== SUMMARY ===="
cat "$SUMMARY"
echo
echo "PASS=$PASS  FAIL=$FAIL   logs: test_logs/$TS  (also test_logs/latest)"
if [ "$FAIL" -eq 0 ]; then
  echo "ALL GREEN"
else
  echo "FAILED:$FAILED_STEPS"
fi
[ "$FAIL" -eq 0 ]
