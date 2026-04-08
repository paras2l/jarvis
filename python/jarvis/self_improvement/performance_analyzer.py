"""Performance analyzer for Jarvis self-improvement."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
import re
from statistics import mean
from typing import Any, Dict, Iterable, List

from jarvis.memory.memory_system import MemorySystem


@dataclass(slots=True)
class TaskPerformanceRecord:
    task_id: str
    goal_id: str
    success: bool
    attempts: int
    message: str
    timestamp: str
    source: str = "runtime"


@dataclass(slots=True)
class ErrorFrequencyRecord:
    component: str
    operation: str
    error_type: str
    count: int


@dataclass(slots=True)
class PerformanceReport:
    window_minutes: int
    generated_at: str
    total_tasks: int
    successful_tasks: int
    failed_tasks: int
    success_rate: float
    average_attempts: float
    estimated_execution_time_seconds: float
    error_frequency_per_hour: float
    top_errors: List[ErrorFrequencyRecord] = field(default_factory=list)
    slow_signals: List[str] = field(default_factory=list)
    weak_skill_hints: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)


class PerformanceAnalyzer:
    _ERROR_PATTERN = re.compile(
        r"\[(?P<timestamp>[^\]]+)\]\s+"
        r"(?P<component>[a-zA-Z0-9_\-.]+)\."
        r"(?P<operation>[a-zA-Z0-9_\-.]+)\s+failed:\s+"
        r"(?P<message>.+?)\s+\|"
    )

    def __init__(
        self,
        memory: MemorySystem,
        runtime_error_log_path: str = "python/.jarvis_runtime/runtime_errors.log",
        runtime_action_log_path: str = "python/.jarvis_runtime/action_log.jsonl",
    ) -> None:
        self._memory = memory
        self._error_log = Path(runtime_error_log_path)

    def analyze(self, window_minutes: int = 120) -> PerformanceReport:
        window_minutes = max(5, int(window_minutes))
        now = datetime.now(timezone.utc)
        window_start = now - timedelta(minutes=window_minutes)

        task_rows = self._collect_task_rows(window_start)
        error_rows = self._collect_error_rows(window_start)

        total_tasks = len(task_rows)
        successful_tasks = sum(1 for row in task_rows if row.success)
        failed_tasks = max(0, total_tasks - successful_tasks)
        success_rate = self._safe_ratio(successful_tasks, total_tasks)
        average_attempts = float(mean([max(1, row.attempts) for row in task_rows] or [1]))

        est_seconds = self._estimate_execution_seconds(task_rows)
        err_per_hour = self._compute_error_frequency(error_rows, window_minutes)
        top_errors = sorted(error_rows, key=lambda item: item.count, reverse=True)[:8]
        slow_signals = self._slow_signals(est_seconds)
        weak_hints = self._weak_skill_hints(task_rows)

        report = PerformanceReport(
            window_minutes=window_minutes,
            generated_at=now.isoformat(),
            total_tasks=total_tasks,
            successful_tasks=successful_tasks,
            failed_tasks=failed_tasks,
            success_rate=round(success_rate, 4),
            average_attempts=round(average_attempts, 4),
            estimated_execution_time_seconds=round(est_seconds, 4),
            error_frequency_per_hour=round(err_per_hour, 4),
            top_errors=top_errors,
            slow_signals=slow_signals,
            weak_skill_hints=weak_hints,
            metadata={
                "error_log_exists": self._error_log.exists(),
            },
        )
        self._persist_report(report)
        return report

    def _collect_task_rows(self, window_start: datetime) -> List[TaskPerformanceRecord]:
        rows: List[TaskPerformanceRecord] = []

        for item in self._memory.short_term.dump():
            key = str(item.get("key", ""))
            if not (key.startswith("brain:task_result:") or key.startswith("task_result:")):
                continue
            ts = self._parse_iso(str(item.get("created_at", "")))
            if ts is None or ts < window_start:
                continue
            value = item.get("value", {})
            rows.append(
                TaskPerformanceRecord(
                    task_id=key.split(":")[-1],
                    goal_id=str(value.get("goal_id", "unknown")),
                    success=bool(value.get("success", False)),
                    attempts=int(value.get("attempts", 1) or 1),
                    message=str(value.get("summary", value.get("message", ""))),
                    timestamp=str(item.get("created_at", "")),
                    source="short_term",
                )
            )

        for record in self._memory.long_term.search_text("task_result", limit=300):
            ts = self._parse_iso(record.updated_at)
            if ts is None or ts < window_start:
                continue
            payload = record.value
            rows.append(
                TaskPerformanceRecord(
                    task_id=str(payload.get("task_id", record.key)),
                    goal_id=str(payload.get("goal_id", "unknown")),
                    success=bool(payload.get("success", False)),
                    attempts=int(payload.get("attempts", 1) or 1),
                    message=str(payload.get("message", payload.get("summary", ""))),
                    timestamp=record.updated_at,
                    source="long_term",
                )
            )

        dedup: Dict[str, TaskPerformanceRecord] = {}
        for row in sorted(rows, key=lambda item: item.timestamp):
            dedup[row.task_id] = row
        return list(dedup.values())

    def _collect_error_rows(self, window_start: datetime) -> List[ErrorFrequencyRecord]:
        if not self._error_log.exists():
            return []
        grouped: Dict[str, ErrorFrequencyRecord] = {}
        for line in self._tail_lines(self._error_log, 3000):
            match = self._ERROR_PATTERN.search(line)
            if not match:
                continue
            ts = self._parse_iso(match.group("timestamp"))
            if ts is None or ts < window_start:
                continue
            component = match.group("component")
            operation = match.group("operation")
            error_type = self._infer_error_type(match.group("message"))
            key = f"{component}|{operation}|{error_type}"
            if key not in grouped:
                grouped[key] = ErrorFrequencyRecord(component, operation, error_type, 0)
            grouped[key].count += 1
        return list(grouped.values())

    @staticmethod
    def _estimate_execution_seconds(task_rows: List[TaskPerformanceRecord]) -> float:
        if not task_rows:
            return 0.0
        return float(mean(max(8.0, row.attempts * 12.0) for row in task_rows))

    @staticmethod
    def _compute_error_frequency(error_rows: List[ErrorFrequencyRecord], window_minutes: int) -> float:
        total_errors = sum(row.count for row in error_rows)
        return total_errors / max(1.0 / 60.0, window_minutes / 60.0)

    @staticmethod
    def _slow_signals(est_seconds: float) -> List[str]:
        signals: List[str] = []
        if est_seconds >= 45.0:
            signals.append("high_avg_execution_time")
        return signals

    @staticmethod
    def _weak_skill_hints(task_rows: Iterable[TaskPerformanceRecord]) -> List[str]:
        failed = " ".join(row.message.lower() for row in task_rows if not row.success)
        hints: List[str] = []
        if "approval" in failed or "human" in failed:
            hints.append("autonomous_decisioning")
        if "timeout" in failed:
            hints.append("latency_sensitive_execution")
        if "unknown skill" in failed:
            hints.append("skill_coverage")
        return hints

    def _persist_report(self, report: PerformanceReport) -> None:
        payload = {
            "type": "performance_report",
            "generated_at": report.generated_at,
            "window_minutes": report.window_minutes,
            "total_tasks": report.total_tasks,
            "successful_tasks": report.successful_tasks,
            "failed_tasks": report.failed_tasks,
            "success_rate": report.success_rate,
            "average_attempts": report.average_attempts,
            "estimated_execution_time_seconds": report.estimated_execution_time_seconds,
            "error_frequency_per_hour": report.error_frequency_per_hour,
            "slow_signals": report.slow_signals,
            "weak_skill_hints": report.weak_skill_hints,
            "top_errors": [
                {
                    "component": row.component,
                    "operation": row.operation,
                    "error_type": row.error_type,
                    "count": row.count,
                }
                for row in report.top_errors
            ],
            "metadata": report.metadata,
        }
        self._memory.remember_long_term(
            key=f"self_improvement:performance:{report.generated_at}",
            value=payload,
            source="self_improvement.performance_analyzer",
            importance=0.78,
            tags=["self_improvement", "performance_report"],
        )
        self._memory.remember_short_term(
            key="self_improvement:last_performance",
            value=payload,
            tags=["self_improvement", "performance_report"],
        )

    @staticmethod
    def _parse_iso(value: str) -> datetime | None:
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00")) if value else None
        except Exception:
            return None

    @staticmethod
    def _infer_error_type(message: str) -> str:
        lowered = message.lower()
        if "timeout" in lowered:
            return "TimeoutError"
        if "permission" in lowered:
            return "PermissionError"
        if "connection" in lowered or "network" in lowered:
            return "ConnectionError"
        if "valueerror" in lowered:
            return "ValueError"
        return "RuntimeError"

    @staticmethod
    def _safe_ratio(numerator: int, denominator: int) -> float:
        return 0.0 if denominator <= 0 else float(numerator) / float(denominator)

    @staticmethod
    def _tail_lines(path: Path, max_lines: int) -> List[str]:
        lines = path.read_text(encoding="utf-8", errors="ignore").splitlines()
        return lines[-max_lines:] if max_lines > 0 else lines
