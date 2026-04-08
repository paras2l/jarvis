"""Detect when Pixi needs a new tool."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
import re
from typing import Any, Dict, Iterable, List, Mapping
from uuid import uuid4

from Pixi.core.contracts import ContextSnapshot, ExecutionPlan
from Pixi.memory.memory_system import MemorySystem
from Pixi.skills.skill_registry import SkillRegistry
from Pixi.tool_learning.tool_registry import ToolRegistry


@dataclass(slots=True)
class ToolNeedSource:
    """Evidence source used to explain why a tool is needed."""

    source_type: str
    summary: str
    confidence: float
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class ToolNeed:
    """One tool requirement detected from a task or runtime signal."""

    need_id: str
    tool_name: str
    category: str
    title: str
    description: str
    confidence: float
    urgency: float
    required_capabilities: List[str] = field(default_factory=list)
    preferred_tool_type: str = "script"
    evidence: List[ToolNeedSource] = field(default_factory=list)
    context: Dict[str, Any] = field(default_factory=dict)
    metadata: Dict[str, Any] = field(default_factory=dict)

    def priority_score(self) -> float:
        return round((self.confidence * 0.65) + (self.urgency * 0.35), 4)


class ToolDetector:
    """Analyzes tasks, plans, and failures to identify missing tools."""

    def __init__(
        self,
        memory: MemorySystem,
        tool_registry: ToolRegistry,
        skill_registry: SkillRegistry | None = None,
    ) -> None:
        self._memory = memory
        self._tool_registry = tool_registry
        self._skill_registry = skill_registry

    def detect(
        self,
        task: Mapping[str, Any] | str,
        *,
        context: ContextSnapshot | None = None,
        plan: ExecutionPlan | None = None,
        action_result: Mapping[str, Any] | None = None,
        agent_signals: Mapping[str, Any] | None = None,
        limit: int = 5,
    ) -> List[ToolNeed]:
        candidates: List[ToolNeed] = []
        task_map = self._normalize_task(task)
        task_text = self._task_text(task_map)

        candidates.extend(self._detect_missing_tools(task_map, task_text, context=context))
        candidates.extend(self._detect_plan_gaps(plan, context=context))
        candidates.extend(self._detect_action_failures(task_map, action_result))
        candidates.extend(self._detect_agent_capacity_gaps(task_map, agent_signals))
        candidates.extend(self._detect_memory_patterns(task_text, context=context))

        deduped = self._deduplicate(candidates)
        ranked = sorted(deduped, key=lambda row: (row.priority_score(), row.confidence, row.urgency), reverse=True)
        ranked = ranked[: max(1, int(limit))]
        self._persist(task_map, ranked, context=context, plan=plan, action_result=action_result)
        return ranked

    def has_missing_tool_signal(self, task: Mapping[str, Any] | str) -> bool:
        task_map = self._normalize_task(task)
        text = self._task_text(task_map).lower()
        return any(marker in text for marker in ["missing tool", "unknown skill", "not registered", "cannot execute"])

    def summarize(self, needs: List[ToolNeed]) -> Dict[str, Any]:
        return {
            "available": bool(needs),
            "count": len(needs),
            "top_need": None if not needs else needs[0].tool_name,
            "categories": sorted({need.category for need in needs}),
            "tool_types": sorted({need.preferred_tool_type for need in needs}),
        }

    def _detect_missing_tools(self, task_map: Mapping[str, Any], task_text: str, *, context: ContextSnapshot | None) -> List[ToolNeed]:
        needs: List[ToolNeed] = []
        requested_tool = str(task_map.get("tool") or task_map.get("tool_name") or task_map.get("skill_name") or "").strip()
        if requested_tool:
            missing_in_skill_registry = self._skill_registry is not None and self._skill_registry.get_skill(requested_tool) is None
            missing_in_tool_registry = not self._tool_registry.has_tool(requested_tool)
            if missing_in_skill_registry or missing_in_tool_registry:
                needs.append(
                    self._need(
                        category="missing_tool",
                        tool_name=requested_tool,
                        title=f"Create {requested_tool}",
                        description=f"Task explicitly requested tool '{requested_tool}', but it is not available.",
                        confidence=0.92,
                        urgency=0.88,
                        required_capabilities=self._capabilities_from_task(task_map),
                        preferred_tool_type=self._guess_tool_type(requested_tool, task_text, context=context),
                        evidence=[
                            ToolNeedSource("task_payload", f"Task requested tool '{requested_tool}'", 0.95, dict(task_map)),
                        ],
                        context=self._context_dict(context),
                        metadata={"requested_tool": requested_tool},
                    )
                )

        phrases = [
            (r"cannot (?:find|resolve|execute) (?:a )?tool", "missing_tool"),
            (r"need(?:s|) (?:a )?new tool", "tool_gap"),
            (r"build (?:a )?custom tool", "tool_gap"),
            (r"automate (?:this|that|the task)", "automation"),
            (r"create (?:an )?api", "api_tool"),
        ]
        lowered = task_text.lower()
        for pattern, category in phrases:
            if not re.search(pattern, lowered):
                continue
            needs.append(
                self._need(
                    category=category,
                    tool_name=self._derive_tool_name(task_map, fallback_category=category),
                    title="Generate supporting tool",
                    description=f"Text signals indicate a missing tool for category '{category}'.",
                    confidence=0.74,
                    urgency=0.63,
                    required_capabilities=self._capabilities_from_task(task_map),
                    preferred_tool_type=self._guess_tool_type(task_map.get("tool", ""), task_text, context=context),
                    evidence=[ToolNeedSource("task_text", pattern, 0.72, {"text": task_text[:400]})],
                    context=self._context_dict(context),
                    metadata={"pattern": pattern, "category": category},
                )
            )
        return needs

    def _detect_plan_gaps(self, plan: ExecutionPlan | None, *, context: ContextSnapshot | None) -> List[ToolNeed]:
        if plan is None:
            return []

        needs: List[ToolNeed] = []
        for step in plan.steps:
            skill_name = step.skill_name.strip()
            if not skill_name:
                continue
            skill_missing = self._skill_registry is None or self._skill_registry.get_skill(skill_name) is None
            tool_missing = not self._tool_registry.has_tool(skill_name)
            if not (skill_missing or tool_missing):
                continue
            needs.append(
                self._need(
                    category="planning_gap",
                    tool_name=skill_name,
                    title=f"Support planned step {step.id}",
                    description=f"Planner step '{step.description}' references unavailable skill '{skill_name}'.",
                    confidence=0.81,
                    urgency=0.7,
                    required_capabilities=[step.agent_role, skill_name],
                    preferred_tool_type="automation" if step.agent_role in {"action", "execution"} else "script",
                    evidence=[ToolNeedSource("execution_plan", step.description, 0.8, {"step_id": step.id})],
                    context=self._context_dict(context),
                    metadata={"plan_goal": plan.goal, "step_id": step.id},
                )
            )
        return needs

    def _detect_action_failures(self, task_map: Mapping[str, Any], action_result: Mapping[str, Any] | None) -> List[ToolNeed]:
        if not action_result:
            return []
        status = str(action_result.get("status", "")).lower()
        error = str(action_result.get("error", "")).lower()
        if status not in {"failed", "error", "blocked"} and not error:
            return []

        evidence: List[ToolNeedSource] = [ToolNeedSource("action_result", status or "failure", 0.74, dict(action_result))]
        if "tool" in error or "skill" in error or "not registered" in error:
            tool_name = str(task_map.get("tool") or action_result.get("tool") or self._derive_tool_name(task_map, fallback_category="action_recovery"))
            return [
                self._need(
                    category="runtime_failure_recovery",
                    tool_name=tool_name,
                    title=f"Recover {tool_name}",
                    description="Execution failed in a way that suggests the runtime needs a specialized tool.",
                    confidence=0.86,
                    urgency=0.83,
                    required_capabilities=self._capabilities_from_task(task_map),
                    preferred_tool_type="script",
                    evidence=evidence,
                    context=self._context_dict(None),
                    metadata={"error": error[:300], "status": status},
                )
            ]
        return [
            self._need(
                category="runtime_failure_recovery",
                tool_name=self._derive_tool_name(task_map, fallback_category="recovery"),
                title="Add recovery helper",
                description="Repeated runtime failure implies a helper tool could reduce future errors.",
                confidence=0.68,
                urgency=0.58,
                required_capabilities=self._capabilities_from_task(task_map),
                preferred_tool_type="automation",
                evidence=evidence,
                context=self._context_dict(None),
                metadata={"status": status},
            )
        ]

    def _detect_agent_capacity_gaps(self, task_map: Mapping[str, Any], agent_signals: Mapping[str, Any] | None) -> List[ToolNeed]:
        if not agent_signals:
            return []
        missing = agent_signals.get("missing_capabilities") or agent_signals.get("missing_tools") or []
        if not missing:
            return []

        capabilities = [str(item) for item in missing]
        tool_name = self._derive_tool_name(task_map, fallback_category="agent_support")
        return [
            self._need(
                category="agent_capacity",
                tool_name=tool_name,
                title="Support agent capability gap",
                description="Agent layer signaled missing capabilities that a learned tool can provide.",
                confidence=0.78,
                urgency=0.74,
                required_capabilities=capabilities,
                preferred_tool_type="automation" if any("api" in cap or "integration" in cap for cap in capabilities) else "script",
                evidence=[ToolNeedSource("agent_signals", "missing capabilities", 0.78, dict(agent_signals))],
                context={},
                metadata={"missing_capabilities": capabilities},
            )
        ]

    def _detect_memory_patterns(self, task_text: str, *, context: ContextSnapshot | None) -> List[ToolNeed]:
        query = "tool gap missing tool automation skill"
        if context is not None:
            query = f"{context.current_application} {context.user_activity} {query}"
        hits = self._memory.semantic_search(query, top_k=3)
        if not hits:
            return []

        evidence = [ToolNeedSource("memory_search", hit.doc_id, hit.score, {"text": hit.text[:240]}) for hit in hits]
        best = hits[0]
        if best.score < 0.2:
            return []
        return [
            self._need(
                category="memory_pattern",
                tool_name=self._derive_tool_name({"task": task_text}, fallback_category="memory"),
                title="Reinforce recurring workflow",
                description="Memory search found repeated signals for a missing or improvable tool.",
                confidence=min(0.84, 0.45 + best.score),
                urgency=min(0.8, 0.35 + best.score),
                required_capabilities=["memory", "automation"],
                preferred_tool_type="script",
                evidence=evidence,
                context=self._context_dict(context),
                metadata={"top_doc": best.doc_id, "top_score": best.score},
            )
        ]

    def _deduplicate(self, needs: List[ToolNeed]) -> List[ToolNeed]:
        merged: Dict[str, ToolNeed] = {}
        for need in needs:
            key = f"{need.category}|{need.tool_name}"
            existing = merged.get(key)
            if existing is None:
                merged[key] = need
                continue
            existing.confidence = max(existing.confidence, need.confidence)
            existing.urgency = max(existing.urgency, need.urgency)
            existing.required_capabilities = self._merge_unique(existing.required_capabilities, need.required_capabilities)
            existing.evidence.extend(need.evidence)
            existing.context.update(need.context)
            existing.metadata.update(need.metadata)
        return list(merged.values())

    def _persist(self, task_map: Mapping[str, Any], needs: List[ToolNeed], *, context: ContextSnapshot | None, plan: ExecutionPlan | None, action_result: Mapping[str, Any] | None) -> None:
        payload = {
            "type": "tool_need_detection",
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "task": dict(task_map),
            "context": self._context_dict(context),
            "plan_goal": None if plan is None else plan.goal,
            "action_result": dict(action_result or {}),
            "needs": [
                {
                    "need_id": row.need_id,
                    "tool_name": row.tool_name,
                    "category": row.category,
                    "title": row.title,
                    "confidence": row.confidence,
                    "urgency": row.urgency,
                    "required_capabilities": list(row.required_capabilities),
                    "preferred_tool_type": row.preferred_tool_type,
                    "evidence": [source.summary for source in row.evidence],
                }
                for row in needs
            ],
        }
        self._memory.remember_short_term(
            key="tool_learning:last_detection",
            value=payload,
            tags=["tool_learning", "detection"],
        )
        self._memory.remember_long_term(
            key=f"tool_learning:detection:{payload['generated_at']}",
            value=payload,
            source="Pixi.tool_learning.tool_detector",
            importance=0.78,
            tags=["tool_learning", "detection"],
        )
        self._memory.remember_semantic(
            doc_id=f"tool_learning:detection:{uuid4().hex}",
            text="; ".join(f"{row.tool_name}:{row.category}:{row.confidence:.2f}" for row in needs),
            metadata={"type": "tool_need_detection"},
        )

    @staticmethod
    def _normalize_task(task: Mapping[str, Any] | str) -> Dict[str, Any]:
        if isinstance(task, str):
            return {"task": task}
        return dict(task)

    @staticmethod
    def _task_text(task_map: Mapping[str, Any]) -> str:
        parts: List[str] = []
        for key in ["task", "goal", "title", "description", "text", "prompt"]:
            value = task_map.get(key)
            if value:
                parts.append(str(value))
        payload = task_map.get("payload")
        if isinstance(payload, Mapping):
            parts.append(" ".join(f"{k}={v}" for k, v in payload.items()))
        return " | ".join(parts)

    @staticmethod
    def _capabilities_from_task(task_map: Mapping[str, Any]) -> List[str]:
        required = task_map.get("required_capabilities")
        if isinstance(required, Iterable) and not isinstance(required, (str, bytes)):
            return [str(item) for item in required]
        tags = task_map.get("tags")
        if isinstance(tags, Iterable) and not isinstance(tags, (str, bytes)):
            return [str(item) for item in tags]
        return []

    @staticmethod
    def _guess_tool_type(tool_name: str, task_text: str, context: ContextSnapshot | None) -> str:
        probe = f"{tool_name} {task_text}"
        if context is not None:
            probe = f"{context.current_application} {context.user_activity} {probe}"
        lowered = probe.lower()
        if any(word in lowered for word in ["api", "endpoint", "service", "integration"]):
            return "api"
        if any(word in lowered for word in ["browser", "click", "navigate", "desktop", "ui"]):
            return "automation"
        return "script"

    @staticmethod
    def _derive_tool_name(task_map: Mapping[str, Any], *, fallback_category: str) -> str:
        seed = str(task_map.get("tool") or task_map.get("tool_name") or task_map.get("skill_name") or task_map.get("goal") or task_map.get("task") or fallback_category)
        cleaned = re.sub(r"[^a-zA-Z0-9]+", "_", seed).strip("_").lower()
        if not cleaned:
            cleaned = fallback_category
        return f"learned_{cleaned[:48]}"

    def _need(
        self,
        *,
        category: str,
        tool_name: str,
        title: str,
        description: str,
        confidence: float,
        urgency: float,
        required_capabilities: List[str],
        preferred_tool_type: str,
        evidence: List[ToolNeedSource],
        context: Dict[str, Any],
        metadata: Dict[str, Any],
    ) -> ToolNeed:
        return ToolNeed(
            need_id=f"need-{uuid4().hex[:12]}",
            tool_name=tool_name,
            category=category,
            title=title,
            description=description,
            confidence=round(min(1.0, max(0.05, confidence)), 4),
            urgency=round(min(1.0, max(0.05, urgency)), 4),
            required_capabilities=list(dict.fromkeys(required_capabilities)),
            preferred_tool_type=preferred_tool_type,
            evidence=evidence,
            context=context,
            metadata=metadata,
        )

    @staticmethod
    def _merge_unique(left: List[str], right: List[str]) -> List[str]:
        seen = set(left)
        merged = list(left)
        for item in right:
            if item in seen:
                continue
            merged.append(item)
            seen.add(item)
        return merged

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

