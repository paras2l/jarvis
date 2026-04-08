"""Voice input adapter for Jarvis AI System."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional


@dataclass(slots=True)
class VoiceInput:
    """Minimal voice adapter that accepts transcribed text."""

    last_transcript: str = ""

    def submit_transcript(self, transcript: str) -> str:
        self.last_transcript = transcript.strip()
        return self.last_transcript

    def read_transcript(self) -> Optional[str]:
        return self.last_transcript or None
