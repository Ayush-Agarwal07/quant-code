"""JSON serialization helpers."""

from __future__ import annotations

from pathlib import Path

from pydantic import BaseModel


def model_to_json(model: BaseModel, *, indent: int = 2) -> str:
    """Serialize a Pydantic model with JSON-compatible enum values."""

    return model.model_dump_json(indent=indent)


def write_model_json(model: BaseModel, path: Path) -> None:
    """Write a model as UTF-8 JSON."""

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(model_to_json(model) + "\n", encoding="utf-8")
