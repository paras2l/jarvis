"""Voice interface utilities for Pixi AI System."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict


@dataclass(slots=True)
class VoiceInterface:
    def build_prompt(self, transcript: str) -> Dict[str, str]:
        return {"transcript": transcript.strip(), "mode": "voice"}

