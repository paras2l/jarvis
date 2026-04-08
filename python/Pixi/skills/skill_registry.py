"""Skill Registry system for Pixi.

This module provides a dynamic tool registry that supports:
- registering skills with metadata and schema
- discovering and listing registered skills
- executing a skill after schema validation

Required skill metadata:
- name
- description
- input schema
- execution function
"""

from __future__ import annotations

from dataclasses import dataclass, field
import importlib
from typing import Any, Callable, Dict, Iterable, List, Mapping

from Pixi.core.contracts import SkillExecutor

SkillHandler = Callable[[Dict[str, Any]], Any]


class SkillRegistryError(Exception):
    """Base exception for skill registry failures."""


class SkillNotFoundError(SkillRegistryError):
    """Raised when a requested skill is not registered."""


class SkillValidationError(SkillRegistryError):
    """Raised when input payload does not satisfy skill schema."""


@dataclass(slots=True)
class SkillDefinition:
    """Definition object for one registrable Pixi skill."""

    name: str
    description: str
    input_schema: Dict[str, Any]
    execution_fn: SkillHandler
    tags: List[str] = field(default_factory=list)
    version: str = "1.0.0"

    def run(self, payload: Dict[str, Any]) -> Any:
        return self.execution_fn(payload)

    def to_summary(self, include_schema: bool = False) -> Dict[str, Any]:
        data: Dict[str, Any] = {
            "name": self.name,
            "description": self.description,
            "version": self.version,
            "tags": list(self.tags),
        }
        if include_schema:
            data["input_schema"] = self.input_schema
        return data


class SchemaValidator:
    """Very small validator for a JSON-schema-like subset.

    Supported schema keys:
    - type: must be "object"
    - required: list[str]
    - properties: dict with each property having optional "type"
    """

    _ALLOWED_TYPES = {
        "string": str,
        "number": (int, float),
        "integer": int,
        "boolean": bool,
        "object": dict,
        "array": list,
    }

    def validate(self, payload: Mapping[str, Any], schema: Mapping[str, Any], skill_name: str) -> None:
        schema_type = schema.get("type", "object")
        if schema_type != "object":
            raise SkillValidationError(
                f"Invalid schema for {skill_name}: top-level type must be 'object'."
            )

        required_fields = schema.get("required", [])
        if not isinstance(required_fields, list):
            raise SkillValidationError(
                f"Invalid schema for {skill_name}: 'required' must be a list."
            )

        for key in required_fields:
            if key not in payload:
                raise SkillValidationError(
                    f"Skill '{skill_name}' missing required input: '{key}'."
                )

        properties = schema.get("properties", {})
        if not isinstance(properties, dict):
            raise SkillValidationError(
                f"Invalid schema for {skill_name}: 'properties' must be an object."
            )

        for key, value in payload.items():
            if key not in properties:
                # Unknown keys are allowed for flexibility.
                continue

            prop_schema = properties.get(key, {})
            if not isinstance(prop_schema, dict):
                continue

            expected_type = prop_schema.get("type")
            if expected_type is None:
                continue
            if expected_type not in self._ALLOWED_TYPES:
                raise SkillValidationError(
                    f"Invalid schema type '{expected_type}' for {skill_name}.{key}."
                )

            expected_python_type = self._ALLOWED_TYPES[expected_type]
            if not isinstance(value, expected_python_type):
                raise SkillValidationError(
                    f"Skill '{skill_name}' expected '{key}' to be {expected_type}; got {type(value).__name__}."
                )


class SkillRegistry(SkillExecutor):
    """Registry for dynamic skill registration and discovery."""

    def __init__(self) -> None:
        self._skills: Dict[str, SkillDefinition] = {}
        self._validator = SchemaValidator()
        self._register_builtin_skills()

    def register_skill(
        self,
        name: str,
        description: str,
        input_schema: Dict[str, Any],
        execution_fn: SkillHandler,
        tags: Iterable[str] | None = None,
        version: str = "1.0.0",
    ) -> SkillDefinition:
        """Register a new skill definition in the registry."""
        normalized_name = name.strip()
        if not normalized_name:
            raise SkillRegistryError("Skill name cannot be empty.")

        if not callable(execution_fn):
            raise SkillRegistryError(f"Skill '{normalized_name}' execution_fn must be callable.")

        if not isinstance(input_schema, dict):
            raise SkillRegistryError(f"Skill '{normalized_name}' input schema must be a dict.")

        # Validate schema shape with empty payload to ensure basic consistency.
        self._validator.validate(payload={}, schema={"type": "object", "properties": {}}, skill_name=normalized_name)

        skill = SkillDefinition(
            name=normalized_name,
            description=description.strip() or "No description",
            input_schema=input_schema,
            execution_fn=execution_fn,
            tags=list(tags or []),
            version=version,
        )
        self._skills[normalized_name] = skill
        return skill

    def get_skill(self, name: str) -> SkillDefinition | None:
        """Return skill by name, or None if missing."""
        return self._skills.get(name)

    def list_skills(self, include_schema: bool = False) -> List[Dict[str, Any]]:
        """List all registered skills in deterministic order."""
        names = sorted(self._skills.keys())
        return [self._skills[name].to_summary(include_schema=include_schema) for name in names]

    def register(self, name: str, handler: SkillHandler) -> None:
        """Backward-compatible registration adapter used by starter code.

        This method registers legacy skills with a permissive object schema.
        """
        self.register_skill(
            name=name,
            description=f"Legacy skill: {name}",
            input_schema={"type": "object", "properties": {}},
            execution_fn=handler,
            tags=["legacy"],
        )

    def unregister_skill(self, name: str) -> bool:
        """Remove a skill if present and return whether it was removed."""
        if name in self._skills:
            del self._skills[name]
            return True
        return False

    def discover_and_register(self, module_path: str, container_name: str = "SKILLS") -> int:
        """Discover skills from a module-level container.

        Expected container format:
        SKILLS = [
            {
                "name": "skill_name",
                "description": "...",
                "input_schema": {...},
                "execution_fn": callable,
                "tags": ["optional"],
                "version": "1.0.0"
            }
        ]
        """
        module = importlib.import_module(module_path)
        container = getattr(module, container_name, None)
        if container is None:
            raise SkillRegistryError(
                f"Module '{module_path}' does not expose container '{container_name}'."
            )

        if not isinstance(container, list):
            raise SkillRegistryError(
                f"Container '{module_path}.{container_name}' must be a list."
            )

        count = 0
        for item in container:
            if not isinstance(item, dict):
                raise SkillRegistryError("Each discovered skill definition must be a dict.")
            self.register_skill(
                name=str(item["name"]),
                description=str(item.get("description", "No description")),
                input_schema=dict(item.get("input_schema", {"type": "object", "properties": {}})),
                execution_fn=item["execution_fn"],
                tags=item.get("tags", []),
                version=str(item.get("version", "1.0.0")),
            )
            count += 1
        return count

    def execute_skill(self, skill_name: str, payload: Dict[str, Any]) -> str:
        """Execute a skill by name and return text output."""
        result = self.execute_skill_raw(skill_name=skill_name, payload=payload)
        if isinstance(result, str):
            return result
        return str(result)

    def execute_skill_raw(self, skill_name: str, payload: Dict[str, Any]) -> Any:
        """Execute a skill and return native output without conversion."""
        skill = self.get_skill(skill_name)
        if skill is None:
            raise SkillNotFoundError(f"Unknown skill: {skill_name}")

        self._validator.validate(payload=payload, schema=skill.input_schema, skill_name=skill_name)
        return skill.run(payload)

    def _register_builtin_skills(self) -> None:
        """Register built-in example skills used by runtime and tests."""
        self.register_skill(
            name="analyze_goal",
            description="Analyze user goal and return concise intent summary.",
            input_schema={
                "type": "object",
                "required": ["goal"],
                "properties": {
                    "goal": {"type": "string"},
                },
            },
            execution_fn=self._analyze_goal,
            tags=["planning", "core"],
        )
        self.register_skill(
            name="collect_context",
            description="Format context snapshot into human-readable summary.",
            input_schema={
                "type": "object",
                "required": ["context"],
                "properties": {
                    "context": {"type": "object"},
                },
            },
            execution_fn=self._collect_context,
            tags=["context", "core"],
        )
        self.register_skill(
            name="synthesize_response",
            description="Produce execution guidance for one plan step.",
            input_schema={
                "type": "object",
                "required": ["step"],
                "properties": {
                    "step": {"type": "string"},
                    "goal": {"type": "string"},
                },
            },
            execution_fn=self._synthesize_response,
            tags=["planning", "execution", "core"],
        )
        self.register_skill(
            name="produce_checklist",
            description="Generate short checklist for follow-up work.",
            input_schema={
                "type": "object",
                "required": ["goal"],
                "properties": {
                    "goal": {"type": "string"},
                },
            },
            execution_fn=self._produce_checklist,
            tags=["planning", "support"],
        )

        # Extra example skills demonstrating dynamic registration use-cases.
        self.register_skill(
            name="research_snapshot",
            description="Return a deterministic research snapshot from a topic.",
            input_schema={
                "type": "object",
                "required": ["topic"],
                "properties": {
                    "topic": {"type": "string"},
                    "depth": {"type": "string"},
                },
            },
            execution_fn=self._research_snapshot,
            tags=["research", "example"],
        )
        self.register_skill(
            name="automation_blueprint",
            description="Create a deterministic automation blueprint for a workflow.",
            input_schema={
                "type": "object",
                "required": ["workflow"],
                "properties": {
                    "workflow": {"type": "string"},
                    "priority": {"type": "string"},
                },
            },
            execution_fn=self._automation_blueprint,
            tags=["automation", "example"],
        )

    @staticmethod
    def _analyze_goal(payload: Dict[str, Any]) -> str:
        goal = str(payload.get("goal", "unknown")).strip()
        words = [token for token in goal.split(" ") if token]
        return f"Goal analyzed ({len(words)} words): {goal}"

    @staticmethod
    def _collect_context(payload: Dict[str, Any]) -> str:
        context = payload.get("context", {})
        if not isinstance(context, dict):
            return "Context collected: invalid context format"
        parts = [f"{key}={value}" for key, value in context.items()]
        return "Context collected: " + ", ".join(parts)

    @staticmethod
    def _synthesize_response(payload: Dict[str, Any]) -> str:
        goal = str(payload.get("goal", "goal"))
        step = str(payload.get("step", "step"))
        return f"Execution guidance synthesized for '{step}' under goal '{goal}'."

    @staticmethod
    def _produce_checklist(payload: Dict[str, Any]) -> str:
        goal = str(payload.get("goal", "goal"))
        return (
            "Checklist:\n"
            f"1. Confirm objective for: {goal}\n"
            "2. Execute highest-priority action\n"
            "3. Validate output and log learnings"
        )

    @staticmethod
    def _research_snapshot(payload: Dict[str, Any]) -> str:
        topic = str(payload.get("topic", "general topic"))
        depth = str(payload.get("depth", "standard"))
        return f"Research snapshot ready for '{topic}' at depth '{depth}'."

    @staticmethod
    def _automation_blueprint(payload: Dict[str, Any]) -> str:
        workflow = str(payload.get("workflow", "workflow"))
        priority = str(payload.get("priority", "normal"))
        return f"Automation blueprint drafted for '{workflow}' with priority '{priority}'."


def _example_dynamic_skill(payload: Dict[str, Any]) -> str:
    topic = str(payload.get("topic", "unknown"))
    style = str(payload.get("style", "concise"))
    return f"Creative brief generated for topic='{topic}' style='{style}'."


def _example_usage() -> None:
    registry = SkillRegistry()

    print("Registered skills (summary):")
    for entry in registry.list_skills(include_schema=False):
        print(f"- {entry['name']} | tags={entry['tags']}")

    registry.register_skill(
        name="creative_brief",
        description="Generate creative brief payload.",
        input_schema={
            "type": "object",
            "required": ["topic"],
            "properties": {
                "topic": {"type": "string"},
                "style": {"type": "string"},
            },
        },
        execution_fn=_example_dynamic_skill,
        tags=["creative", "dynamic"],
    )

    skill = registry.get_skill("creative_brief")
    if skill:
        print("\nDiscovered dynamic skill:")
        print(f"name={skill.name} description={skill.description}")

    result = registry.execute_skill(
        skill_name="creative_brief",
        payload={"topic": "Launch campaign", "style": "bold"},
    )
    print("\nExecution result:")
    print(result)


if __name__ == "__main__":
    _example_usage()

