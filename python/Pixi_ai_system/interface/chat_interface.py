"""Chat interface utilities for Pixi AI System."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Optional


@dataclass(slots=True)
class ChatInterface:
    def format_reply(self, content: str, *, tone: str = "professional", verbosity: str = "balanced") -> Dict[str, Any]:
        return {"tone": tone, "verbosity": verbosity, "content": content.strip()}

