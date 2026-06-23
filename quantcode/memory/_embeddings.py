"""Lesson embeddings for Tier 3 vector search.

Default: a deterministic 384-d hash-embedding — no model download, no network, works
out of the box. It is NOT semantic (it only makes store+search return stable, ranked
results), so paraphrase matching is exact/near-exact only.

Opt-in (`pip install '.[embeddings]'`): `fastembed` BAAI/bge-small-en-v1.5 (384-d),
loaded lazily on first use, gives real semantic ranking. When installed it is used
automatically; otherwise the hash default applies.
"""

from __future__ import annotations

import hashlib
import math

DIM = 384  # BAAI/bge-small-en-v1.5 dimensionality (D3)
MODEL_NAME = "BAAI/bge-small-en-v1.5"

_real_model: object | None = None
_real_failed = False


def _try_real_model() -> object | None:
    """Load fastembed once; remember failure so we don't retry on every call."""
    global _real_model, _real_failed
    if _real_model is not None or _real_failed:
        return _real_model
    try:
        from fastembed import TextEmbedding

        _real_model = TextEmbedding(model_name=MODEL_NAME)
    except Exception:  # noqa: BLE001 — any load/network/onnx error -> hash fallback
        _real_failed = True
        _real_model = None
    return _real_model


def _hash_embedding(text: str) -> list[float]:
    """Deterministic, L2-normalized 384-d vector from a text hash. ponytail: bag-of-bytes
    sha256 stream, enough for the fallback to return stable, searchable vectors."""
    vec = [0.0] * DIM
    # ponytail: stream sha256 digests as the PRNG of vector components.
    raw = b""
    counter = 0
    while len(raw) < DIM * 2:
        raw += hashlib.sha256(f"{counter}:{text}".encode()).digest()
        counter += 1
    for i in range(DIM):
        # two bytes -> centered float in [-1, 1)
        v = (raw[2 * i] << 8 | raw[2 * i + 1]) / 32768.0 - 1.0
        vec[i] = v
    norm = math.sqrt(sum(x * x for x in vec)) or 1.0
    return [x / norm for x in vec]


def embed(text: str) -> list[float]:
    """Embed one string -> 384-d list[float]. Real model if available, else hash."""
    model = _try_real_model()
    if model is not None:
        (arr,) = model.embed([text])  # type: ignore[attr-defined]
        return [float(x) for x in arr]
    return _hash_embedding(text)


def using_real_model() -> bool:
    """True iff fastembed loaded — used by the self-check to decide whether the
    paraphrase-ranking assertion is meaningful (hash fallback is not semantic)."""
    return _try_real_model() is not None
