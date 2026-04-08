"""Module registry for the Jarvis System Bus."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from threading import RLock
from typing import Any, Callable, Dict, Iterable, List, Mapping, Optional

from jarvis.memory.memory_system import MemorySystem


@dataclass(slots=True)
class ModuleEndpoint:
    """Describes one module connected to the bus."""

    module_id: str
    name: str
    subsystem: str
    status: str = "offline"
    endpoint_kind: str = "handler"
    capabilities: List[str] = field(default_factory=list)
    topics: List[str] = field(default_factory=list)
    aliases: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)
    last_seen_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    handler: Callable[[Dict[str, Any]], Any] | None = None


@dataclass(slots=True)
class ModuleRegistry:
    """Tracks modules, aliases, and message endpoints for routing."""

    memory: MemorySystem | None = None
    _modules: Dict[str, ModuleEndpoint] = field(default_factory=dict)
    _aliases: Dict[str, str] = field(default_factory=dict)
    _lock: RLock = field(default_factory=RLock)

    def register_module(
        self,
        module_id: str,
        name: str,
        subsystem: str,
        *,
        status: str = "online",
        endpoint_kind: str = "handler",
        capabilities: Iterable[str] | None = None,
        topics: Iterable[str] | None = None,
        aliases: Iterable[str] | None = None,
        metadata: Optional[Dict[str, Any]] = None,
        handler: Callable[[Dict[str, Any]], Any] | None = None,
    ) -> ModuleEndpoint:
        module = ModuleEndpoint(
            module_id=module_id.strip(),
            name=name.strip() or module_id,
            subsystem=subsystem.strip() or "general",
            status=status,
            endpoint_kind=endpoint_kind,
            capabilities=self._clean_list(capabilities),
            topics=self._clean_list(topics),
            aliases=self._clean_list(aliases),
            metadata=dict(metadata or {}),
            handler=handler,
        )
        with self._lock:
            self._modules[module.module_id] = module
            for alias in [module.module_id, module.name, module.subsystem, *module.aliases, *module.topics]:
                self._aliases[alias.lower()] = module.module_id
        self._persist()
        return module

    def attach_handler(self, module_id: str, handler: Callable[[Dict[str, Any]], Any]) -> None:
        module = self._modules.get(module_id)
        if module is None:
            return
        module.handler = handler
        module.status = "online"
        module.last_seen_at = datetime.now(timezone.utc).isoformat()
        self._persist()

    def get_module(self, module_id: str) -> ModuleEndpoint | None:
        return self._modules.get(module_id)

    def resolve(self, name_or_alias: str) -> ModuleEndpoint | None:
        if not name_or_alias:
            return None
        direct = self._modules.get(name_or_alias)
        if direct is not None:
            return direct
        module_id = self._aliases.get(name_or_alias.strip().lower())
        if module_id is None:
            return None
        return self._modules.get(module_id)

    def find_by_topic(self, topic: str) -> List[ModuleEndpoint]:
        target = topic.strip().lower()
        results: List[ModuleEndpoint] = []
        for module in self._modules.values():
            if target == module.subsystem.lower():
                results.append(module)
                continue
            if any(self._matches_topic(target, alias) for alias in module.topics + module.aliases):
                results.append(module)
        return results

    def all_modules(self) -> List[ModuleEndpoint]:
        return sorted(self._modules.values(), key=lambda row: (row.subsystem, row.name))

    def modules_by_subsystem(self, subsystem: str) -> List[ModuleEndpoint]:
        target = subsystem.strip().lower()
        return [module for module in self._modules.values() if module.subsystem.lower() == target]

    def heartbeat(self, module_id: str, *, status: str | None = None, metadata: Optional[Dict[str, Any]] = None) -> None:
        module = self._modules.get(module_id)
        if module is None:
            return
        module.last_seen_at = datetime.now(timezone.utc).isoformat()
        if status is not None:
            module.status = status
        if metadata:
            module.metadata.update(metadata)
        self._persist()

    def remove(self, module_id: str) -> bool:
        with self._lock:
            removed = self._modules.pop(module_id, None)
            if removed is None:
                return False
            self._aliases = {alias: mid for alias, mid in self._aliases.items() if mid != module_id}
        self._persist()
        return True

    def describe(self) -> Dict[str, Any]:
        return {
            "module_count": len(self._modules),
            "modules": [
                {
                    "module_id": module.module_id,
                    "name": module.name,
                    "subsystem": module.subsystem,
                    "status": module.status,
                    "endpoint_kind": module.endpoint_kind,
                    "capabilities": list(module.capabilities),
                    "topics": list(module.topics),
                    "aliases": list(module.aliases),
                    "metadata": dict(module.metadata),
                    "last_seen_at": module.last_seen_at,
                    "has_handler": module.handler is not None,
                }
                for module in self.all_modules()
            ],
            "aliases": dict(self._aliases),
        }

    def route_candidates(self, topic: str, *, target: str | None = None) -> List[ModuleEndpoint]:
        if target:
            resolved = self.resolve(target)
            return [resolved] if resolved is not None else []
        return self.find_by_topic(topic)

    def _persist(self) -> None:
        if self.memory is None:
            return
        payload = {
            "type": "system_bus_module_registry",
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "snapshot": self.describe(),
        }
        self.memory.remember_short_term(
            key="system_bus:last_module_registry",
            value=payload,
            tags=["system_bus", "registry"],
        )
        self.memory.remember_long_term(
            key=f"system_bus:module_registry:{datetime.now(timezone.utc).timestamp()}",
            value=payload,
            source="jarvis.system_bus.module_registry",
            importance=0.7,
            tags=["system_bus", "registry"],
        )

    @staticmethod
    def _clean_list(values: Iterable[str] | None) -> List[str]:
        if values is None:
            return []
        out: List[str] = []
        for value in values:
            cleaned = str(value).strip()
            if cleaned:
                out.append(cleaned)
        return out

    @staticmethod
    def _matches_topic(topic: str, candidate: str) -> bool:
        candidate = candidate.strip().lower()
        if not candidate:
            return False
        if topic == candidate:
            return True
        return topic.startswith(candidate + ".") or candidate.startswith(topic + ".")
