"""Trading API adapter for Pixi AI System."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict


@dataclass(slots=True)
class TradingAPI:
    def quote(self, symbol: str) -> Dict[str, Any]:
        return {"symbol": symbol, "price": None, "status": "unavailable"}

