"""Environment scanner for Pixi Context Engine.

Collects active applications, system time, and system metrics with safe
cross-platform fallbacks.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
import os
import platform
import shutil
import subprocess
import time
from typing import Dict, List, Sequence


@dataclass(slots=True)
class SystemMetrics:
    """Normalized system health metrics."""

    cpu_percent: float
    memory_percent: float
    load_1m: float | None
    process_count: int
    collected_at_epoch_ms: int


@dataclass(slots=True)
class EnvironmentSnapshot:
    """Single pass environment scan result."""

    active_applications: List[str]
    primary_application: str
    system_time_iso: str
    local_timezone: str
    weekday: str
    time_of_day: str
    metrics: SystemMetrics
    scan_warnings: List[str] = field(default_factory=list)


class EnvironmentScanner:
    """Collects environment context on demand."""

    def __init__(self, max_active_apps: int = 10) -> None:
        self._max_active_apps = max(1, max_active_apps)

    def scan(self) -> EnvironmentSnapshot:
        """Run a full scan and return normalized environment context."""
        warnings: List[str] = []

        now = datetime.now().astimezone()
        system_time_iso = now.isoformat()
        local_timezone = str(now.tzinfo or "local")
        weekday = now.strftime("%A")
        time_of_day = self._derive_time_of_day(now.hour)

        active_apps = self._safe_get_active_applications(warnings)
        primary_app = active_apps[0] if active_apps else "unknown"

        metrics = self._safe_get_system_metrics(warnings)

        return EnvironmentSnapshot(
            active_applications=active_apps,
            primary_application=primary_app,
            system_time_iso=system_time_iso,
            local_timezone=local_timezone,
            weekday=weekday,
            time_of_day=time_of_day,
            metrics=metrics,
            scan_warnings=warnings,
        )

    def _safe_get_active_applications(self, warnings: List[str]) -> List[str]:
        try:
            apps = self.get_active_applications()
            if not apps:
                warnings.append("no_active_applications_detected")
            return apps[: self._max_active_apps]
        except Exception as exc:  # noqa: BLE001
            warnings.append(f"active_application_scan_failed:{type(exc).__name__}")
            return []

    def _safe_get_system_metrics(self, warnings: List[str]) -> SystemMetrics:
        try:
            return self.get_system_metrics()
        except Exception as exc:  # noqa: BLE001
            warnings.append(f"system_metrics_scan_failed:{type(exc).__name__}")
            return SystemMetrics(
                cpu_percent=-1.0,
                memory_percent=-1.0,
                load_1m=None,
                process_count=-1,
                collected_at_epoch_ms=int(time.time() * 1000),
            )

    def get_active_applications(self) -> List[str]:
        """Best-effort list of active/running applications."""
        system = platform.system().lower()

        if system == "windows":
            return self._list_windows_processes()
        if system in {"linux", "darwin"}:
            return self._list_unix_processes()
        return []

    def get_system_metrics(self) -> SystemMetrics:
        """Collect CPU/memory/load/process metrics."""
        try:
            import psutil  # type: ignore

            return SystemMetrics(
                cpu_percent=float(psutil.cpu_percent(interval=0.2)),
                memory_percent=float(psutil.virtual_memory().percent),
                load_1m=self._safe_get_load_avg(),
                process_count=len(psutil.pids()),
                collected_at_epoch_ms=int(time.time() * 1000),
            )
        except Exception:
            pass

        cpu_percent = self._fallback_cpu_percent()
        memory_percent = self._fallback_memory_percent()
        load_1m = self._safe_get_load_avg()
        process_count = self._fallback_process_count()

        return SystemMetrics(
            cpu_percent=cpu_percent,
            memory_percent=memory_percent,
            load_1m=load_1m,
            process_count=process_count,
            collected_at_epoch_ms=int(time.time() * 1000),
        )

    def _list_windows_processes(self) -> List[str]:
        if shutil.which("tasklist") is None:
            return []

        proc = subprocess.run(
            ["tasklist", "/fo", "csv", "/nh"],
            capture_output=True,
            text=True,
            check=False,
            encoding="utf-8",
            errors="replace",
        )
        if proc.returncode != 0:
            return []

        names: List[str] = []
        for raw in proc.stdout.splitlines():
            line = raw.strip()
            if not line:
                continue
            if line.startswith('"') and '","' in line:
                first = line.split('","', 1)[0].strip('"').strip()
            else:
                first = line.split(",", 1)[0].strip().strip('"')
            if first:
                names.append(first)

        return self._dedupe_preserve_order(names)

    def _list_unix_processes(self) -> List[str]:
        if shutil.which("ps") is None:
            return []

        proc = subprocess.run(
            ["ps", "-eo", "comm="],
            capture_output=True,
            text=True,
            check=False,
            encoding="utf-8",
            errors="replace",
        )
        if proc.returncode != 0:
            return []

        names = [line.strip() for line in proc.stdout.splitlines() if line.strip()]
        return self._dedupe_preserve_order(names)

    def _fallback_cpu_percent(self) -> float:
        """Return CPU percentage estimate or -1.0 when unavailable."""
        if hasattr(os, "getloadavg"):
            try:
                one_minute = os.getloadavg()[0]
                cpu_count = max(1, os.cpu_count() or 1)
                return max(0.0, min(100.0, (one_minute / cpu_count) * 100.0))
            except Exception:
                return -1.0
        return -1.0

    def _fallback_memory_percent(self) -> float:
        """Memory metric fallback."""
        return -1.0

    def _fallback_process_count(self) -> int:
        system = platform.system().lower()
        try:
            if system == "windows" and shutil.which("tasklist"):
                proc = subprocess.run(
                    ["tasklist", "/fo", "csv", "/nh"],
                    capture_output=True,
                    text=True,
                    check=False,
                    encoding="utf-8",
                    errors="replace",
                )
                if proc.returncode == 0:
                    return len([line for line in proc.stdout.splitlines() if line.strip()])

            if system in {"linux", "darwin"} and shutil.which("ps"):
                proc = subprocess.run(
                    ["ps", "-e"],
                    capture_output=True,
                    text=True,
                    check=False,
                    encoding="utf-8",
                    errors="replace",
                )
                if proc.returncode == 0:
                    line_count = len([line for line in proc.stdout.splitlines() if line.strip()])
                    return max(0, line_count - 1)
        except Exception:
            return -1

        return -1

    def _safe_get_load_avg(self) -> float | None:
        if not hasattr(os, "getloadavg"):
            return None
        try:
            return float(os.getloadavg()[0])
        except Exception:
            return None

    @staticmethod
    def _derive_time_of_day(hour: int) -> str:
        if hour < 12:
            return "morning"
        if hour < 17:
            return "afternoon"
        if hour < 21:
            return "evening"
        return "night"

    @staticmethod
    def _dedupe_preserve_order(values: Sequence[str]) -> List[str]:
        seen: Dict[str, bool] = {}
        output: List[str] = []
        for value in values:
            key = value.lower()
            if key in seen:
                continue
            seen[key] = True
            output.append(value)
        return output

