"""Tool builder for Jarvis self-improvement."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List
import json
import textwrap

from jarvis.memory.memory_system import MemorySystem
from jarvis.self_improvement.capability_gap_detector import CapabilityGap
from jarvis.skills.skill_registry import SkillRegistry


@dataclass(slots=True)
class SkillTemplate:
    skill_name: str
    description: str
    category: str
    version: str
    input_schema: Dict[str, Any]
    output_contract: Dict[str, Any]
    python_template: str
    registration_payload: Dict[str, Any]
    rationale: List[str] = field(default_factory=list)
    risk_controls: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class BuildResult:
    generated_at: str
    templates: List[SkillTemplate] = field(default_factory=list)
    integrated_skills: List[str] = field(default_factory=list)
    skipped_skills: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)


class ToolBuilder:
    def __init__(self, memory: MemorySystem, skill_registry: SkillRegistry, generated_dir: str = "python/jarvis/skills/generated") -> None:
        self._memory = memory
        self._registry = skill_registry
        self._generated_dir = Path(generated_dir)
        self._generated_dir.mkdir(parents=True, exist_ok=True)

    def build_from_gaps(
        self,
        gaps: List[CapabilityGap],
        *,
        max_templates: int = 5,
        integrate_placeholders: bool = False,
    ) -> BuildResult:
        now = datetime.now(timezone.utc).isoformat()
        chosen = sorted(gaps, key=lambda row: (row.severity, row.impact_score), reverse=True)[: max(1, int(max_templates))]

        templates: List[SkillTemplate] = []
        integrated: List[str] = []
        skipped: List[str] = []

        for gap in chosen:
            template = self._build_template_for_gap(gap)
            if self._registry.get_skill(template.skill_name) is not None:
                skipped.append(template.skill_name)
                continue

            templates.append(template)
            self._write_template_file(template)

            if integrate_placeholders:
                if self._safe_register_placeholder(template):
                    integrated.append(template.skill_name)
                else:
                    skipped.append(template.skill_name)

        result = BuildResult(
            generated_at=now,
            templates=templates,
            integrated_skills=integrated,
            skipped_skills=skipped,
            metadata={
                "requested_gaps": len(gaps),
                "max_templates": max_templates,
                "integrate_placeholders": integrate_placeholders,
            },
        )
        self._persist(result)
        return result

    def validate_template(self, template: SkillTemplate) -> Dict[str, Any]:
        checks = {
            "has_required_function": "def execute(payload" in template.python_template,
            "has_input_schema": isinstance(template.input_schema, dict) and bool(template.input_schema),
            "has_risk_controls": len(template.risk_controls) >= 2,
            "name_is_safe": template.skill_name.replace("_", "").isalnum(),
            "description_length_ok": len(template.description.strip()) >= 20,
        }
        return {"valid": all(checks.values()), "checks": checks, "skill_name": template.skill_name}

    def _build_template_for_gap(self, gap: CapabilityGap) -> SkillTemplate:
        skill_name = self._propose_skill_name(gap)
        schema = self._propose_schema(gap)
        output_contract = {
            "type": "object",
            "required": ["status", "summary"],
            "properties": {
                "status": {"type": "string"},
                "summary": {"type": "string"},
                "details": {"type": "object"},
                "confidence": {"type": "number"},
            },
        }

        rationale = [
            f"Gap category: {gap.category}",
            f"Missing capability: {gap.missing_capability}",
            f"Severity: {gap.severity}",
            f"Impact score: {gap.impact_score}",
            *list(gap.evidence[:3]),
        ]
        controls = self._risk_controls_for_gap(gap)

        return SkillTemplate(
            skill_name=skill_name,
            description=f"Addresses capability gap: {gap.title}",
            category=gap.category,
            version="0.1.0",
            input_schema=schema,
            output_contract=output_contract,
            python_template=self._render_python_template(skill_name, gap, schema, controls),
            registration_payload={
                "name": skill_name,
                "description": f"Generated self-improvement skill for: {gap.title}",
                "input_schema": schema,
                "tags": ["generated", "self_improvement", gap.category],
                "version": "0.1.0",
            },
            rationale=rationale,
            risk_controls=controls,
            metadata={
                "gap_id": gap.gap_id,
                "confidence": gap.confidence,
                "created_at": datetime.now(timezone.utc).isoformat(),
            },
        )

    def _propose_skill_name(self, gap: CapabilityGap) -> str:
        prefix_map = {
            "execution_reliability": "stabilize_execution",
            "execution_efficiency": "optimize_first_pass",
            "error_resilience": "recover_from_runtime_errors",
            "performance_optimization": "accelerate_runtime_path",
            "autonomy": "autonomous_policy_router",
            "strategic_reasoning": "improve_strategy_simulation",
            "skill_coverage": "generate_missing_skill_adapter",
        }
        base = prefix_map.get(gap.category, "improvement_skill")
        return f"{base}_{abs(hash(gap.missing_capability)) % 10000}"

    @staticmethod
    def _propose_schema(gap: CapabilityGap) -> Dict[str, Any]:
        return {
            "type": "object",
            "required": ["goal", "context"],
            "properties": {
                "goal": {"type": "string"},
                "context": {"type": "object"},
                "constraints": {"type": "array"},
                "priority": {"type": "string"},
                "expected_capability": {"type": "string"},
                "safety_mode": {"type": "boolean"},
            },
            "x_gap_category": gap.category,
            "x_missing_capability": gap.missing_capability,
        }

    @staticmethod
    def _risk_controls_for_gap(gap: CapabilityGap) -> List[str]:
        controls = [
            "Validate payload before execution.",
            "Do not perform destructive actions without explicit safety_mode override.",
            "Return structured status with confidence and rationale.",
        ]
        if gap.category in {"autonomy", "strategic_reasoning"}:
            controls.append("Escalate to human decision when confidence is below 0.55.")
        if gap.category == "error_resilience":
            controls.append("Wrap external calls with timeout and retry bounds.")
        return controls

    def _render_python_template(self, skill_name: str, gap: CapabilityGap, schema: Dict[str, Any], controls: List[str]) -> str:
        schema_literal = json.dumps(schema, ensure_ascii=True, indent=4)
        controls_block = "\n".join(f"    # - {line}" for line in controls)
        content = f'''"""Auto-generated skill template: {skill_name}."""

from __future__ import annotations

from typing import Any, Dict


INPUT_SCHEMA: Dict[str, Any] = {schema_literal}


def execute(payload: Dict[str, Any]) -> Dict[str, Any]:
    if not isinstance(payload, dict):
        raise ValueError("payload must be a dict")
{controls_block}
    goal = str(payload.get("goal", ""))
    expected = str(payload.get("expected_capability", "{gap.missing_capability}"))
    return {{
        "status": "template_mode",
        "summary": f"Generated skill executed for goal={{goal}} capability={{expected}}",
        "details": {{"skill": "{skill_name}", "gap_category": "{gap.category}", "requires_implementation": True}},
        "confidence": 0.45,
    }}
'''
        return textwrap.dedent(content)

    def _write_template_file(self, template: SkillTemplate) -> Path:
        path = self._generated_dir / f"{template.skill_name}.py"
        path.write_text(template.python_template, encoding="utf-8")
        return path

    def _safe_register_placeholder(self, template: SkillTemplate) -> bool:
        if self._registry.get_skill(template.skill_name) is not None:
            return False

        def _placeholder(payload: Dict[str, Any]) -> Dict[str, Any]:
            goal = str(payload.get("goal", ""))
            return {
                "status": "placeholder",
                "summary": f"Placeholder {template.skill_name} invoked for goal={goal}",
                "details": {"pending": True, "category": template.category},
                "confidence": 0.35,
            }

        try:
            self._registry.register_skill(
                name=template.skill_name,
                description=template.description,
                input_schema=template.input_schema,
                execution_fn=_placeholder,
                tags=["generated", "self_improvement", template.category],
                version=template.version,
            )
            return True
        except Exception:
            return False

    def _persist(self, result: BuildResult) -> None:
        payload = {
            "type": "tool_build_result",
            "generated_at": result.generated_at,
            "templates": [
                {
                    "skill_name": row.skill_name,
                    "description": row.description,
                    "category": row.category,
                    "version": row.version,
                    "metadata": row.metadata,
                }
                for row in result.templates
            ],
            "integrated_skills": result.integrated_skills,
            "skipped_skills": result.skipped_skills,
            "metadata": result.metadata,
        }
        self._memory.remember_long_term(
            key=f"self_improvement:tool_build:{result.generated_at}",
            value=payload,
            source="self_improvement.tool_builder",
            importance=0.77,
            tags=["self_improvement", "tool_builder"],
        )
        self._memory.remember_short_term(
            key="self_improvement:last_tool_build",
            value=payload,
            tags=["self_improvement", "tool_builder"],
        )
