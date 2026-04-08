"""Registry for generated Jarvis tools."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from threading import RLock
from typing import Any, Callable, Dict, Iterable, List, Mapping, Optional

from jarvis.memory.memory_system import MemorySystem
from jarvis.skills.skill_registry import SkillRegistry


@dataclass(slots=True)
class RegisteredTool:
    """Metadata record for one learned tool."""

    tool_name: str
    category: str
    description: str
    source_path: str
    capabilities: List[str] = field(default_factory=list)
    status: str = "draft"
    version: str = "0.1.0"
    generated_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    activated_at: str = ""
    validated_at: str = ""
    last_used_at: str = ""
    usage_count: int = 0
    success_count: int = 0
    failure_count: int = 0
    optimizer_notes: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)

    def success_rate(self) -> float:
        total = self.success_count + self.failure_count
        if total == 0:
            return 1.0
        return round(self.success_count / float(total), 4)


class ToolRegistry:
    """Tracks learned tools and keeps the runtime registry synchronized."""

    def __init__(self, memory: MemorySystem | None = None, skill_registry: SkillRegistry | None = None, catalog_path: str = "python/.jarvis_runtime/tool_registry.json") -> None:
        self._memory = memory
        self._skill_registry = skill_registry
        self._catalog_path = Path(catalog_path)
        self._catalog_path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = RLock()
        self._tools: Dict[str, RegisteredTool] = {}
        self._handlers: Dict[str, Callable[[Dict[str, Any]], Dict[str, Any]]] = {}

    def register_tool(
        self,
        tool_name: str,
        description: str,
        source_path: str,
        handler: Callable[[Dict[str, Any]], Dict[str, Any]] | None,
        *,
        category: str,
        capabilities: Iterable[str] | None = None,
        version: str = "0.1.0",
        metadata: Optional[Dict[str, Any]] = None,
        activate: bool = True,
    ) -> RegisteredTool:
        normalized_name = tool_name.strip()
        if not normalized_name:
            raise ValueError("tool_name cannot be empty")

        record = RegisteredTool(
            tool_name=normalized_name,
            category=category.strip() or "general",
            description=description.strip() or "Generated tool",
            source_path=source_path,
            capabilities=[str(item) for item in (capabilities or [])],
            status="validated" if activate else "draft",
            version=version,
            validated_at=datetime.now(timezone.utc).isoformat(),
            activated_at=datetime.now(timezone.utc).isoformat() if activate else "",
            metadata=dict(metadata or {}),
        )

        with self._lock:
            self._tools[normalized_name] = record
            if handler is not None:
                self._handlers[normalized_name] = handler

        if activate and self._skill_registry is not None and handler is not None:
            self._skill_registry.register_skill(
                name=normalized_name,
                description=record.description,
                input_schema={"type": "object", "properties": {}},
                execution_fn=handler,
                tags=["tool_learning", record.category],
                version=record.version,
            )

        self._persist_snapshot()
        return record

    def register_placeholder(
        self,
        tool_name: str,
        description: str,
        source_path: str,
        *,
        category: str,
        capabilities: Iterable[str] | None = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> RegisteredTool:
        def _placeholder(payload: Dict[str, Any]) -> Dict[str, Any]:
            return {
                "status": "placeholder",
                "tool": tool_name,
                "summary": f"Placeholder tool {tool_name} received payload.",
                "details": {"payload_keys": sorted(list(payload.keys()))},
                "confidence": 0.35,
            }

        return self.register_tool(
            tool_name=tool_name,
            description=description,
            source_path=source_path,
            handler=_placeholder,
            category=category,
            capabilities=capabilities,
            metadata=metadata,
            activate=True,
        )

    def get_tool(self, tool_name: str) -> RegisteredTool | None:
        return self._tools.get(tool_name)

    def has_tool(self, tool_name: str) -> bool:
        return tool_name in self._tools

    def get_handler(self, tool_name: str) -> Callable[[Dict[str, Any]], Dict[str, Any]] | None:
        return self._handlers.get(tool_name)

    def execute(self, tool_name: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        handler = self._handlers.get(tool_name)
        if handler is None:
            raise KeyError(f"Tool '{tool_name}' is not registered")
        outcome = handler(payload)
        self.record_usage(tool_name, success=True)
        return outcome

    def record_usage(self, tool_name: str, *, success: bool, metadata: Optional[Dict[str, Any]] = None) -> None:
        record = self._tools.get(tool_name)
        if record is None:
            return

        record.usage_count += 1
        record.last_used_at = datetime.now(timezone.utc).isoformat()
        if success:
            record.success_count += 1
        else:
            record.failure_count += 1
        if metadata:
            record.metadata.update(metadata)
        self._persist_snapshot()

    def mark_validated(self, tool_name: str, validator_notes: List[str] | None = None) -> None:
        record = self._tools.get(tool_name)
        if record is None:
            return
        record.validated_at = datetime.now(timezone.utc).isoformat()
        record.status = "validated"
        if validator_notes:
            record.optimizer_notes.extend(validator_notes)
        self._persist_snapshot()

    def activate(self, tool_name: str) -> None:
        record = self._tools.get(tool_name)
        if record is None:
            return
        record.status = "active"
        record.activated_at = datetime.now(timezone.utc).isoformat()
        self._persist_snapshot()

    def deactivate(self, tool_name: str, reason: str | None = None) -> None:
        record = self._tools.get(tool_name)
        if record is None:
            return
        record.status = "deprecated"
        if reason:
            record.optimizer_notes.append(reason)
        self._persist_snapshot()

    def find_by_capability(self, capability: str) -> List[RegisteredTool]:
        target = capability.strip().lower()
        return [row for row in self._tools.values() if target in {item.lower() for item in row.capabilities}]

    def list_tools(self, *, include_inactive: bool = True) -> List[Dict[str, Any]]:
        with self._lock:
            records = sorted(self._tools.values(), key=lambda row: (row.status, row.tool_name))
        rows = []
        for record in records:
            if not include_inactive and record.status != "active":
                continue
            rows.append(
                {
                    "tool_name": record.tool_name,
                    "category": record.category,
                    "description": record.description,
                    "source_path": record.source_path,
                    "capabilities": list(record.capabilities),
                    "status": record.status,
                    "version": record.version,
                    "usage_count": record.usage_count,
                    "success_rate": record.success_rate(),
                    "optimizer_notes": list(record.optimizer_notes),
                    "metadata": dict(record.metadata),
                }
            )
        return rows

    def attach_handler(self, tool_name: str, handler: Callable[[Dict[str, Any]], Dict[str, Any]]) -> None:
        self._handlers[tool_name] = handler

    def sync_skill_registry(self) -> int:
        if self._skill_registry is None:
            return 0

        count = 0
        for record in self._tools.values():
            handler = self._handlers.get(record.tool_name)
            if handler is None:
                continue
            if self._skill_registry.get_skill(record.tool_name) is not None:
                continue
            self._skill_registry.register_skill(
                name=record.tool_name,
                description=record.description,
                input_schema={"type": "object", "properties": {}},
                execution_fn=handler,
                tags=["tool_learning", record.category],
                version=record.version,
            )
            count += 1
        return count

    def snapshot(self) -> Dict[str, Any]:
        return {
            "catalog_path": str(self._catalog_path),
            "total_tools": len(self._tools),
            "active_tools": sum(1 for row in self._tools.values() if row.status == "active"),
            "tools": self.list_tools(),
        }

    def _persist_snapshot(self) -> None:
        payload = {
            "type": "tool_registry_snapshot",
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "snapshot": self.snapshot(),
        }
        if self._memory is not None:
            self._memory.remember_short_term(
                key="tool_learning:last_registry_snapshot",
                value=payload,
                tags=["tool_learning", "registry"],
            )
            self._memory.remember_long_term(
                key=f"tool_learning:registry:{payload['generated_at']}",
                value=payload,
                source="jarvis.tool_learning.tool_registry",
                importance=0.72,
                tags=["tool_learning", "registry"],
            )
