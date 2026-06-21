# Testing QuantCode

One script runs everything and logs each step: static analysis, the per-module self-checks,
`pytest`, and — with Docker — the **live Redis (RediSearch vector) path**.

## Quick start

```bash
./run_tests.sh            # full suite, including live Redis via Docker
./run_tests.sh --offline  # skip the live-Redis (Docker) phase
./run_tests.sh --rm-redis # also tear down the test Redis container at the end
```

Exit code is `0` only if every step passed.

## Prerequisites

- **Python venv** (3.11). If missing:
  ```bash
  /opt/homebrew/bin/python3.11 -m venv .venv
  .venv/bin/python -m pip install -e ".[dev]"
  ```
- **Docker** — only for the live-Redis phase. Without it (or with `--offline`) the suite runs
  everything else and skips phase 4.

## What it runs

| Phase | Steps | Needs |
|---|---|---|
| 1. Static | `ruff check`, `mypy` over `quantcode/` (+ tests) | venv |
| 2. Self-checks | `python -m quantcode.<mod>` for all 11 modules (mock LLM + in-memory backend, isolated temp workspace) | venv |
| 3. pytest | `pytest -q` (wraps the self-checks as a parametrized suite) | venv |
| 4. Live Redis | Starts `redis/redis-stack-server` (container `quantcode-redis-test`, port 6379), `FLUSHALL`, runs `quantcode demo` and **asserts `backend: redis`**, then verifies `qc:*` keys + the `qc:index:lessons` vector index (`FT._LIST`/`FT.INFO`) + a `memory search` on real Redis | Docker |

The live phase is the real proof of the headline Redis track: actual `FT.CREATE` vector index
and server-side KNN, not the in-memory fallback.

## Results & logs

- Each run writes to `test_logs/<UTC-timestamp>/`, also symlinked as `test_logs/latest/`.
- `summary.txt` — one `PASS`/`FAIL` line per step (with duration and log path).
- `<step>.log` — full stdout/stderr for that step (e.g. `live_redis_keys_index.log` has the
  `KEYS`/`FT.INFO` output).
- The console prints a live PASS/FAIL line per step and a final `ALL GREEN` / `FAILED: …`.

```bash
cat test_logs/latest/summary.txt          # quick scan
less test_logs/latest/live_redis_demo.log  # drill into one step
```

`test_logs/` is gitignored.

## The test Redis container

- Runs on **localhost:6379** (host-local, so QuantCode treats it as local — no
  `QC_ALLOW_REMOTE_REDIS` needed). `FLUSHALL` runs at the start of phase 4 for deterministic
  keys; it's a throwaway container, safe to flush.
- Left running by default so you can inspect it after:
  ```bash
  docker exec quantcode-redis-test redis-cli KEYS 'qc:*'
  docker exec quantcode-redis-test redis-cli FT.INFO qc:index:lessons
  docker stop quantcode-redis-test && docker rm quantcode-redis-test   # when done
  ```
- For a visual browse, run Redis Stack with the GUI instead (see `redis_implementation.md`,
  RedisInsight on :8001).

## Not covered (need credentials / extra deps)

The live **Claude** and **Browserbase** paths aren't exercised — they require optional deps +
secrets and would incur cost. Run them manually:

- Claude: `pip install -e ".[llm]"`, set `ANTHROPIC_API_KEY` + `QC_LLM_PROVIDER=anthropic`,
  then `quantcode research "..."`. See `leftover_tasks/03_live_llm_claude.md`.
- Browserbase: `pip install -e ".[browser]" && playwright install chromium`, set the
  Browserbase keys, then `quantcode research-url <url> --confirm`. See
  `leftover_tasks/04_live_browserbase.md`.

## Running pieces by hand

```bash
.venv/bin/ruff check quantcode/ tests/
.venv/bin/mypy quantcode/
.venv/bin/pytest -q
QC_MEMORY_BACKEND=memory .venv/bin/python -m quantcode.pipeline   # any one module's self-check
QC_MEMORY_BACKEND=memory .venv/bin/quantcode demo                 # offline end-to-end
```

## Troubleshooting

- **Phase 4 skipped / "Docker daemon not running"** → start Docker, or use `--offline`.
- **`live_redis_demo` FAIL: backend is not redis** → the demo fell back to in-memory; check
  the test container is up (`docker ps`) and `redis-cli ping` returns `PONG`.
- **`live_redis_keys_index` FAIL: vector index missing** → image isn't Redis *Stack* (no
  search module). The script uses `redis-stack-server`; don't swap in plain `redis`.
- **Slow first run** → first live run pulls the Redis image and downloads the fastembed model
  (~50MB). Subsequent runs are fast.
