"""Route structured Pixi commands to the appropriate execution backend."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Sequence

from Pixi.skills.skill_registry import SkillRegistry
from Pixi.uci.command_parser import CommandAction, ParsedCommand
from Pixi.uci.device_manager import DeviceManager, DeviceProfile


@dataclass(slots=True)
class CommandRoute:
    route_id: str
    command_id: str
    action_id: str
    intent: str
    subsystem: str
    executor: str
    device_id: str | None
    device_kind: str
    agent_role: str
    skill_name: str | None
    priority: int
    requires_confirmation: bool
    reason: str
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "route_id": self.route_id,
            "command_id": self.command_id,
            "action_id": self.action_id,
            "intent": self.intent,
            "subsystem": self.subsystem,
            "executor": self.executor,
            "device_id": self.device_id,
            "device_kind": self.device_kind,
            "agent_role": self.agent_role,
            "skill_name": self.skill_name,
            "priority": self.priority,
            "requires_confirmation": self.requires_confirmation,
            "reason": self.reason,
            "metadata": dict(self.metadata),
        }


@dataclass(slots=True)
class RoutingPlan:
    command_id: str
    routes: List[CommandRoute] = field(default_factory=list)
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "command_id": self.command_id,
            "created_at": self.created_at,
            "metadata": dict(self.metadata),
            "routes": [route.to_dict() for route in self.routes],
        }

    def target_devices(self) -> List[str]:
        return [route.device_id for route in self.routes if route.device_id]


class UnifiedCommandRouter:
    """Choose the execution backend for each parsed command action."""

    _INTENT_SUBSYSTEM = {
        "system_control": "desktop",
        "automation": "desktop",
        "content_creation": "desktop",
        "web_search": "web",
        "web_browse": "web",
        "messaging": "mobile",
        "communication": "mobile",
        "api_call": "api",
        "data_fetch": "api",
        "multi_action": "orchestrator",
    }

    _INTENT_AGENT_ROLE = {
        "system_control": "desktop-agent",
        "automation": "automation-agent",
        "content_creation": "content-agent",
        "web_search": "research-agent",
        "web_browse": "research-agent",
        "messaging": "mobile-agent",
        "communication": "mobile-agent",
        "api_call": "integration-agent",
        "data_fetch": "integration-agent",
        "multi_action": "planner-agent",
    }

    _PREFERRED_SKILLS = {
        "web_search": ["research_snapshot", "browser_research"],
        "web_browse": ["browser_research", "research_snapshot"],
        "content_creation": ["synthesize_response", "draft_content"],
        "automation": ["automation_blueprint", "workflow_builder"],
        "api_call": ["integration_connector", "api_proxy"],
        "multi_action": ["task_planner", "workflow_builder"],
    }

    def __init__(
        self,
        device_manager: DeviceManager | None = None,
        skill_registry: SkillRegistry | None = None,
    ) -> None:
        self._device_manager = device_manager or DeviceManager()
        self._skill_registry = skill_registry
        self._route_counter = 0

    def route(self, parsed_command: ParsedCommand) -> RoutingPlan:
        routes = [self._route_action(parsed_command, action) for action in parsed_command.actions]
        return RoutingPlan(
            command_id=parsed_command.command_id,
            routes=routes,
            metadata={
                "primary_intent": parsed_command.primary_intent,
                "device_count": len({route.device_id for route in routes if route.device_id}),
                "action_count": len(routes),
            },
        )

    def route_many(self, parsed_commands: Sequence[ParsedCommand]) -> List[RoutingPlan]:
        return [self.route(command) for command in parsed_commands]

    def _route_action(self, parsed_command: ParsedCommand, action: CommandAction) -> CommandRoute:
        subsystem = self._resolve_subsystem(action.intent, action.device_hint)
        device = self._resolve_device(subsystem, action)
        skill_name = self._resolve_skill_name(action.intent)
        executor = self._resolve_executor(subsystem, skill_name)
        agent_role = self._INTENT_AGENT_ROLE.get(action.intent, "general-agent")
        priority = self._priority_for_intent(action.intent)
        reason = self._build_reason(action, subsystem, device, skill_name)

        return CommandRoute(
            route_id=self._next_id(),
            command_id=parsed_command.command_id,
            action_id=action.action_id,
            intent=action.intent,
            subsystem=subsystem,
            executor=executor,
            device_id=device.device_id if device else None,
            device_kind=device.kind if device else action.device_hint or subsystem,
            agent_role=agent_role,
            skill_name=skill_name,
            priority=priority,
            requires_confirmation=action.requires_confirmation,
            reason=reason,
            metadata={
                "confidence": action.confidence,
                "tags": list(action.tags),
                "parameters": dict(action.parameters),
                "target": action.target,
            },
        )

    def _resolve_subsystem(self, intent: str, device_hint: str) -> str:
        if intent in self._INTENT_SUBSYSTEM:
            return self._INTENT_SUBSYSTEM[intent]
        if device_hint in {"desktop", "mobile", "web", "api"}:
            return device_hint
        return "orchestrator"

    def _resolve_device(self, subsystem: str, action: CommandAction) -> DeviceProfile | None:
        preferred_kind = action.device_hint if action.device_hint in {"desktop", "mobile", "web", "api"} else subsystem
        device = self._device_manager.get_best_device(preferred_kind)
        if device:
            return device
        if subsystem != preferred_kind:
            return self._device_manager.get_best_device(subsystem)
        return None

    def _resolve_skill_name(self, intent: str) -> str | None:
        candidates = self._PREFERRED_SKILLS.get(intent, [])
        if not self._skill_registry:
            return candidates[0] if candidates else None

        skills = self._skill_registry.list_skills(include_schema=False)
        available_names = {skill.get("name") for skill in skills if isinstance(skill, dict)}
        for candidate in candidates:
            if candidate in available_names:
                return candidate
        return candidates[0] if candidates else None

    @staticmethod
    def _resolve_executor(subsystem: str, skill_name: str | None) -> str:
        if skill_name:
            return "skill"
        if subsystem in {"desktop", "mobile", "web", "api"}:
            return "device"
        return "orchestrator"

    @staticmethod
    def _priority_for_intent(intent: str) -> int:
        if intent in {"system_control", "api_call"}:
            return 90
        if intent in {"automation", "messaging"}:
            return 70
        if intent in {"web_search", "web_browse"}:
            return 60
        if intent in {"content_creation", "multi_action"}:
            return 50
        return 40

    @staticmethod
    def _build_reason(action: CommandAction, subsystem: str, device: DeviceProfile | None, skill_name: str | None) -> str:
        parts = [f"intent={action.intent}", f"subsystem={subsystem}"]
        if device:
            parts.append(f"device={device.device_id}")
        if skill_name:
            parts.append(f"skill={skill_name}")
        if action.requires_confirmation:
            parts.append("confirmation_required")
        return "; ".join(parts)

    def _next_id(self) -> str:
        self._route_counter += 1
        return f"route-{self._route_counter}"


def _example_router() -> None:
    from Pixi.uci.command_parser import UnifiedCommandParser

    parser = UnifiedCommandParser()
    router = UnifiedCommandRouter()
    plan = router.route(parser.parse("open chrome and search AI news"))
    print(plan.to_dict())


if __name__ == "__main__":
    _example_router()
