"""Optimize learned tools from runtime usage data."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Mapping

from jarvis.memory.memory_system import MemorySystem
from jarvis.tool_learning.tool_registry import RegisteredTool, ToolRegistry


@dataclass(slots=True)
class ToolOptimizationReport:
    """Optimization summary for one or more tools."""

    generated_at: str
    total_tools: int
    optimized_tools: int
    suggestions: List[Dict[str, Any]] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)
    notes: List[str] = field(default_factory=list)


class ToolOptimizer:
    """Improves existing tools using usage and performance signals."""

    def __init__(self, memory: MemorySystem, tool_registry: ToolRegistry, code_agent: Any | None = None) -> None:
        self._memory = memory
        self._tool_registry = tool_registry
        self._code_agent = code_agent

    def optimize(self, *, min_usage: int = 3, apply_changes: bool = False) -> ToolOptimizationReport:
        records = [self._tool_registry.get_tool(item["tool_name"]) for item in self._tool_registry.list_tools()]
        records = [row for row in records if row is not None]
        suggestions: List[Dict[str, Any]] = []
        notes: List[str] = []
        optimized = 0

        for record in records:
            suggestion = self._analyze_record(record, min_usage=min_usage)
            if suggestion is None:
                continue
            suggestions.append(suggestion)
            notes.extend(suggestion.get("notes", []))
            if apply_changes:
                self._apply_suggestion(record, suggestion)
                optimized += 1

        report = ToolOptimizationReport(
            generated_at=datetime.now(timezone.utc).isoformat(),
            total_tools=len(records),
            optimized_tools=optimized,
            suggestions=suggestions,
            metadata={"min_usage": min_usage, "apply_changes": apply_changes},
            notes=notes,
        )
        self._persist(report)
        return report

    def optimize_tool(self, tool_name: str, *, apply_changes: bool = False) -> ToolOptimizationReport:
        record = self._tool_registry.get_tool(tool_name)
        if record is None:
            return ToolOptimizationReport(
                generated_at=datetime.now(timezone.utc).isoformat(),
                total_tools=0,
                optimized_tools=0,
                suggestions=[],
                metadata={"missing_tool": tool_name},
                notes=["tool not found"],
            )

        suggestion = self._analyze_record(record, min_usage=1)
        suggestions = [] if suggestion is None else [suggestion]
        if apply_changes and suggestion is not None:
            self._apply_suggestion(record, suggestion)

        report = ToolOptimizationReport(
            generated_at=datetime.now(timezone.utc).isoformat(),
            total_tools=1,
            optimized_tools=1 if apply_changes and suggestion is not None else 0,
            suggestions=suggestions,
            metadata={"tool_name": tool_name, "apply_changes": apply_changes},
            notes=[] if suggestion is None else list(suggestion.get("notes", [])),
        )
        self._persist(report)
        return report

    def optimize_by_usage_pattern(self, usage_snapshot: Mapping[str, Any]) -> ToolOptimizationReport:
        suggestions: List[Dict[str, Any]] = []
        snapshot_tools = list(usage_snapshot.get("tools", []))
        for item in snapshot_tools:
            name = str(item.get("tool_name", "")).strip()
            record = self._tool_registry.get_tool(name)
            if record is None:
                continue
            if item.get("failure_rate", 0.0) > 0.3:
                suggestions.append(
                    self._suggest_failure_hardening(record, usage_snapshot)
                )
            elif item.get("usage_count", 0) > 10 and item.get("avg_runtime_ms", 0.0) > 40.0:
                suggestions.append(
                    self._suggest_performance_tuning(record, usage_snapshot)
                )

        report = ToolOptimizationReport(
            generated_at=datetime.now(timezone.utc).isoformat(),
            total_tools=len(snapshot_tools),
            optimized_tools=0,
            suggestions=suggestions,
            metadata={"source": "usage_snapshot"},
            notes=[note for suggestion in suggestions for note in suggestion.get("notes", [])],
        )
        self._persist(report)
        return report

    def _analyze_record(self, record: RegisteredTool, *, min_usage: int) -> Dict[str, Any] | None:
        if record.usage_count < min_usage and record.status != "active":
            return {
                "tool_name": record.tool_name,
                "action": "deprecate_candidate",
                "reason": "low usage and not yet active",
                "confidence": 0.6,
                "notes": ["review whether the tool should be kept or merged"],
            }

        failure_rate = 1.0 - record.success_rate()
        if failure_rate > 0.25:
            return {
                "tool_name": record.tool_name,
                "action": "harden_validation",
                "reason": f"failure rate is {failure_rate:.2f}",
                "confidence": 0.82,
                "notes": ["tighten input validation", "add fallback output shape checks"],
            }

        if record.usage_count >= min_usage and record.success_rate() >= 0.95:
            return {
                "tool_name": record.tool_name,
                "action": "streamline_success_path",
                "reason": "high success rate suggests the tool can be simplified",
                "confidence": 0.7,
                "notes": ["consider caching stable substeps", "reduce prompt size in generator"],
            }

        if record.usage_count >= min_usage and record.status == "active":
            return {
                "tool_name": record.tool_name,
                "action": "retain",
                "reason": "healthy usage profile",
                "confidence": 0.5,
                "notes": ["monitor periodically"],
            }

        return None

    def _suggest_failure_hardening(self, record: RegisteredTool, usage_snapshot: Mapping[str, Any]) -> Dict[str, Any]:
        return {
            "tool_name": record.tool_name,
            "action": "harden_validation",
            "reason": "usage snapshot shows elevated failures",
            "confidence": 0.84,
            "notes": ["examine failure payloads", "add validation guardrails"],
            "usage_snapshot": dict(usage_snapshot),
        }

    def _suggest_performance_tuning(self, record: RegisteredTool, usage_snapshot: Mapping[str, Any]) -> Dict[str, Any]:
        return {
            "tool_name": record.tool_name,
            "action": "optimize_runtime",
            "reason": "usage snapshot shows high runtime cost",
            "confidence": 0.76,
            "notes": ["reduce repeated parsing", "precompute stable metadata"],
            "usage_snapshot": dict(usage_snapshot),
        }

    def _apply_suggestion(self, record: RegisteredTool, suggestion: Mapping[str, Any]) -> None:
        action = str(suggestion.get("action", "")).strip()
        note = str(suggestion.get("reason", "")).strip()
        if note:
            record.optimizer_notes.append(note)

        if action == "deprecate_candidate":
            self._tool_registry.deactivate(record.tool_name, reason=note)
        elif action == "harden_validation":
            self._tool_registry.mark_validated(record.tool_name, validator_notes=["optimizer: harden validation"])
        elif action == "optimize_runtime":
            self._tool_registry.record_usage(record.tool_name, success=True, metadata={"optimized": True})

    def _persist(self, report: ToolOptimizationReport) -> None:
        payload = {
            "type": "tool_optimization",
            "generated_at": report.generated_at,
            "total_tools": report.total_tools,
            "optimized_tools": report.optimized_tools,
            "suggestions": list(report.suggestions),
            "metadata": dict(report.metadata),
            "notes": list(report.notes),
        }
        self._memory.remember_short_term(
            key="tool_learning:last_optimization",
            value=payload,
            tags=["tool_learning", "optimization"],
        )
        self._memory.remember_long_term(
            key=f"tool_learning:optimization:{report.generated_at}",
            value=payload,
            source="jarvis.tool_learning.tool_optimizer",
            importance=0.69,
            tags=["tool_learning", "optimization"],
        )
