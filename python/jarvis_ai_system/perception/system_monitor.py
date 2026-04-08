"""System monitor adapter for perception layer."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict


@dataclass(slots=True)
class SystemMonitor:
    def sample(self) -> Dict[str, Any]:
        try:
            import psutil  # type: ignore

            return {
                "cpu_percent": float(psutil.cpu_percent(interval=0.0)),
                "memory_percent": float(psutil.virtual_memory().percent),
                "disk_percent": float(psutil.disk_usage(".").percent),
            }
        except Exception:
            return {"cpu_percent": 0.0, "memory_percent": 0.0, "disk_percent": 0.0}
