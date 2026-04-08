"""Security utilities for Jarvis AI System."""

from __future__ import annotations

from pathlib import Path


def redact_secret(value: str, visible: int = 4) -> str:
    if len(value) <= visible:
        return "*" * len(value)
    return value[:visible] + "*" * (len(value) - visible)


def safe_join(base: str, *parts: str) -> str:
    return str(Path(base, *parts).resolve())
