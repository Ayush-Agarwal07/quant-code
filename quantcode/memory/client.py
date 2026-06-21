"""RedisMemory — the shared client + key-builder for all three memory tiers (D2).

One connection from `config.redis_url`, one namespaced key schema, shared down to the
tiers (the tiers never reinvent storage). Two backends behind one interface:

- **redis**: real `redis-py` + RediSearch vector index (the headline sponsor path).
- **memory**: an in-process dict store with brute-force cosine search, so `demo` and
  the self-check run with NO server.

Backend selection: env `QC_MEMORY_BACKEND=memory` forces the fallback; otherwise we try
real Redis and fall back if it can't connect.

🧑‍⚖️ HITL (D2): connecting to a non-local `redis_url` (e.g. Redis Cloud) is gated — we
refuse unless `QC_ALLOW_REMOTE_REDIS=1` and fall back to in-memory with a clear message.
We never flush or bulk-delete keys.
"""

from __future__ import annotations

import math
import os
from typing import Any, Protocol, runtime_checkable
from urllib.parse import urlparse

from quantcode.config import config
from quantcode.memory._embeddings import DIM

_LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1", "", None}


def _is_local(redis_url: str) -> bool:
    host = urlparse(redis_url).hostname
    return host in _LOCAL_HOSTS


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
class RedisMemory:
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
    def connect(cls) -> RedisMemory:
        """Select a backend per D2. Forced/failed/gated -> in-memory fallback."""
        ns = config.redis_namespace
        forced = os.getenv("QC_MEMORY_BACKEND", "").strip().lower()
        if forced == "memory":
            return cls(InMemoryBackend(), ns)

        # 🧑‍⚖️ HITL: refuse remote Redis unless explicitly allowed.
        if not _is_local(config.redis_url) and os.getenv("QC_ALLOW_REMOTE_REDIS") != "1":
            print(
                "[memory] refusing remote Redis "
                f"({urlparse(config.redis_url).hostname!r}) without QC_ALLOW_REMOTE_REDIS=1 "
                "(HITL gate, D2) — using in-memory fallback."
            )
            return cls(InMemoryBackend(), ns)

        try:
            import redis

            client = redis.Redis.from_url(config.redis_url)
            client.ping()
            backend: _Backend = RedisBackend(client, f"{ns}:index:lessons", f"{ns}:lesson:")
            return cls(backend, ns)
        except Exception as exc:  # noqa: BLE001 — no server / no RediSearch -> fallback
            print(f"[memory] Redis unavailable ({exc}); using in-memory fallback.")
            return cls(InMemoryBackend(), ns)
