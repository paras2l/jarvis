"""Data parsing utilities for Jarvis AI System."""

from __future__ import annotations

import json
from typing import Any, Dict


def parse_json(text: str) -> Dict[str, Any]:
    return json.loads(text)
