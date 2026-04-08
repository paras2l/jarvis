"""Vision input adapter for Pixi AI System."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict


@dataclass(slots=True)
class VisionInput:
    def summarize_frame(self, frame: Any) -> Dict[str, Any]:
        return {
            "frame_type": type(frame).__name__,
            "summary": "vision frame received",
            "has_data": frame is not None,
        }

