"""Improvement manager for Jarvis self-improvement cycles."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
import logging
from logging.handlers import RotatingFileHandler
from pathlib import Path
from typing import Any, Dict, List

from jarvis.core.contracts import ContextSnapshot
from jarvis.agent_system.agent_manager import AgentManager
from jarvis.agent_system.agent_registry import AgentRegistry
from jarvis.memory.memory_system import MemorySystem
from jarvis.self_improvement.capability_gap_detector import CapabilityGapDetector, GapDetectionResult
from jarvis.self_improvement.learning_scheduler import LearningRunResult, LearningScheduler
from jarvis.self_improvement.performance_analyzer import PerformanceAnalyzer, PerformanceReport
from jarvis.self_improvement.tool_builder import BuildResult, ToolBuilder
from jarvis.tool_learning.tool_learning_core import ToolLearningCore, ToolLearningResult
from jarvis.skills.skill_registry import SkillRegistry
from jarvis.system_bus.bus_core import SystemBus
from jarvis.world_model.world_state import WorldStateModel


@dataclass(slots=True)
class ImprovementCycleResult:
    cycle_id: str
    started_at: str
    completed_at: str
    triggered: bool
    trigger_reason: str
    report: PerformanceReport | None = None
    gap_result: GapDetectionResult | None = None
    build_result: BuildResult | None = None
    tool_learning_result: ToolLearningResult | None = None
    learning_runs: List[LearningRunResult] = field(default_factory=list)
    validation: Dict[str, Any] = field(default_factory=dict)
    errors: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)


class ImprovementManager:
    def __init__(
        self,
        memory: MemorySystem,
        skill_registry: SkillRegistry,
        world_state: WorldStateModel | None = None,
        system_bus: SystemBus | None = None,
        runtime_error_log_path: str = "python/.jarvis_runtime/runtime_errors.log",
        runtime_action_log_path: str = "python/.jarvis_runtime/action_log.jsonl",
        manager_log_path: str = "python/.jarvis_runtime/self_improvement.log",
    ) -> None:
        self._memory = memory
        self._world_state = world_state or WorldStateModel(memory)
        self._bus = system_bus
        self._agent_registry = AgentRegistry()
        self._agent_manager = AgentManager(registry=self._agent_registry, memory_system=memory)
        self._agent_manager.initialize_default_agents()

        self.performance_analyzer = PerformanceAnalyzer(memory, runtime_error_log_path, runtime_action_log_path)
        self.gap_detector = CapabilityGapDetector(memory=memory, world_state=self._world_state)
        self.tool_builder = ToolBuilder(memory=memory, skill_registry=skill_registry)
        self.tool_learning = ToolLearningCore(memory=memory, skill_registry=skill_registry, agent_manager=self._agent_manager)
        self.learning_scheduler = LearningScheduler(memory=memory, skill_registry=skill_registry, world_state=self._world_state)

        self._logger = self._build_logger(manager_log_path)
        self._cycle_counter = 0

    def run_cycle(
        self,
        *,
        context: ContextSnapshot,
        force: bool = False,
        integrate_placeholders: bool = False,
        max_new_tools: int = 4,
        learning_runs_per_cycle: int = 2,
    ) -> ImprovementCycleResult:
        self._cycle_counter += 1
        started_at = datetime.now(timezone.utc).isoformat()
        cycle_id = f"improve-{self._cycle_counter}-{int(datetime.now(timezone.utc).timestamp())}"

        errors: List[str] = []
        report: PerformanceReport | None = None
        gap_result: GapDetectionResult | None = None
        build_result: BuildResult | None = None
        tool_learning_result: ToolLearningResult | None = None
        learning_runs: List[LearningRunResult] = []
        validation: Dict[str, Any] = {}

        trigger_reason = "forced" if force else "periodic"
        triggered = True

        try:
            self._world_state.refresh(context)
            report = self.performance_analyzer.analyze(window_minutes=120)
            triggered, trigger_reason = self.should_trigger_improvement(report, force=force)

            if triggered:
                gap_result = self.gap_detector.detect(report)
                top_gaps = self.gap_detector.top_gaps(gap_result, limit=max_new_tools)
                build_result = self.tool_builder.build_from_gaps(
                    top_gaps,
                    max_templates=max_new_tools,
                    integrate_placeholders=integrate_placeholders,
                )
                tool_learning_result = self.tool_learning.learn_from_gaps(
                    top_gaps,
                    context=context,
                    max_tools=max_new_tools,
                    auto_register=integrate_placeholders,
                    apply_optimizations=False,
                )
                validation = self.validate_build_result(build_result)
                validation["tool_learning"] = self.tool_learning.summarize()
                self.learning_scheduler.plan_from_gaps(top_gaps, max_tasks=max_new_tools + 1)
                learning_runs = self.learning_scheduler.run_due_tasks(limit=learning_runs_per_cycle)
                self._publish(
                    "self_improvement.cycle.completed",
                    {
                        "cycle_id": cycle_id,
                        "gap_count": len(top_gaps),
                        "generated_tools": len(tool_learning_result.artifacts) if tool_learning_result else 0,
                    },
                )
            else:
                validation = {"skipped": True, "reason": trigger_reason}

        except Exception as exc:  # noqa: BLE001
            errors.append(f"{type(exc).__name__}: {exc}")
            self._logger.exception("Self-improvement cycle failed", exc_info=exc)

        result = ImprovementCycleResult(
            cycle_id=cycle_id,
            started_at=started_at,
            completed_at=datetime.now(timezone.utc).isoformat(),
            triggered=triggered,
            trigger_reason=trigger_reason,
            report=report,
            gap_result=gap_result,
            build_result=build_result,
            tool_learning_result=tool_learning_result,
            learning_runs=learning_runs,
            validation=validation,
            errors=errors,
            metadata={
                "cycle_counter": self._cycle_counter,
                "integrate_placeholders": integrate_placeholders,
                "max_new_tools": max_new_tools,
            },
        )
        self._persist_cycle(result)
        self._log_result(result)
        return result

    def should_trigger_improvement(self, report: PerformanceReport, *, force: bool = False) -> tuple[bool, str]:
        if force:
            return True, "forced"
        if report.total_tasks < 4:
            return False, "insufficient_task_data"
        if report.success_rate < 0.78:
            return True, "low_success_rate"
        if report.error_frequency_per_hour > 3.0:
            return True, "high_error_frequency"
        if report.average_attempts > 1.5:
            return True, "high_retry_pressure"
        if report.slow_signals:
            return True, "slow_runtime_signals"
        if report.weak_skill_hints:
            return True, "weak_skill_hints_present"
        return False, "healthy_runtime"

    def validate_build_result(self, build_result: BuildResult | None) -> Dict[str, Any]:
        if build_result is None:
            return {"valid": False, "reason": "no_build_result"}
        checks = [self.tool_builder.validate_template(template) for template in build_result.templates]
        return {
            "valid": all(row.get("valid", False) for row in checks),
            "generated": len(build_result.templates),
            "integrated": len(build_result.integrated_skills),
            "skipped": len(build_result.skipped_skills),
            "template_checks": checks,
        }

    def summarize_cycle(self, result: ImprovementCycleResult) -> Dict[str, Any]:
        return {
            "cycle_id": result.cycle_id,
            "triggered": result.triggered,
            "trigger_reason": result.trigger_reason,
            "errors": len(result.errors),
            "total_gaps": result.gap_result.total_gaps if result.gap_result else 0,
            "generated_tools": len(result.build_result.templates) if result.build_result else 0,
            "integrated_tools": len(result.build_result.integrated_skills) if result.build_result else 0,
            "tool_learning_tools": len(result.tool_learning_result.registered_tools) if result.tool_learning_result else 0,
            "learning_runs": len(result.learning_runs),
            "validation": result.validation,
        }

    def _persist_cycle(self, result: ImprovementCycleResult) -> None:
        payload = {
            "type": "improvement_cycle",
            "cycle_id": result.cycle_id,
            "started_at": result.started_at,
            "completed_at": result.completed_at,
            "triggered": result.triggered,
            "trigger_reason": result.trigger_reason,
            "errors": list(result.errors),
            "report": {
                "success_rate": result.report.success_rate if result.report else None,
                "error_frequency_per_hour": result.report.error_frequency_per_hour if result.report else None,
                "average_attempts": result.report.average_attempts if result.report else None,
            },
            "gaps": {
                "total": result.gap_result.total_gaps if result.gap_result else 0,
                "high_priority": result.gap_result.high_priority_gaps if result.gap_result else 0,
            },
            "tools": {
                "generated": len(result.build_result.templates) if result.build_result else 0,
                "integrated": len(result.build_result.integrated_skills) if result.build_result else 0,
                "skipped": len(result.build_result.skipped_skills) if result.build_result else 0,
            },
            "tool_learning": {
                "generated": len(result.tool_learning_result.artifacts) if result.tool_learning_result else 0,
                "registered": len(result.tool_learning_result.registered_tools) if result.tool_learning_result else 0,
                "notes": list(result.tool_learning_result.notes) if result.tool_learning_result else [],
            },
            "learning_runs": [
                {"task_id": row.task_id, "success": row.success, "summary": row.summary, "attempts": row.attempts}
                for row in result.learning_runs
            ],
            "validation": result.validation,
            "metadata": result.metadata,
        }
        self._memory.remember_short_term(
            key="self_improvement:last_cycle",
            value=payload,
            tags=["self_improvement", "improvement_cycle"],
        )
        self._memory.remember_long_term(
            key=f"self_improvement:cycle:{result.cycle_id}",
            value=payload,
            source="self_improvement.improvement_manager",
            importance=0.83,
            tags=["self_improvement", "improvement_cycle"],
        )
        self._memory.remember_semantic(
            doc_id=f"self_improvement:cycle:{result.cycle_id}",
            text=f"cycle={result.cycle_id} triggered={result.triggered} tools={payload['tools']['generated']} gaps={payload['gaps']['total']}",
            metadata={"type": "self_improvement_cycle"},
        )

    def handle_bus_message(self, message: Dict[str, Any]) -> Dict[str, Any]:
        topic = str(message.get("topic", "")).lower()
        payload = dict(message.get("payload", {}))

        if topic in {"self_improvement.run", "self_improvement.cycle"}:
            context = payload.get("context")
            if context is None:
                return {"status": "error", "reason": "missing_context"}
            result = self.run_cycle(
                context=context,
                force=bool(payload.get("force", False)),
                integrate_placeholders=bool(payload.get("integrate_placeholders", False)),
                max_new_tools=int(payload.get("max_new_tools", 4)),
                learning_runs_per_cycle=int(payload.get("learning_runs_per_cycle", 2)),
            )
            return self.summarize_cycle(result)

        if topic in {"tool_learning.learn", "self_improvement.tool_learning"}:
            task = payload.get("task", payload.get("goal", ""))
            result = self.tool_learning.learn_from_task(
                task,
                context=payload.get("context"),
                max_tools=int(payload.get("max_tools", 3)),
                auto_register=bool(payload.get("auto_register", True)),
                apply_optimizations=bool(payload.get("apply_optimizations", False)),
            )
            return {"learning_id": result.learning_id, "registered_tools": list(result.registered_tools)}

        return {"status": "ignored", "topic": topic}

    def _log_result(self, result: ImprovementCycleResult) -> None:
        self._logger.info("self_improvement_cycle %s", self.summarize_cycle(result))

    def _publish(self, topic: str, payload: Dict[str, Any]) -> None:
        if self._bus is None:
            return
        self._bus.publish_event(
            event_type=topic,
            source="self_improvement",
            payload=payload,
            topic=topic,
            tags=["self_improvement", "system_bus"],
        )

    @staticmethod
    def _build_logger(path: str) -> logging.Logger:
        log_path = Path(path)
        log_path.parent.mkdir(parents=True, exist_ok=True)

        logger = logging.getLogger("jarvis.self_improvement")
        logger.setLevel(logging.INFO)
        logger.propagate = False
        if logger.handlers:
            return logger

        handler = RotatingFileHandler(filename=str(log_path), maxBytes=1_000_000, backupCount=3, encoding="utf-8")
        handler.setLevel(logging.INFO)
        handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
        logger.addHandler(handler)
        return logger
