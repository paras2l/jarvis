"""Dynamic plugin loader for advanced Jarvis architecture.

This loader enables runtime extension of Jarvis capabilities by discovering
Python modules that expose plugin metadata and optional registration hooks.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
import importlib
import importlib.util
from pathlib import Path
import sys
from threading import RLock
from types import ModuleType
from typing import Any, Dict, List


@dataclass(slots=True)
class PluginDescriptor:
    """Metadata for one loaded plugin."""

    plugin_id: str
    name: str
    version: str
    module_name: str
    file_path: str
    loaded_at: str
    status: str
    capabilities: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class PluginLoadResult:
    plugin_id: str
    success: bool
    message: str


class PluginLoader:
    """Loads and manages runtime plugins for tools/skills/extensions.

    Plugin module contract (recommended):
    - PLUGIN_META = {"name": ..., "version": ..., "capabilities": [...]}  # optional
    - def register(registry): ...  # optional
    - def shutdown(): ...  # optional
    """

    def __init__(self, plugin_directory: str = "python/jarvis/plugins") -> None:
        self._plugin_directory = Path(plugin_directory)
        self._plugin_directory.mkdir(parents=True, exist_ok=True)
        self._lock = RLock()
        self._plugins: Dict[str, PluginDescriptor] = {}
        self._modules: Dict[str, ModuleType] = {}

    def discover_plugin_files(self) -> List[Path]:
        """Discover plugin Python files in configured directory."""
        rows: List[Path] = []
        for path in self._plugin_directory.glob("*.py"):
            if path.name.startswith("_"):
                continue
            rows.append(path)
        rows.sort(key=lambda p: p.name)
        return rows

    def load_all(self, registry: Any | None = None) -> List[PluginLoadResult]:
        """Load every plugin file from plugin directory."""
        out: List[PluginLoadResult] = []
        for path in self.discover_plugin_files():
            out.append(self.load_from_file(path, registry=registry))
        return out

    def load_from_file(self, file_path: str | Path, registry: Any | None = None) -> PluginLoadResult:
        """Load one plugin module from file path."""
        path = Path(file_path)
        if not path.exists():
            return PluginLoadResult(plugin_id="", success=False, message=f"file_not_found:{path}")

        module_name = self._module_name_from_path(path)
        plugin_id = f"plugin:{module_name}"

        try:
            spec = importlib.util.spec_from_file_location(module_name, str(path))
            if spec is None or spec.loader is None:
                return PluginLoadResult(plugin_id=plugin_id, success=False, message="invalid_spec")

            module = importlib.util.module_from_spec(spec)
            sys.modules[module_name] = module
            spec.loader.exec_module(module)

            descriptor = self._build_descriptor(plugin_id=plugin_id, module_name=module_name, path=path, module=module)

            register_fn = getattr(module, "register", None)
            if callable(register_fn) and registry is not None:
                register_fn(registry)
                descriptor.metadata["registered_with_runtime"] = True

            with self._lock:
                self._plugins[plugin_id] = descriptor
                self._modules[plugin_id] = module

            return PluginLoadResult(plugin_id=plugin_id, success=True, message="loaded")
        except Exception as exc:  # noqa: BLE001
            return PluginLoadResult(plugin_id=plugin_id, success=False, message=f"load_error:{exc}")

    def load_module(self, module_name: str, registry: Any | None = None) -> PluginLoadResult:
        """Load plugin by Python module import path."""
        plugin_id = f"plugin:{module_name}"
        try:
            module = importlib.import_module(module_name)
            descriptor = self._build_descriptor(
                plugin_id=plugin_id,
                module_name=module_name,
                path=Path(getattr(module, "__file__", "")),
                module=module,
            )

            register_fn = getattr(module, "register", None)
            if callable(register_fn) and registry is not None:
                register_fn(registry)
                descriptor.metadata["registered_with_runtime"] = True

            with self._lock:
                self._plugins[plugin_id] = descriptor
                self._modules[plugin_id] = module
            return PluginLoadResult(plugin_id=plugin_id, success=True, message="loaded")
        except Exception as exc:  # noqa: BLE001
            return PluginLoadResult(plugin_id=plugin_id, success=False, message=f"load_error:{exc}")

    def unload(self, plugin_id: str) -> PluginLoadResult:
        """Unload plugin and call shutdown hook when available."""
        with self._lock:
            descriptor = self._plugins.get(plugin_id)
            module = self._modules.get(plugin_id)

        if descriptor is None or module is None:
            return PluginLoadResult(plugin_id=plugin_id, success=False, message="not_loaded")

        try:
            shutdown_fn = getattr(module, "shutdown", None)
            if callable(shutdown_fn):
                shutdown_fn()

            with self._lock:
                self._plugins.pop(plugin_id, None)
                self._modules.pop(plugin_id, None)

            if descriptor.module_name in sys.modules:
                del sys.modules[descriptor.module_name]

            return PluginLoadResult(plugin_id=plugin_id, success=True, message="unloaded")
        except Exception as exc:  # noqa: BLE001
            return PluginLoadResult(plugin_id=plugin_id, success=False, message=f"unload_error:{exc}")

    def reload(self, plugin_id: str, registry: Any | None = None) -> PluginLoadResult:
        """Reload plugin preserving the same plugin id."""
        with self._lock:
            descriptor = self._plugins.get(plugin_id)

        if descriptor is None:
            return PluginLoadResult(plugin_id=plugin_id, success=False, message="not_loaded")

        unload_result = self.unload(plugin_id)
        if not unload_result.success:
            return unload_result

        if descriptor.file_path:
            return self.load_from_file(descriptor.file_path, registry=registry)
        return self.load_module(descriptor.module_name, registry=registry)

    def register_runtime_plugin(
        self,
        name: str,
        version: str,
        capabilities: List[str],
        *,
        metadata: Dict[str, Any] | None = None,
    ) -> str:
        """Register metadata-only plugin descriptor for non-module integrations."""
        plugin_id = f"plugin:{name.lower().replace(' ', '_')}"
        descriptor = PluginDescriptor(
            plugin_id=plugin_id,
            name=name,
            version=version,
            module_name="",
            file_path="",
            loaded_at=datetime.now(timezone.utc).isoformat(),
            status="loaded",
            capabilities=[entry.strip().lower() for entry in capabilities if entry.strip()],
            metadata=dict(metadata or {}),
        )
        with self._lock:
            self._plugins[plugin_id] = descriptor
        return plugin_id

    def list_plugins(self) -> List[PluginDescriptor]:
        with self._lock:
            rows = list(self._plugins.values())
        rows.sort(key=lambda row: row.name)
        return rows

    def get_plugin(self, plugin_id: str) -> PluginDescriptor | None:
        with self._lock:
            return self._plugins.get(plugin_id)

    def find_by_capability(self, capability: str) -> List[PluginDescriptor]:
        wanted = capability.strip().lower()
        if not wanted:
            return []
        out: List[PluginDescriptor] = []
        with self._lock:
            for item in self._plugins.values():
                if wanted in [entry.lower() for entry in item.capabilities]:
                    out.append(item)
        out.sort(key=lambda row: row.name)
        return out

    def stats(self) -> Dict[str, Any]:
        with self._lock:
            rows = list(self._plugins.values())
        return {
            "plugin_directory": str(self._plugin_directory),
            "loaded_plugins": len(rows),
            "capability_index": self._capability_index(rows),
        }

    def _build_descriptor(
        self,
        *,
        plugin_id: str,
        module_name: str,
        path: Path,
        module: ModuleType,
    ) -> PluginDescriptor:
        meta = getattr(module, "PLUGIN_META", {})
        if not isinstance(meta, dict):
            meta = {}

        name = str(meta.get("name") or module_name)
        version = str(meta.get("version") or "0.1.0")
        capabilities = [str(item).lower() for item in meta.get("capabilities", [])]

        return PluginDescriptor(
            plugin_id=plugin_id,
            name=name,
            version=version,
            module_name=module_name,
            file_path=str(path),
            loaded_at=datetime.now(timezone.utc).isoformat(),
            status="loaded",
            capabilities=capabilities,
            metadata={
                "module_doc": str(getattr(module, "__doc__", "") or "")[:200],
            },
        )

    @staticmethod
    def _module_name_from_path(path: Path) -> str:
        stem = path.stem.replace("-", "_")
        return f"jarvis_dynamic_plugin_{stem}"

    @staticmethod
    def _capability_index(rows: List[PluginDescriptor]) -> Dict[str, int]:
        index: Dict[str, int] = {}
        for row in rows:
            for capability in row.capabilities:
                index[capability] = index.get(capability, 0) + 1
        return index


def _example_plugin_loader() -> None:
    loader = PluginLoader()

    # Metadata-only plugin registration example.
    plugin_id = loader.register_runtime_plugin(
        name="BuiltInAnalytics",
        version="1.0.0",
        capabilities=["analytics", "monitoring"],
        metadata={"origin": "runtime"},
    )

    print("Registered plugin id:", plugin_id)
    print("Plugin stats:", loader.stats())


if __name__ == "__main__":
    _example_plugin_loader()
