"""System monitor for advanced Jarvis architecture.

Tracks runtime state, performance metrics, and operational logs.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
import json
from pathlib import Path
from threading import RLock
from typing import Any, Callable, Dict, List


@dataclass(slots=True)
class MonitorEvent:
    timestamp: str
    level: str
    name: str
    payload: Dict[str, Any]


@dataclass(slots=True)
class MetricPoint:
    timestamp: str
    name: str
    value: float
    labels: Dict[str, str] = field(default_factory=dict)


class SystemMonitor:
    """Collects and persists runtime events and metrics."""

    def __init__(self, log_path: str = "python/.jarvis_runtime/system_monitor.log") -> None:
        self._log_path = Path(log_path)
        self._log_path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = RLock()
        self._events: List[MonitorEvent] = []
        self._metrics: List[MetricPoint] = []
        self._probes: Dict[str, Callable[[], float]] = {}
        self._event_limit = 4000
        self._metric_limit = 8000

    def record_event(self, name: str, payload: Dict[str, Any], level: str = "INFO") -> None:
        event = MonitorEvent(
            timestamp=datetime.now(timezone.utc).isoformat(),
            level=level,
            name=name,
            payload=dict(payload),
        )

        with self._lock:
            self._events.append(event)
            while len(self._events) > self._event_limit:
                self._events.pop(0)
        self._append_log_line({"kind": "event", "data": event.__dict__})

    def record_metric(self, name: str, value: float, labels: Dict[str, str] | None = None) -> None:
        point = MetricPoint(
            timestamp=datetime.now(timezone.utc).isoformat(),
            name=name,
            value=float(value),
            labels=dict(labels or {}),
        )

        with self._lock:
            self._metrics.append(point)
            while len(self._metrics) > self._metric_limit:
                self._metrics.pop(0)
        self._append_log_line({"kind": "metric", "data": point.__dict__})

    def register_probe(self, name: str, probe: Callable[[], float]) -> None:
        with self._lock:
            self._probes[name] = probe

    def unregister_probe(self, name: str) -> bool:
        with self._lock:
            if name not in self._probes:
                return False
            del self._probes[name]
            return True

    def poll_probes(self) -> Dict[str, float]:
        values: Dict[str, float] = {}
        probes = self._copy_probes()
        for name, probe in probes.items():
            try:
                value = float(probe())
                values[name] = value
                self.record_metric(name=name, value=value, labels={"source": "probe"})
            except Exception as exc:  # noqa: BLE001
                self.record_event(
                    name="probe_error",
                    payload={"probe": name, "error": str(exc)},
                    level="WARN",
                )
        return values

    def recent_events(self, limit: int = 100, level: str | None = None) -> List[MonitorEvent]:
        if limit <= 0:
            return []
        with self._lock:
            rows = list(self._events)
        if level:
            rows = [item for item in rows if item.level == level]
        return list(reversed(rows[-limit:]))

    def recent_metrics(self, limit: int = 200, name: str | None = None) -> List[MetricPoint]:
        if limit <= 0:
            return []
        with self._lock:
            rows = list(self._metrics)
        if name:
            rows = [item for item in rows if item.name == name]
        return list(reversed(rows[-limit:]))

    def metric_summary(self, name: str, window: int = 100) -> Dict[str, float]:
        rows = self.recent_metrics(limit=max(1, window), name=name)
        if not rows:
            return {"count": 0.0, "min": 0.0, "max": 0.0, "avg": 0.0}

        values = [item.value for item in rows]
        return {
            "count": float(len(values)),
            "min": min(values),
            "max": max(values),
            "avg": sum(values) / len(values),
        }

    def event_rate_per_minute(self, window: int = 200) -> float:
        rows = self.recent_events(limit=max(2, window))
        if len(rows) < 2:
            return 0.0
        newest = datetime.fromisoformat(rows[0].timestamp)
        oldest = datetime.fromisoformat(rows[-1].timestamp)
        minutes = max(1e-6, (newest - oldest).total_seconds() / 60.0)
        return round(len(rows) / minutes, 3)

    def metric_rate_per_minute(self, window: int = 400) -> float:
        rows = self.recent_metrics(limit=max(2, window))
        if len(rows) < 2:
            return 0.0
        newest = datetime.fromisoformat(rows[0].timestamp)
        oldest = datetime.fromisoformat(rows[-1].timestamp)
        minutes = max(1e-6, (newest - oldest).total_seconds() / 60.0)
        return round(len(rows) / minutes, 3)

    def top_event_names(self, limit: int = 10) -> List[Dict[str, Any]]:
        counts: Dict[str, int] = {}
        with self._lock:
            for item in self._events:
                counts[item.name] = counts.get(item.name, 0) + 1
        ranked = sorted(counts.items(), key=lambda row: row[1], reverse=True)
        return [{"name": name, "count": count} for name, count in ranked[: max(1, limit)]]

    def top_metric_names(self, limit: int = 10) -> List[Dict[str, Any]]:
        counts: Dict[str, int] = {}
        with self._lock:
            for item in self._metrics:
                counts[item.name] = counts.get(item.name, 0) + 1
        ranked = sorted(counts.items(), key=lambda row: row[1], reverse=True)
        return [{"name": name, "count": count} for name, count in ranked[: max(1, limit)]]

    def purge_before(self, timestamp_iso: str) -> Dict[str, int]:
        """Remove events and metrics older than a given timestamp."""
        cutoff = datetime.fromisoformat(timestamp_iso)
        removed_events = 0
        removed_metrics = 0

        with self._lock:
            kept_events: List[MonitorEvent] = []
            for item in self._events:
                ts = datetime.fromisoformat(item.timestamp)
                if ts < cutoff:
                    removed_events += 1
                else:
                    kept_events.append(item)
            self._events = kept_events

            kept_metrics: List[MetricPoint] = []
            for item in self._metrics:
                ts = datetime.fromisoformat(item.timestamp)
                if ts < cutoff:
                    removed_metrics += 1
                else:
                    kept_metrics.append(item)
            self._metrics = kept_metrics

        return {"events_removed": removed_events, "metrics_removed": removed_metrics}

    def ingest_external_snapshot(self, snapshot: Dict[str, Any], source: str = "external") -> None:
        """Accept telemetry from other services/workers."""
        payload = {"source": source, "snapshot": snapshot}
        self.record_event(name="external_snapshot_ingested", payload=payload, level="INFO")

    def compact(self) -> Dict[str, int]:
        """Best-effort compaction removing duplicate adjacent entries."""
        removed_events = 0
        removed_metrics = 0
        with self._lock:
            compact_events: List[MonitorEvent] = []
            for item in self._events:
                if compact_events and compact_events[-1].name == item.name and compact_events[-1].payload == item.payload:
                    removed_events += 1
                    continue
                compact_events.append(item)
            self._events = compact_events

            compact_metrics: List[MetricPoint] = []
            for item in self._metrics:
                if compact_metrics and compact_metrics[-1].name == item.name and compact_metrics[-1].value == item.value:
                    removed_metrics += 1
                    continue
                compact_metrics.append(item)
            self._metrics = compact_metrics
        return {"events_removed": removed_events, "metrics_removed": removed_metrics}

    def health_report(self) -> Dict[str, Any]:
        error_events = self.recent_events(limit=200, level="ERROR")
        warn_events = self.recent_events(limit=200, level="WARN")
        return {
            "events_total": len(self._events),
            "metrics_total": len(self._metrics),
            "errors_recent": len(error_events),
            "warnings_recent": len(warn_events),
            "event_rate_per_minute": self.event_rate_per_minute(window=300),
            "metric_rate_per_minute": self.metric_rate_per_minute(window=600),
            "probe_count": len(self._probes),
            "status": "healthy" if len(error_events) == 0 else "degraded",
        }

    def export_state(self) -> Dict[str, Any]:
        with self._lock:
            events = [item.__dict__ for item in self._events]
            metrics = [item.__dict__ for item in self._metrics]
        return {
            "events": events,
            "metrics": metrics,
            "health": self.health_report(),
        }

    def _copy_probes(self) -> Dict[str, Callable[[], float]]:
        with self._lock:
            return dict(self._probes)

    def _append_log_line(self, row: Dict[str, Any]) -> None:
        with self._log_path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(row, ensure_ascii=True) + "\n")


def _example_system_monitor() -> None:
    monitor = SystemMonitor()
    monitor.record_event("runtime_started", {"version": "advanced-core"})
    monitor.record_metric("queue_size", 12.0, labels={"queue": "primary"})

    monitor.register_probe("demo_probe", lambda: 42.0)
    monitor.poll_probes()

    print("Health:", monitor.health_report())
    print("Metric summary queue_size:", monitor.metric_summary("queue_size"))


if __name__ == "__main__":
    _example_system_monitor()
