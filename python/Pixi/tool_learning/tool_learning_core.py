"""Tool learning orchestrator for Pixi."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Mapping, Optional

from Pixi.agent_system.agent_core import AgentTool
from Pixi.agent_system.agent_manager import AgentManager
from Pixi.core.contracts import ContextSnapshot, ExecutionPlan
from Pixi.memory.memory_system import MemorySystem
from Pixi.skills.skill_registry import SkillRegistry
from Pixi.tool_learning.tool_detector import ToolDetector, ToolNeed
from Pixi.tool_learning.tool_generator import GeneratedToolArtifact, ToolGenerator
from Pixi.tool_learning.tool_optimizer import ToolOptimizationReport, ToolOptimizer
from Pixi.tool_learning.tool_registry import RegisteredTool, ToolRegistry
from Pixi.tool_learning.tool_validator import ToolValidationReport, ToolValidator


@dataclass(slots=True)
class ToolLearningResult:
    """End-to-end result for a tool learning cycle."""

    learning_id: str
    generated_at: str
    task_summary: str
    needs: List[ToolNeed] = field(default_factory=list)
    artifacts: List[GeneratedToolArtifact] = field(default_factory=list)
    validation_reports: List[ToolValidationReport] = field(default_factory=list)
    registered_tools: List[str] = field(default_factory=list)
    optimization_reports: List[ToolOptimizationReport] = field(default_factory=list)
    notes: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)

    def successful_tools(self) -> int:
        return sum(1 for report in self.validation_reports if report.activation_allowed)


class ToolLearningCore:
    """Coordinates detection, generation, validation, registration, and optimization."""

    def __init__(
        self,
        memory: MemorySystem,
        skill_registry: SkillRegistry,
        *,
        agent_manager: AgentManager | None = None,
        code_agent: Any | None = None,
        output_dir: str = "python/Pixi/tool_learning/generated",
    ) -> None:
        self._memory = memory
        self._skill_registry = skill_registry
        self._agent_manager = agent_manager
        self._tool_registry = ToolRegistry(memory=memory, skill_registry=skill_registry)
        self._detector = ToolDetector(memory=memory, tool_registry=self._tool_registry, skill_registry=skill_registry)
        self._generator = ToolGenerator(memory=memory, output_dir=output_dir, code_agent=code_agent)
        self._validator = ToolValidator(memory=memory, tool_registry=self._tool_registry)
        self._optimizer = ToolOptimizer(memory=memory, tool_registry=self._tool_registry, code_agent=code_agent)

    @property
    def tool_registry(self) -> ToolRegistry:
        return self._tool_registry

    def learn_from_task(
        self,
        task: Mapping[str, Any] | str,
        *,
        context: ContextSnapshot | None = None,
        plan: ExecutionPlan | None = None,
        action_result: Mapping[str, Any] | None = None,
        agent_signals: Mapping[str, Any] | None = None,
        max_tools: int = 3,
        auto_register: bool = True,
        apply_optimizations: bool = False,
    ) -> ToolLearningResult:
        task_map = self._normalize_task(task)
        needs = self._detector.detect(
            task_map,
            context=context,
            plan=plan,
            action_result=action_result,
            agent_signals=agent_signals,
            limit=max_tools,
        )
        return self._execute_learning_cycle(
            task_map=task_map,
            needs=needs,
            context=context,
            auto_register=auto_register,
            apply_optimizations=apply_optimizations,
        )

    def learn_from_gaps(
        self,
        gaps: Iterable[Any],
        *,
        context: ContextSnapshot | None = None,
        max_tools: int = 3,
        auto_register: bool = True,
        apply_optimizations: bool = False,
    ) -> ToolLearningResult:
        task_map = {
            "task": "learn from detected capability gaps",
            "goal": "learn from detected capability gaps",
            "required_capabilities": [],
        }
        needs: List[ToolNeed] = []
        for gap in list(gaps)[: max(1, int(max_tools))]:
            capability = getattr(gap, "missing_capability", None) or getattr(gap, "title", "tool")
            category = getattr(gap, "category", "gap")
            needs.append(
                ToolNeed(
                    need_id=f"gap-{getattr(gap, 'gap_id', datetime.now(timezone.utc).timestamp())}",
                    tool_name=self._derive_tool_name_from_gap(gap),
                    category=category,
                    title=f"Learn tool for {category}",
                    description=str(getattr(gap, "description", "Capability gap detected.")),
                    confidence=float(getattr(gap, "confidence", 0.75)),
                    urgency=float(getattr(gap, "severity", 0.7)),
                    required_capabilities=[str(capability)] if capability else [],
                    preferred_tool_type=self._preferred_type_from_gap(gap),
                    evidence=[],
                    context=self._context_dict(context),
                    metadata={
                        "gap_id": getattr(gap, "gap_id", ""),
                        "impact_score": getattr(gap, "impact_score", 0.0),
                    },
                )
            )

        return self._execute_learning_cycle(
            task_map=task_map,
            needs=needs,
            context=context,
            auto_register=auto_register,
            apply_optimizations=apply_optimizations,
        )

    def learn_from_plan(self, plan: ExecutionPlan, *, context: ContextSnapshot | None = None, max_tools: int = 3) -> ToolLearningResult:
        return self.learn_from_task({"goal": plan.goal, "required_capabilities": []}, context=context, plan=plan, max_tools=max_tools)

    def learn_from_action_result(
        self,
        task: Mapping[str, Any] | str,
        action_result: Mapping[str, Any],
        *,
        context: ContextSnapshot | None = None,
        max_tools: int = 2,
    ) -> ToolLearningResult:
        return self.learn_from_task(task, context=context, action_result=action_result, max_tools=max_tools)

    def record_tool_usage(self, tool_name: str, *, success: bool, metadata: Optional[Dict[str, Any]] = None) -> None:
        self._tool_registry.record_usage(tool_name, success=success, metadata=metadata)
        self._memory.remember_short_term(
            key=f"tool_learning:usage:{tool_name}",
            value={"tool_name": tool_name, "success": success, "metadata": dict(metadata or {})},
            tags=["tool_learning", "usage"],
        )

    def summarize(self) -> Dict[str, Any]:
        return {
            "registry": self._tool_registry.snapshot(),
            "skill_count": len(self._skill_registry.list_skills()),
        }

    def diagnostics(self) -> Dict[str, Any]:
        sample_needs = self._detector.detect("diagnostics", limit=1)
        return {
            "registry": self._tool_registry.snapshot(),
            "skills_synced": self._tool_registry.sync_skill_registry(),
            "detector": self._detector.summarize(sample_needs),
        }

    def _execute_learning_cycle(
        self,
        *,
        task_map: Mapping[str, Any],
        needs: List[ToolNeed],
        context: ContextSnapshot | None,
        auto_register: bool,
        apply_optimizations: bool,
    ) -> ToolLearningResult:
        generated_at = datetime.now(timezone.utc).isoformat()
        notes: List[str] = []
        artifacts: List[GeneratedToolArtifact] = []
        validation_reports: List[ToolValidationReport] = []
        registered_tools: List[str] = []

        for need in needs:
            artifact = self._generator.generate(need)
            artifacts.append(artifact)
            validation = self._validator.validate(artifact)
            validation_reports.append(validation)

            if validation.activation_allowed and auto_register:
                registered = self._register_artifact(artifact, validation)
                registered_tools.append(registered.tool_name)
                notes.append(f"activated {registered.tool_name}")
                self._attach_to_agents(registered)
            else:
                notes.append(f"kept {artifact.tool_name} in draft state")

        optimization_reports: List[ToolOptimizationReport] = []
        if needs:
            optimization_reports.append(self._optimizer.optimize(min_usage=2, apply_changes=apply_optimizations))

        result = ToolLearningResult(
            learning_id=f"tool-learn-{datetime.now(timezone.utc).timestamp()}",
            generated_at=generated_at,
            task_summary=self._task_summary(task_map, context),
            needs=needs,
            artifacts=artifacts,
            validation_reports=validation_reports,
            registered_tools=registered_tools,
            optimization_reports=optimization_reports,
            notes=notes,
            metadata={
                "auto_register": auto_register,
                "apply_optimizations": apply_optimizations,
                "task": dict(task_map),
            },
        )
        self._persist(result)
        return result

    def _register_artifact(self, artifact: GeneratedToolArtifact, validation: ToolValidationReport) -> RegisteredTool:
        handler = artifact.in_memory_callable
        if handler is None:
            raise ValueError(f"generated artifact {artifact.tool_name} has no runtime callable")

        record = self._tool_registry.register_tool(
            tool_name=artifact.tool_name,
            description=artifact.description,
            source_path=artifact.source_path,
            handler=handler,
            category=str(artifact.metadata.get("category", "tool_learning")),
            capabilities=artifact.required_capabilities,
            metadata={**artifact.metadata, "validated": validation.activation_allowed, "tool_type": artifact.tool_type},
            activate=True,
        )
        self._tool_registry.mark_validated(record.tool_name, validator_notes=list(validation.issues))
        self._tool_registry.activate(record.tool_name)
        return record

    def _attach_to_agents(self, record: RegisteredTool) -> None:
        if self._agent_manager is None:
            return

        agent_registry = getattr(self._agent_manager, "registry", None)
        if agent_registry is None:
            return

        tool_callable = self._tool_registry.get_handler(record.tool_name)
        if tool_callable is None:
            return

        agent_tool = AgentTool(
            name=record.tool_name,
            description=record.description,
            handler=tool_callable,
        )

        target_categories = {record.category.lower(), *{cap.lower() for cap in record.capabilities}}
        tool_type = str(record.metadata.get("tool_type", "script")).lower()
        target_roles = self._target_roles_for_tool(record.category, tool_type)
        for agent in agent_registry.all_agents():
            role = agent.role.lower()
            capability_names = {cap.name.lower() for cap in agent.capabilities}
            if role in target_categories or role in target_roles or capability_names.intersection(target_categories):
                agent.register_tool(agent_tool)

    def _persist(self, result: ToolLearningResult) -> None:
        payload = {
            "type": "tool_learning_result",
            "learning_id": result.learning_id,
            "generated_at": result.generated_at,
            "task_summary": result.task_summary,
            "needs": [
                {
                    "need_id": row.need_id,
                    "tool_name": row.tool_name,
                    "category": row.category,
                    "confidence": row.confidence,
                    "urgency": row.urgency,
                }
                for row in result.needs
            ],
            "registered_tools": list(result.registered_tools),
            "notes": list(result.notes),
            "metadata": dict(result.metadata),
        }
        self._memory.remember_short_term(
            key="tool_learning:last_result",
            value=payload,
            tags=["tool_learning", "result"],
        )
        self._memory.remember_long_term(
            key=f"tool_learning:result:{result.learning_id}",
            value=payload,
            source="Pixi.tool_learning.tool_learning_core",
            importance=0.85,
            tags=["tool_learning", "result"],
        )
        self._memory.remember_semantic(
            doc_id=f"tool_learning:result:{result.learning_id}",
            text=f"{result.task_summary} registered={len(result.registered_tools)} needs={len(result.needs)}",
            metadata={"type": "tool_learning_result"},
        )

    @staticmethod
    def _normalize_task(task: Mapping[str, Any] | str) -> Dict[str, Any]:
        if isinstance(task, str):
            return {"task": task, "goal": task}
        return dict(task)

    @staticmethod
    def _derive_tool_name_from_gap(gap: Any) -> str:
        seed = str(getattr(gap, "missing_capability", "tool") or getattr(gap, "title", "tool"))
        import re

        cleaned = re.sub(r"[^a-zA-Z0-9]+", "_", seed).strip("_").lower()
        return f"learned_{cleaned or 'tool'}"

    @staticmethod
    def _preferred_type_from_gap(gap: Any) -> str:
        category = str(getattr(gap, "category", "")).lower()
        if "api" in category or "integration" in category:
            return "api"
        if "automation" in category or "execution" in category:
            return "automation"
        return "script"

    @staticmethod
    def _context_dict(context: ContextSnapshot | None) -> Dict[str, Any]:
        if context is None:
            return {}
        return {
            "current_application": context.current_application,
            "user_activity": context.user_activity,
            "time_of_day": context.time_of_day,
            "signals": dict(context.signals),
        }

    @staticmethod
    def _task_summary(task_map: Mapping[str, Any], context: ContextSnapshot | None) -> str:
        base = str(task_map.get("goal") or task_map.get("task") or task_map.get("title") or "tool learning cycle")
        if context is None:
            return base
        return f"{base} [{context.current_application}/{context.user_activity}]"

    @staticmethod
    def _target_roles_for_tool(category: str, tool_type: str) -> set[str]:
        lowered_category = category.lower()
        lowered_type = tool_type.lower()
        roles: set[str] = set()
        if lowered_type == "automation":
            roles.update({"action", "execution"})
        elif lowered_type == "api":
            roles.update({"reasoning", "action"})
        else:
            roles.update({"planning", "reasoning"})

        if "analysis" in lowered_category or "reason" in lowered_category:
            roles.add("reasoning")
        if "plan" in lowered_category or "workflow" in lowered_category:
            roles.add("planning")
        if "execute" in lowered_category or "automation" in lowered_category:
            roles.add("action")
        if "memory" in lowered_category or "research" in lowered_category:
            roles.add("reasoning")
        return roles

