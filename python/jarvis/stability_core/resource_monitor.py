"""Resource monitor for system stability.

Tracks CPU, RAM, GPU, API rates, and task throughput, and emits throttling
recommendations when thresholds are exceeded.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
import subprocess
from typing import Any, Dict, Mapping, Optional


@dataclass(slots=True)
class ResourceThresholds:
    cpu_percent: float = 85.0
    ram_percent: float = 85.0
    gpu_percent: float = 90.0
    api_calls_per_minute: int = 600
    task_executions_per_minute: int = 400


@dataclass(slots=True)
class ResourceSnapshot:
    timestamp: str
    cpu_percent: float
    ram_percent: float
    gpu_percent: float
    api_calls_per_minute: int
    task_executions_per_minute: int
    is_throttling_required: bool
    reasons: list[str] = field(default_factory=list)


@dataclass(slots=True)
class ResourceMonitor:
    """Monitors host and runtime resource utilization."""

    thresholds: ResourceThresholds = field(default_factory=ResourceThresholds)
    api_call_counter: int = 0
    task_execution_counter: int = 0
    _window_start_epoch_s: float = 0.0

    def sample(self, counters: Optional[Mapping[str, int]] = None) -> ResourceSnapshot:
        """Collect a point-in-time resource snapshot."""

        counters = counters or {}
        api_calls = int(counters.get("api_calls_per_minute", self.api_call_counter))
        tasks = int(counters.get("task_executions_per_minute", self.task_execution_counter))

        cpu = self._cpu_percent()
        ram = self._ram_percent()
        gpu = self._gpu_percent()

        reasons: list[str] = []
        if cpu >= self.thresholds.cpu_percent:
            reasons.append(f"CPU high: {cpu:.1f}% >= {self.thresholds.cpu_percent:.1f}%")
        if ram >= self.thresholds.ram_percent:
            reasons.append(f"RAM high: {ram:.1f}% >= {self.thresholds.ram_percent:.1f}%")
        if gpu >= self.thresholds.gpu_percent:
            reasons.append(f"GPU high: {gpu:.1f}% >= {self.thresholds.gpu_percent:.1f}%")
        if api_calls >= self.thresholds.api_calls_per_minute:
            reasons.append(
                f"API rate high: {api_calls}/min >= {self.thresholds.api_calls_per_minute}/min"
            )
        if tasks >= self.thresholds.task_executions_per_minute:
            reasons.append(
                "Task throughput high: "
                f"{tasks}/min >= {self.thresholds.task_executions_per_minute}/min"
            )

        return ResourceSnapshot(
            timestamp=datetime.now(timezone.utc).isoformat(),
            cpu_percent=cpu,
            ram_percent=ram,
            gpu_percent=gpu,
            api_calls_per_minute=api_calls,
            task_executions_per_minute=tasks,
            is_throttling_required=bool(reasons),
            reasons=reasons,
        )

    def throttle_recommendation(self, snapshot: ResourceSnapshot) -> Dict[str, Any]:
        """Return concrete throttling guidance for callers."""

        if not snapshot.is_throttling_required:
            return {
                "apply_throttle": False,
                "suggested_delay_ms": 0,
                "api_multiplier": 1.0,
                "task_multiplier": 1.0,
                "reasons": [],
            }

        pressure = self._pressure_score(snapshot)
        delay_ms = int(100 + pressure * 900)
        multiplier = max(0.15, 1.0 - pressure)
        return {
            "apply_throttle": True,
            "suggested_delay_ms": delay_ms,
            "api_multiplier": round(multiplier, 3),
            "task_multiplier": round(multiplier, 3),
            "reasons": list(snapshot.reasons),
        }

    def register_api_call(self, count: int = 1) -> None:
        self.api_call_counter += max(0, count)

    def register_task_execution(self, count: int = 1) -> None:
        self.task_execution_counter += max(0, count)

    def reset_window_counters(self) -> None:
        self.api_call_counter = 0
        self.task_execution_counter = 0

    def diagnostics(self) -> Dict[str, Any]:
        return {
            "thresholds": {
                "cpu_percent": self.thresholds.cpu_percent,
                "ram_percent": self.thresholds.ram_percent,
                "gpu_percent": self.thresholds.gpu_percent,
                "api_calls_per_minute": self.thresholds.api_calls_per_minute,
                "task_executions_per_minute": self.thresholds.task_executions_per_minute,
            },
            "window_counters": {
                "api_call_counter": self.api_call_counter,
                "task_execution_counter": self.task_execution_counter,
            },
        }

    def _pressure_score(self, snapshot: ResourceSnapshot) -> float:
        cpu_p = max(0.0, snapshot.cpu_percent / max(1.0, self.thresholds.cpu_percent) - 1.0)
        ram_p = max(0.0, snapshot.ram_percent / max(1.0, self.thresholds.ram_percent) - 1.0)
        gpu_p = max(0.0, snapshot.gpu_percent / max(1.0, self.thresholds.gpu_percent) - 1.0)
        api_p = max(
            0.0,
            snapshot.api_calls_per_minute / max(1.0, float(self.thresholds.api_calls_per_minute)) - 1.0,
        )
        task_p = max(
            0.0,
            snapshot.task_executions_per_minute
            / max(1.0, float(self.thresholds.task_executions_per_minute))
            - 1.0,
        )
        score = min(1.0, cpu_p * 0.25 + ram_p * 0.25 + gpu_p * 0.2 + api_p * 0.15 + task_p * 0.15)
        return float(score)

    def _cpu_percent(self) -> float:
        try:
            import psutil  # type: ignore

            return float(psutil.cpu_percent(interval=0.0))
        except Exception:
            return 0.0

    def _ram_percent(self) -> float:
        try:
            import psutil  # type: ignore

            return float(psutil.virtual_memory().percent)
        except Exception:
            return 0.0

    def _gpu_percent(self) -> float:
        """Best-effort GPU utilization lookup via nvidia-smi."""

        try:
            completed = subprocess.run(
                [
                    "nvidia-smi",
                    "--query-gpu=utilization.gpu",
                    "--format=csv,noheader,nounits",
                ],
                capture_output=True,
                text=True,
                check=False,
                timeout=1,
            )
            if completed.returncode != 0:
                return 0.0
            values = [float(line.strip()) for line in completed.stdout.splitlines() if line.strip()]
            if not values:
                return 0.0
            return sum(values) / float(len(values))
        except Exception:
            return 0.0
