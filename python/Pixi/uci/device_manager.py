"""Device registry and capability tracking for Pixi UCI."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Literal

from Pixi.memory.memory_system import MemorySystem

DeviceKind = Literal["desktop", "mobile", "web", "api"]
DeviceStatus = Literal["online", "offline", "sleep", "busy"]


@dataclass(slots=True)
class DeviceProfile:
    device_id: str
    name: str
    device_kind: DeviceKind
    status: DeviceStatus = "offline"
    capabilities: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)
    last_seen_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class DeviceManager:
    """Registry for devices Pixi can target via the Unified Command Interface."""

    def __init__(self, memory: MemorySystem | None = None) -> None:
        self._memory = memory
        self._devices: Dict[str, DeviceProfile] = {}
        self._seed_defaults()

    def register_device(
        self,
        device_id: str,
        name: str,
        device_kind: DeviceKind,
        *,
        status: DeviceStatus = "online",
        capabilities: List[str] | None = None,
        metadata: Dict[str, Any] | None = None,
    ) -> DeviceProfile:
        profile = DeviceProfile(
            device_id=device_id,
            name=name,
            device_kind=device_kind,
            status=status,
            capabilities=sorted({item.lower().strip() for item in (capabilities or []) if item.strip()}),
            metadata=dict(metadata or {}),
        )
        self._devices[device_id] = profile
        self._persist()
        return profile

    def unregister_device(self, device_id: str) -> bool:
        if device_id not in self._devices:
            return False
        del self._devices[device_id]
        self._persist()
        return True

    def list_devices(self, *, include_offline: bool = True) -> List[DeviceProfile]:
        rows = list(self._devices.values())
        if not include_offline:
            rows = [row for row in rows if row.status == "online"]
        return sorted(rows, key=lambda row: (row.device_kind, row.name.lower()))

    def get_device(self, device_id: str) -> DeviceProfile | None:
        return self._devices.get(device_id)

    def resolve_device(self, target: str | None, *, preferred_kind: DeviceKind | None = None) -> DeviceProfile | None:
        if target:
            direct = self._devices.get(target)
            if direct is not None:
                return direct
            normalized = target.lower().strip()
            for row in self._devices.values():
                haystack = f"{row.device_id} {row.name} {' '.join(row.capabilities)}".lower()
                if normalized in haystack:
                    return row
        if preferred_kind is not None:
            for row in self.list_devices():
                if row.device_kind == preferred_kind and row.status == "online":
                    return row
        return self.get_default_device(preferred_kind)

    def get_default_device(self, kind: DeviceKind | None = None) -> DeviceProfile | None:
        for row in self.list_devices():
            if row.status != "online":
                continue
            if kind is None or row.device_kind == kind:
                return row
        return next(iter(self._devices.values()), None)

    def get_best_device(self, kind: DeviceKind | str | None = None) -> DeviceProfile | None:
        if kind in {"desktop", "mobile", "web", "api"}:
            return self.get_default_device(kind=kind)
        return self.get_default_device()

    def available_kinds(self) -> List[DeviceKind]:
        kinds = sorted({row.device_kind for row in self._devices.values()})
        return kinds  # type: ignore[return-value]

    def supports(self, device_id: str, capability: str) -> bool:
        device = self._devices.get(device_id)
        if device is None:
            return False
        return capability.lower().strip() in {item.lower() for item in device.capabilities}

    def capabilities_for_kind(self, kind: DeviceKind) -> List[str]:
        caps: set[str] = set()
        for row in self._devices.values():
            if row.device_kind == kind:
                caps.update(row.capabilities)
        return sorted(caps)

    def mark_seen(self, device_id: str, *, status: DeviceStatus | None = None) -> None:
        device = self._devices.get(device_id)
        if device is None:
            return
        device.last_seen_at = datetime.now(timezone.utc).isoformat()
        if status is not None:
            device.status = status
        self._persist()

    def describe(self) -> Dict[str, Any]:
        return {
            "count": len(self._devices),
            "devices": [
                {
                    "device_id": row.device_id,
                    "name": row.name,
                    "kind": row.device_kind,
                    "status": row.status,
                    "capabilities": row.capabilities,
                    "last_seen_at": row.last_seen_at,
                }
                for row in self.list_devices()
            ],
        }

    def _seed_defaults(self) -> None:
        self.register_device(
            "desktop-local",
            "Desktop Local",
            "desktop",
            status="online",
            capabilities=["browser", "file_system", "keyboard", "mouse", "automation"],
            metadata={"default": True},
        )
        self.register_device(
            "mobile-local",
            "Mobile Local",
            "mobile",
            status="online",
            capabilities=["touch", "notifications", "messaging"],
        )
        self.register_device(
            "web-session",
            "Web Session",
            "web",
            status="online",
            capabilities=["browser", "tabs", "forms", "api"],
        )
        self.register_device(
            "api-gateway",
            "API Gateway",
            "api",
            status="online",
            capabilities=["rest", "graphql", "webhook", "automation"],
        )

    def _persist(self) -> None:
        if self._memory is None:
            return
        payload = self.describe()
        self._memory.remember_short_term(
            key="uci:devices",
            value=payload,
            tags=["uci", "devices"],
        )
        self._memory.remember_long_term(
            key=f"uci:devices:{datetime.now(timezone.utc).timestamp()}",
            value=payload,
            source="uci.device_manager",
            importance=0.75,
            tags=["uci", "devices"],
        )


def _example_device_manager() -> None:
    manager = DeviceManager()
    for row in manager.list_devices():
        print(row)


if __name__ == "__main__":
    _example_device_manager()
