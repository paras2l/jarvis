"""Command interface for Jarvis AI System."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict


@dataclass(slots=True)
class CommandInterface:
    def normalize(self, command: str) -> Dict[str, Any]:
        return {"command": command.strip(), "tokens": command.split()}
