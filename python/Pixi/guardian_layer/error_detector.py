"""Error detector for Pixi Guardian Layer.

Detects runtime exceptions, API failures, timeouts, and malformed outputs from
subsystems. The detector keeps a bounded timeline and persists high-signal
records to memory for diagnostics and recovery planning.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from threading import RLock
from typing import Any, Dict, List
import uuid

from Pixi.memory.memory_system import MemorySystem


@dataclass(slots=True)
class ErrorSignal:
    signal_id: str
    timestamp: str
    source_module: str
    category: str
    severity: str
    summary: str
    details: Dict[str, Any] = field(default_factory=dict)
    tags: List[str] = field(default_factory=list)


@dataclass(slots=True)
class ErrorBurst:
    burst_id: str
    started_at: str
    ended_at: str
    source_module: str
    error_count: int
    dominant_category: str
    severity: str


class ErrorDetector:
    """Classifies and tracks runtime failure signals."""

    def __init__(
        self,
        memory: MemorySystem,
        *,
        max_signals: int = 1500,
        burst_window_seconds: int = 120,
        burst_threshold: int = 5,
    ) -> None:
        self._memory = memory
        self._lock = RLock()
        self._max_signals = max(200, max_signals)
        self._burst_window = max(15, burst_window_seconds)
        self._burst_threshold = max(2, burst_threshold)

        self._signals: List[ErrorSignal] = []
        self._bursts: List[ErrorBurst] = []

    def record_exception(
        self,
        *,
        source_module: str,
        operation: str,
        error: Exception,
        context: Dict[str, Any] | None = None,
    ) -> ErrorSignal:
        return self._record_signal(
            source_module=source_module,
            category="exception",
            severity=self._severity_for_exception(error),
            summary=f"{type(error).__name__} in {operation}: {error}",
            details={
                "operation": operation,
                "error_type": type(error).__name__,
                "message": str(error),
                "context": dict(context or {}),
            },
            tags=["guardian", "exception"],
        )

    def record_api_failure(
        self,
        *,
        source_module: str,
        endpoint: str,
        status_code: int | None,
        message: str,
        retriable: bool = True,
    ) -> ErrorSignal:
        severity = "critical" if status_code in {401, 403, 500, 503} else "warning"
        return self._record_signal(
            source_module=source_module,
            category="api_failure",
            severity=severity,
            summary=f"API failure at {endpoint}: {message}",
            details={
                "endpoint": endpoint,
                "status_code": status_code,
                "retriable": retriable,
            },
            tags=["guardian", "api"],
        )

    def record_timeout(
        self,
        *,
        source_module: str,
        operation: str,
        timeout_seconds: float,
        elapsed_seconds: float,
    ) -> ErrorSignal:
        severity = "critical" if elapsed_seconds > (timeout_seconds * 2.0) else "error"
        return self._record_signal(
            source_module=source_module,
            category="timeout",
            severity=severity,
            summary=f"Timeout in {operation}: elapsed={elapsed_seconds:.2f}s",
            details={
                "operation": operation,
                "timeout_seconds": timeout_seconds,
                "elapsed_seconds": elapsed_seconds,
            },
            tags=["guardian", "timeout"],
        )

    def record_invalid_output(
        self,
        *,
        source_module: str,
        contract_name: str,
        reason: str,
        payload: Dict[str, Any] | None = None,
    ) -> ErrorSignal:
        return self._record_signal(
            source_module=source_module,
            category="invalid_output",
            severity="error",
            summary=f"Invalid output for {contract_name}: {reason}",
            details={
                "contract_name": contract_name,
                "reason": reason,
                "payload": dict(payload or {}),
            },
            tags=["guardian", "validation"],
        )

    def detect_error_bursts(self) -> List[ErrorBurst]:
        with self._lock:
            now = datetime.now(timezone.utc)
            window_start = now - timedelta(seconds=self._burst_window)
            recent = [
                signal for signal in self._signals if self._to_dt(signal.timestamp) >= window_start
            ]

            by_module: Dict[str, List[ErrorSignal]] = {}
            for signal in recent:
                by_module.setdefault(signal.source_module, []).append(signal)

            bursts: List[ErrorBurst] = []
            for source_module, items in by_module.items():
                if len(items) < self._burst_threshold:
                    continue

                category_counts: Dict[str, int] = {}
                for item in items:
                    category_counts[item.category] = category_counts.get(item.category, 0) + 1
                dominant = max(category_counts.items(), key=lambda it: it[1])[0]

                severity = "error"
                if any(item.severity == "critical" for item in items):
                    severity = "critical"
                elif any(item.severity == "error" for item in items):
                    severity = "error"
                else:
                    severity = "warning"

                burst = ErrorBurst(
                    burst_id=f"burst-{uuid.uuid4().hex[:10]}",
                    started_at=min(i.timestamp for i in items),
                    ended_at=max(i.timestamp for i in items),
                    source_module=source_module,
                    error_count=len(items),
                    dominant_category=dominant,
                    severity=severity,
                )
                bursts.append(burst)
                self._bursts.append(burst)
                self._persist_burst(burst)

            if len(self._bursts) > 400:
                self._bursts = self._bursts[-400:]

            return bursts

    def recent_signals(self, limit: int = 30) -> List[ErrorSignal]:
        with self._lock:
            return list(self._signals[-max(1, limit):])

    def summarize(self) -> Dict[str, Any]:
        with self._lock:
            counts: Dict[str, int] = {}
            by_module: Dict[str, int] = {}
            for signal in self._signals[-500:]:
                counts[signal.category] = counts.get(signal.category, 0) + 1
                by_module[signal.source_module] = by_module.get(signal.source_module, 0) + 1

            critical_recent = sum(1 for signal in self._signals[-100:] if signal.severity == "critical")
            return {
                "signals_total": len(self._signals),
                "bursts_total": len(self._bursts),
                "critical_recent": critical_recent,
                "categories": counts,
                "top_modules": sorted(by_module.items(), key=lambda x: x[1], reverse=True)[:8],
            }

    def _record_signal(
        self,
        *,
        source_module: str,
        category: str,
        severity: str,
        summary: str,
        details: Dict[str, Any],
        tags: List[str],
    ) -> ErrorSignal:
        signal = ErrorSignal(
            signal_id=f"err-{uuid.uuid4().hex[:12]}",
            timestamp=datetime.now(timezone.utc).isoformat(),
            source_module=source_module,
            category=category,
            severity=severity,
            summary=summary,
            details=details,
            tags=tags,
        )

        with self._lock:
            self._signals.append(signal)
            if len(self._signals) > self._max_signals:
                self._signals = self._signals[-self._max_signals:]

        self._persist_signal(signal)
        return signal

    @staticmethod
    def _severity_for_exception(error: Exception) -> str:
        if isinstance(error, (MemoryError, RecursionError)):
            return "critical"
        if isinstance(error, (TimeoutError, RuntimeError)):
            return "error"
        return "warning"

    @staticmethod
    def _to_dt(ts: str) -> datetime:
        return datetime.fromisoformat(ts.replace("Z", "+00:00"))

    def _persist_signal(self, signal: ErrorSignal) -> None:
        self._memory.remember_short_term(
            key=f"guardian:error:last:{signal.source_module}",
            value={
                "signal_id": signal.signal_id,
                "category": signal.category,
                "severity": signal.severity,
                "summary": signal.summary,
            },
            tags=["guardian", "error"],
        )
        self._memory.remember_long_term(
            key=f"guardian:error:{signal.signal_id}",
            value={
                "timestamp": signal.timestamp,
                "source_module": signal.source_module,
                "category": signal.category,
                "severity": signal.severity,
                "summary": signal.summary,
                "details": signal.details,
            },
            source="guardian.error_detector",
            importance=0.8 if signal.severity in {"error", "critical"} else 0.6,
            tags=["guardian", "error", signal.category],
        )
        self._memory.remember_semantic(
            doc_id=f"guardian-error-{signal.signal_id}",
            text=f"{signal.source_module} {signal.category} {signal.severity} {signal.summary}",
            metadata={"source_module": signal.source_module, "severity": signal.severity},
        )

    def _persist_burst(self, burst: ErrorBurst) -> None:
        self._memory.remember_long_term(
            key=f"guardian:error_burst:{burst.burst_id}",
            value={
                "burst_id": burst.burst_id,
                "source_module": burst.source_module,
                "error_count": burst.error_count,
                "dominant_category": burst.dominant_category,
                "severity": burst.severity,
                "started_at": burst.started_at,
                "ended_at": burst.ended_at,
            },
            source="guardian.error_detector",
            importance=0.85,
            tags=["guardian", "burst"],
        )

