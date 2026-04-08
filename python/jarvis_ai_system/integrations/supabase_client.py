"""Supabase client adapter for Jarvis AI System."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass(slots=True)
class SupabaseClient:
    url: Optional[str] = None
    key: Optional[str] = None
    cache: Dict[str, List[Dict[str, Any]]] = field(default_factory=dict)

    def upsert(self, table: str, row: Dict[str, Any]) -> Dict[str, Any]:
        self.cache.setdefault(table, []).append(dict(row))
        return {"table": table, "status": "cached", "row": dict(row)}
