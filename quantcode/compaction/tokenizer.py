"""Reproducible token counting for the ResearchTrace Compiler (decision D7).

The Token-Company headline metric must be MEASURED, never a bare word count. We count
with a real subword tokenizer — the BAAI/bge-small tokenizer that `fastembed` already
pulls in (no new dependency; it ships the `tokenizers` lib). The tokenizer file is loaded
OFFLINE from the local HuggingFace cache so counts are deterministic and stage-safe.

If the tokenizer cannot be loaded offline (cold cache, no network on the demo box), we
fall back to a CLEARLY-LABELED heuristic estimate and set `tokens_estimated=True` so the
pitch never publishes an unlabeled number. Real tokenizer is always tried first.
"""

from __future__ import annotations

from dataclasses import dataclass

# fastembed's BAAI/bge-small-en-v1.5 source repo — the one `tokenizers` can read directly.
_TOKENIZER_REPO = "qdrant/bge-small-en-v1.5-onnx-q"
_TOKENIZER_FILE = "tokenizer.json"

# ponytail: heuristic only used when the real tokenizer is unavailable. ~4 chars/token is
# the well-worn English rule of thumb; flagged as an estimate so nobody mistakes it for the
# measured number. Never the headline metric when the real tokenizer loaded.
_CHARS_PER_TOKEN = 4


@dataclass(frozen=True)
class TokenCounter:
    """Counts tokens for a string. `estimated=False` means the real tokenizer was used."""

    estimated: bool
    _encode: object  # callable[[str], int]; kept opaque so the dataclass stays simple

    def count(self, text: str) -> int:
        return self._encode(text)  # type: ignore[operator]


def _load_real_counter() -> TokenCounter | None:
    """Try to load the BAAI/bge-small tokenizer OFFLINE from the HF cache. None on miss."""
    try:
        from huggingface_hub import hf_hub_download
        from tokenizers import Tokenizer

        # local_files_only -> never hits the network during the demo; reproducible counts.
        path = hf_hub_download(
            repo_id=_TOKENIZER_REPO, filename=_TOKENIZER_FILE, local_files_only=True
        )
        tok = Tokenizer.from_file(path)
    except Exception:  # ponytail: any failure (cold cache, missing lib) -> estimate path
        return None

    def encode(text: str) -> int:
        return len(tok.encode(text).ids)

    return TokenCounter(estimated=False, _encode=encode)


def _estimate_counter() -> TokenCounter:
    def encode(text: str) -> int:
        return max(1, len(text) // _CHARS_PER_TOKEN) if text else 0

    return TokenCounter(estimated=True, _encode=encode)


def get_token_counter() -> TokenCounter:
    """Real subword counter if it loads offline (D7), else a labeled estimate."""
    return _load_real_counter() or _estimate_counter()


def warm_tokenizer_cache() -> bool:
    """One-time, ONLINE download of the tokenizer into the HF cache so later demo runs count
    offline. Returns True if a real (non-estimated) counter is now available.

    Not called during the offline demo path — only a convenience for setup. ponytail: lets
    the demo box pre-pull the tokenizer once instead of flaking on a cold cache.
    """
    if not _load_real_counter():
        try:
            from huggingface_hub import hf_hub_download

            hf_hub_download(repo_id=_TOKENIZER_REPO, filename=_TOKENIZER_FILE)
        except Exception:
            return False
    return _load_real_counter() is not None
