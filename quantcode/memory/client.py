"""MemoryClient — the shared client + key-builder for all three memory tiers.

One handle, one namespaced key schema, shared down to the tiers (the tiers never
reinvent storage). Three interchangeable backends behind one interface:

- **sqlite** (default): a local SQLite file. Persistent across runs, zero servers.
- **memory**: an in-process dict store with brute-force cosine search, for `demo`
  and the self-check (no file, no server).
- **redis**: real `redis-py` + RediSearch vector index, opt-in for power users.

Backend selection (env `QC_MEMORY_BACKEND`): `memory` → in-process; `redis` → Redis
(falls back to sqlite if it can't connect); unset/`sqlite` → local SQLite file.
"""

from __future__ import annotations

import json
import math
import os
from pathlib import Path
from typing import Any, Protocol, runtime_checkable

from quantcode.config import config
from quantcode.memory._embeddings import DIM


def cosine(a: list[float], b: list[float]) -> float:
    """Cosine similarity in [-1, 1]; 0.0 on a zero vector."""
    dot = sum(x * y for x, y in zip(a, b, strict=False))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(x * x for x in b))
    return dot / (na * nb) if na and nb else 0.0


@runtime_checkable
class _Backend(Protocol):
    """Minimal storage surface the tiers use. Both backends implement it; tiers never
    touch a redis client directly."""

    backend_name: str

    # generic JSON-string KV
    def get(self, key: str) -> str | None: ...
    def set_json(self, key: str, value: str) -> None: ...
    def keys(self, pattern: str) -> list[str]: ...

    # tier 1 trace (append list + TTL on first write)
    def rpush_ttl(self, key: str, value: str, ttl: int) -> None: ...
    def lrange(self, key: str) -> list[str]: ...

    # tier 3 lessons (vector record + KNN)
    def index_lesson(self, key: str, payload: str, embedding: list[float]) -> None: ...
    def knn(self, query_vec: list[float], k: int) -> list[tuple[str, float]]: ...


# --------------------------------------------------------------------------- #
# In-memory fallback backend
# --------------------------------------------------------------------------- #
class InMemoryBackend:
    """dict store + brute-force cosine. Demo-safe, no server."""

    backend_name = "memory"

    def __init__(self) -> None:
        self._kv: dict[str, str] = {}
        self._lists: dict[str, list[str]] = {}
        self._vectors: dict[str, list[float]] = {}  # lesson key -> embedding

    def get(self, key: str) -> str | None:
        return self._kv.get(key)

    def set_json(self, key: str, value: str) -> None:
        self._kv[key] = value

    def keys(self, pattern: str) -> list[str]:
        # ponytail: only the trailing "*" glob is ever used here.
        prefix = pattern.rstrip("*")
        return [k for k in self._kv if k.startswith(prefix)]

    def rpush_ttl(self, key: str, value: str, ttl: int) -> None:
        # ponytail: TTL is a no-op in-memory (process-scoped; demo never waits an hour).
        self._lists.setdefault(key, []).append(value)

    def lrange(self, key: str) -> list[str]:
        return list(self._lists.get(key, []))

    def index_lesson(self, key: str, payload: str, embedding: list[float]) -> None:
        self._kv[key] = payload
        self._vectors[key] = embedding

    def knn(self, query_vec: list[float], k: int) -> list[tuple[str, float]]:
        scored = [(key, cosine(query_vec, vec)) for key, vec in self._vectors.items()]
        scored.sort(key=lambda kv: kv[1], reverse=True)
        return scored[:k]


# --------------------------------------------------------------------------- #
# Local SQLite backend (default — persistent, no server)
# --------------------------------------------------------------------------- #
class SQLiteBackend:
    """A single local SQLite file. Same surface as InMemoryBackend, but durable across
    runs. KNN is brute-force cosine in Python (fine for the hundreds of lessons a local
    research workbench accumulates; swap in sqlite-vss only if that ever stops being true).
    """

    backend_name = "sqlite"

    def __init__(self, path: str) -> None:
        import sqlite3

        Path(path).expanduser().parent.mkdir(parents=True, exist_ok=True)
        self._db = sqlite3.connect(path, check_same_thread=False)
        self._db.executescript(
            "CREATE TABLE IF NOT EXISTS kv(key TEXT PRIMARY KEY, value TEXT);"
            "CREATE TABLE IF NOT EXISTS lists(key TEXT, seq INTEGER, value TEXT);"
            "CREATE TABLE IF NOT EXISTS vectors(key TEXT PRIMARY KEY, embedding TEXT);"
        )
        self._db.commit()

    def get(self, key: str) -> str | None:
        row = self._db.execute("SELECT value FROM kv WHERE key=?", (key,)).fetchone()
        return row[0] if row else None

    def set_json(self, key: str, value: str) -> None:
        self._db.execute(
            "INSERT INTO kv(key, value) VALUES(?, ?) "
            "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            (key, value),
        )
        self._db.commit()

    def keys(self, pattern: str) -> list[str]:
        prefix = pattern.rstrip("*")
        rows = self._db.execute("SELECT key FROM kv WHERE key LIKE ?", (prefix + "%",)).fetchall()
        return [r[0] for r in rows]

    def rpush_ttl(self, key: str, value: str, ttl: int) -> None:
        # ponytail: TTL ignored — working-trace rows are per-run and tiny. Add a sweep
        # (DELETE WHERE written_at < ?) only if a long-lived db actually grows unbounded.
        (next_seq,) = self._db.execute(
            "SELECT COALESCE(MAX(seq), -1) + 1 FROM lists WHERE key=?", (key,)
        ).fetchone()
        self._db.execute("INSERT INTO lists(key, seq, value) VALUES(?, ?, ?)", (key, next_seq, value))
        self._db.commit()

    def lrange(self, key: str) -> list[str]:
        rows = self._db.execute(
            "SELECT value FROM lists WHERE key=? ORDER BY seq", (key,)
        ).fetchall()
        return [r[0] for r in rows]

    def index_lesson(self, key: str, payload: str, embedding: list[float]) -> None:
        self.set_json(key, payload)
        self._db.execute(
            "INSERT INTO vectors(key, embedding) VALUES(?, ?) "
            "ON CONFLICT(key) DO UPDATE SET embedding=excluded.embedding",
            (key, json.dumps(embedding)),
        )
        self._db.commit()

    def knn(self, query_vec: list[float], k: int) -> list[tuple[str, float]]:
        rows = self._db.execute("SELECT key, embedding FROM vectors").fetchall()
        scored = [(key, cosine(query_vec, json.loads(emb))) for key, emb in rows]
        scored.sort(key=lambda kv: kv[1], reverse=True)
        return scored[:k]


# --------------------------------------------------------------------------- #
# Real Redis backend (redis-py + RediSearch)
# --------------------------------------------------------------------------- #
class RedisBackend:
    """redis-py + RediSearch vector index. Embeddings are stored as float32 bytes in a
    hash field; KNN runs server-side via FT.SEARCH."""

    backend_name = "redis"

    def __init__(self, client: Any, index_name: str, lesson_prefix: str) -> None:
        self._r = client
        self._index = index_name
        self._lesson_prefix = lesson_prefix
        self._ensure_index()

    def _ensure_index(self) -> None:
        from redis.commands.search.field import TextField, VectorField
        from redis.commands.search.index_definition import IndexDefinition, IndexType

        try:
            self._r.ft(self._index).info()
            return  # already exists
        except Exception:  # noqa: BLE001 — "Unknown index name" -> create it
            pass
        schema = (
            TextField("payload"),
            VectorField(
                "embedding",
                "HNSW",
                {"TYPE": "FLOAT32", "DIM": DIM, "DISTANCE_METRIC": "COSINE"},
            ),
        )
        definition = IndexDefinition(prefix=[self._lesson_prefix], index_type=IndexType.HASH)
        self._r.ft(self._index).create_index(schema, definition=definition)

    @staticmethod
    def _to_bytes(vec: list[float]) -> bytes:
        import struct

        return struct.pack(f"{len(vec)}f", *vec)

    def get(self, key: str) -> str | None:
        # Tier 1/2 store the JSON in a hash field "payload" for uniformity with lessons.
        val = self._r.hget(key, "payload")
        if val is None:
            val = self._r.get(key)
        return val.decode() if isinstance(val, bytes) else val

    def set_json(self, key: str, value: str) -> None:
        self._r.hset(key, mapping={"payload": value})

    def keys(self, pattern: str) -> list[str]:
        return [k.decode() if isinstance(k, bytes) else k for k in self._r.keys(pattern)]

    def rpush_ttl(self, key: str, value: str, ttl: int) -> None:
        first = not self._r.exists(key)
        self._r.rpush(key, value)
        if first:
            self._r.expire(key, ttl)

    def lrange(self, key: str) -> list[str]:
        return [v.decode() if isinstance(v, bytes) else v for v in self._r.lrange(key, 0, -1)]

    def index_lesson(self, key: str, payload: str, embedding: list[float]) -> None:
        self._r.hset(key, mapping={"payload": payload, "embedding": self._to_bytes(embedding)})

    def knn(self, query_vec: list[float], k: int) -> list[tuple[str, float]]:
        from redis.commands.search.query import Query

        q = (
            Query(f"*=>[KNN {k} @embedding $vec AS score]")
            .sort_by("score")
            .return_fields("score")
            .dialect(2)
        )
        res = self._r.ft(self._index).search(q, query_params={"vec": self._to_bytes(query_vec)})
        out: list[tuple[str, float]] = []
        for doc in res.docs:
            # Redis returns COSINE *distance* (1 - similarity); convert to similarity.
            out.append((doc.id, 1.0 - float(doc.score)))
        return out


# --------------------------------------------------------------------------- #
# Facade: key-builder + backend selection
# --------------------------------------------------------------------------- #
class MemoryClient:
    """Shared client wrapper. Owns the namespaced key schema and the chosen backend."""

    def __init__(self, backend: _Backend, namespace: str) -> None:
        self.backend = backend
        self.ns = namespace

    @property
    def backend_name(self) -> str:
        return self.backend.backend_name

    # --- namespaced key builders (qc:...) -----------------------------------
    def trace_key(self, run_id: str) -> str:
        return f"{self.ns}:run:{run_id}:trace"

    def episode_key(self, run_id: str) -> str:
        return f"{self.ns}:episode:{run_id}"

    def episode_pattern(self) -> str:
        return f"{self.ns}:episode:*"

    def lesson_key(self, lesson_id: str) -> str:
        return f"{self.ns}:lesson:{lesson_id}"

    def lesson_prefix(self) -> str:
        return f"{self.ns}:lesson:"

    def context_pack_key(self, pack_id: str) -> str:
        return f"{self.ns}:context_pack:{pack_id}"

    def lessons_index(self) -> str:
        return f"{self.ns}:index:lessons"

    # --- construction --------------------------------------------------------
    @classmethod
    def connect(cls) -> MemoryClient:
        """Pick a backend from QC_MEMORY_BACKEND. Default: local SQLite file."""
        ns = config.namespace
        choice = os.getenv("QC_MEMORY_BACKEND", "").strip().lower()

        if choice == "memory":
            return cls(InMemoryBackend(), ns)

        if choice == "redis":
            try:
                import redis

                client = redis.Redis.from_url(config.redis_url)
                client.ping()
                backend: _Backend = RedisBackend(client, f"{ns}:index:lessons", f"{ns}:lesson:")
                return cls(backend, ns)
            except Exception as exc:  # noqa: BLE001 — no server / no RediSearch -> sqlite
                print(f"[memory] Redis unavailable ({exc}); using local SQLite instead.")

        # default: persistent local SQLite (no server, no API keys).
        try:
            return cls(SQLiteBackend(config.db_path), ns)
        except Exception as exc:  # noqa: BLE001 — unwritable path etc. -> in-process
            print(f"[memory] SQLite unavailable ({exc}); using in-memory store.")
            return cls(InMemoryBackend(), ns)
