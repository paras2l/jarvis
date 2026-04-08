"""OpenAI API adapter for Jarvis AI System."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Optional


@dataclass(slots=True)
class OpenAIAPI:
    api_key: Optional[str] = None
    base_url: str = "https://api.openai.com/v1"

    def chat_payload(self, messages: list[dict[str, Any]]) -> Dict[str, Any]:
        return {"base_url": self.base_url, "has_key": bool(self.api_key), "messages": messages}
