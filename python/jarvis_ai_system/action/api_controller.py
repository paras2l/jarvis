"""API controller for Jarvis AI System."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict
from urllib.request import Request, urlopen


@dataclass(slots=True)
class ApiController:
    allow_network: bool = False

    def request(self, method: str, url: str, body: bytes | None = None) -> Dict[str, Any]:
        if not self.allow_network:
            return {"method": method, "url": url, "status": "dry_run"}
        req = Request(url, data=body, method=method.upper())
        with urlopen(req, timeout=10) as response:
            return {"method": method, "url": url, "status": response.status}
