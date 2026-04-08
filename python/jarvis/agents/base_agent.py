"""Agent starter model.

This module gives you a place to add specialized agent behavior over time.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class Agent:
    name: str
    role: str

    def describe(self) -> str:
        return f"{self.name} ({self.role})"
