"""Action core for Pixi AI System."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
import subprocess
from typing import Any, Dict, Optional
from uuid import uuid4


@dataclass(slots=True)
class ActionResult:
    action_id: str
    success: bool
    output: str
    timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


@dataclass(slots=True)
class ActionCore:
    """Executes safe actions and delegates to specialized controllers."""

    allow_execution: bool = False

    def execute_command(self, command: str) -> ActionResult:
        if not self.allow_execution:
            return ActionResult(action_id=str(uuid4()), success=True, output=f"dry_run: {command}")
        completed = subprocess.run(command, shell=True, capture_output=True, text=True)
        success = completed.returncode == 0
        output = completed.stdout.strip() or completed.stderr.strip()
        return ActionResult(action_id=str(uuid4()), success=success, output=output)

    def execute_payload(self, payload: Dict[str, Any]) -> ActionResult:
        tool = str(payload.get("tool", "command"))
        if tool == "command":
            return self.execute_command(str(payload.get("command", "")))
        return ActionResult(action_id=str(uuid4()), success=True, output=f"handled:{tool}")

