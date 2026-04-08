"""Execution engine for the Pixi Unified Command Interface."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
import json
from typing import Any, Dict, List, Optional

from Pixi.core.orchestrator.agent_orchestrator import AgentOrchestrator
from Pixi.core.orchestrator.task_router import AgentTask
from Pixi.memory.memory_system import MemorySystem
from Pixi.skills.skill_registry import SkillRegistry, SkillNotFoundError
from Pixi.system_bus.bus_core import SystemBus
from Pixi.uci.command_parser import ParsedCommand, UnifiedCommandParser
from Pixi.uci.command_router import CommandRoute, RoutingPlan, UnifiedCommandRouter
from Pixi.uci.device_manager import DeviceManager


@dataclass(slots=True)
class RouteExecutionResult:
    route_id: str
    success: bool
    executor: str
    summary: str
    output: Any = None
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "route_id": self.route_id,
            "success": self.success,
            "executor": self.executor,
            "summary": self.summary,
            "output": self.output,
            "metadata": dict(self.metadata),
        }


@dataclass(slots=True)
class ExecutionResult:
    execution_id: str
    command_id: str
    success: bool
    summary: str
    parsed_command: Dict[str, Any]
    routing_plan: Dict[str, Any]
    route_results: List[RouteExecutionResult] = field(default_factory=list)
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "execution_id": self.execution_id,
            "command_id": self.command_id,
            "success": self.success,
            "summary": self.summary,
            "created_at": self.created_at,
            "parsed_command": self.parsed_command,
            "routing_plan": self.routing_plan,
            "route_results": [result.to_dict() for result in self.route_results],
            "metadata": dict(self.metadata),
        }

    def to_json(self) -> str:
        return json.dumps(self.to_dict(), ensure_ascii=True, indent=2)


class UnifiedCommandExecutionEngine:
    """Execute parsed Pixi commands across skills, agents, and devices."""

    def __init__(
        self,
        memory: MemorySystem | None = None,
        skill_registry: SkillRegistry | None = None,
        orchestrator: AgentOrchestrator | None = None,
        device_manager: DeviceManager | None = None,
        parser: UnifiedCommandParser | None = None,
        router: UnifiedCommandRouter | None = None,
        system_bus: SystemBus | None = None,
    ) -> None:
        self._memory = memory or MemorySystem()
        self._skill_registry = skill_registry or SkillRegistry()
        self._orchestrator = orchestrator
        self._device_manager = device_manager or DeviceManager(self._memory)
        self._parser = parser or UnifiedCommandParser()
        self._router = router or UnifiedCommandRouter(
            device_manager=self._device_manager,
            skill_registry=self._skill_registry,
        )
        self._bus = system_bus
        self._execution_counter = 0

    @property
    def parser(self) -> UnifiedCommandParser:
        return self._parser

    @property
    def router(self) -> UnifiedCommandRouter:
        return self._router

    def preview(self, text: str) -> Dict[str, Any]:
        parsed = self._parser.parse(text)
        routing = self._router.route(parsed)
        return {
            "parsed_command": parsed.to_dict(),
            "routing_plan": routing.to_dict(),
        }

    def execute_text(self, text: str, metadata: Optional[Dict[str, Any]] = None) -> ExecutionResult:
        parsed = self._parser.parse(text)
        self._publish("commands.received", {"text": text, "command_id": parsed.command_id})
        return self.execute_parsed(parsed, metadata=metadata)

    def execute_parsed(
        self,
        parsed_command: ParsedCommand,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> ExecutionResult:
        routing_plan = self._router.route(parsed_command)
        route_results: List[RouteExecutionResult] = []

        for route in routing_plan.routes:
            action = self._find_action(parsed_command, route.action_id)
            route_results.append(self._execute_route(route, action, metadata or {}))

        success = all(result.success for result in route_results) if route_results else False
        summary = self._build_summary(parsed_command, routing_plan, route_results)
        result = ExecutionResult(
            execution_id=self._next_id(),
            command_id=parsed_command.command_id,
            success=success,
            summary=summary,
            parsed_command=parsed_command.to_dict(),
            routing_plan=routing_plan.to_dict(),
            route_results=route_results,
            metadata=dict(metadata or {}),
        )
        self._record_execution(result)
        self._publish("commands.completed", {"execution_id": result.execution_id, "command_id": result.command_id, "success": result.success})
        return result

    def execute(self, text: str, metadata: Optional[Dict[str, Any]] = None) -> str:
        return self.execute_text(text, metadata=metadata).summary

    def submit(self, text: str, metadata: Optional[Dict[str, Any]] = None) -> ExecutionResult:
        return self.execute_text(text, metadata=metadata)

    def _execute_route(
        self,
        route: CommandRoute,
        action: Any,
        metadata: Dict[str, Any],
    ) -> RouteExecutionResult:
        payload = dict(getattr(action, "parameters", {}) or {})
        payload.update(
            {
                "action_text": getattr(action, "raw_text", route.reason),
                "intent": route.intent,
                "target": route.metadata.get("target"),
                "route_id": route.route_id,
                "command_id": route.command_id,
            }
        )
        payload.update(metadata)

        try:
            if route.executor == "skill" and route.skill_name:
                output = self._skill_registry.execute_skill_raw(route.skill_name, payload)
                return RouteExecutionResult(
                    route_id=route.route_id,
                    success=True,
                    executor=route.executor,
                    summary=f"Skill '{route.skill_name}' executed for {route.intent}.",
                    output=output,
                    metadata={"skill_name": route.skill_name, "device_id": route.device_id},
                )

            if route.executor == "orchestrator" and self._orchestrator is not None:
                return self._execute_with_orchestrator(route, action, payload)

            if route.executor == "device":
                return self._execute_on_device(route, action, payload)

            if route.executor == "api":
                return self._execute_api_route(route, action, payload)

            return self._execute_with_orchestrator(route, action, payload)
        except SkillNotFoundError as exc:
            return RouteExecutionResult(
                route_id=route.route_id,
                success=False,
                executor=route.executor,
                summary=f"Skill execution failed: {exc}",
                output={"error": str(exc)},
                metadata={"skill_name": route.skill_name},
            )
        except Exception as exc:  # noqa: BLE001
            return RouteExecutionResult(
                route_id=route.route_id,
                success=False,
                executor=route.executor,
                summary=f"Execution failed: {exc}",
                output={"error": str(exc)},
                metadata={"route": route.to_dict()},
            )

    def _execute_with_orchestrator(
        self,
        route: CommandRoute,
        action: Any,
        payload: Dict[str, Any],
    ) -> RouteExecutionResult:
        if self._orchestrator is None:
            return self._execute_on_device(route, action, payload)

        task = AgentTask(
            task_id=f"uci-{route.route_id}",
            title=getattr(action, "verb", route.intent),
            description=getattr(action, "raw_text", route.reason),
            metadata={
                "uci_route": route.to_dict(),
                "payload": payload,
            },
        )
        record = self._orchestrator.execute_task(task)
        return RouteExecutionResult(
            route_id=route.route_id,
            success=record.success,
            executor="orchestrator",
            summary=record.summary,
            output=record.artifacts,
            metadata={
                "agent": record.selected_agent,
                "confidence": record.confidence,
                "reason": record.reason,
            },
        )

    def _execute_on_device(
        self,
        route: CommandRoute,
        action: Any,
        payload: Dict[str, Any],
    ) -> RouteExecutionResult:
        device = self._device_manager.get_device(route.device_id) if route.device_id else None
        output = {
            "device_id": route.device_id,
            "device_kind": route.device_kind,
            "status": "queued",
            "intent": route.intent,
            "payload": payload,
        }
        if device is not None:
            output["device_name"] = device.name
            output["status"] = "ready"
        return RouteExecutionResult(
            route_id=route.route_id,
            success=True,
            executor="device",
            summary=f"{route.device_kind.title()} command prepared for '{getattr(action, 'raw_text', route.intent)}'.",
            output=output,
            metadata={"device_id": route.device_id, "requires_confirmation": route.requires_confirmation},
        )

    def _execute_api_route(
        self,
        route: CommandRoute,
        action: Any,
        payload: Dict[str, Any],
    ) -> RouteExecutionResult:
        output = {
            "endpoint": payload.get("endpoint_or_subject") or payload.get("url") or route.reason,
            "status": "queued",
            "payload": payload,
        }
        return RouteExecutionResult(
            route_id=route.route_id,
            success=True,
            executor="api",
            summary=f"API action prepared for '{getattr(action, 'raw_text', route.intent)}'.",
            output=output,
            metadata={"target_device": route.device_id, "skill_name": route.skill_name},
        )

    @staticmethod
    def _find_action(parsed_command: ParsedCommand, action_id: str) -> Any:
        for action in parsed_command.actions:
            if action.action_id == action_id:
                return action
        raise ValueError(f"Action '{action_id}' not found in parsed command.")

    @staticmethod
    def _build_summary(
        parsed_command: ParsedCommand,
        routing_plan: RoutingPlan,
        route_results: List[RouteExecutionResult],
    ) -> str:
        successes = sum(1 for result in route_results if result.success)
        total = len(route_results)
        intents = ", ".join(sorted({route.intent for route in routing_plan.routes})) or parsed_command.primary_intent
        return f"Executed {successes}/{total} route(s) for {intents}."

    def _record_execution(self, result: ExecutionResult) -> None:
        self._memory.save(
            "uci_last_execution",
            {
                "execution_id": result.execution_id,
                "command_id": result.command_id,
                "success": result.success,
                "summary": result.summary,
                "created_at": result.created_at,
            },
        )

    def handle_bus_message(self, message: Dict[str, Any]) -> Dict[str, Any]:
        topic = str(message.get("topic", "")).lower()
        payload = dict(message.get("payload", {}))
        if topic in {"commands.request", "uci.execute", "command.execute"}:
            text = str(payload.get("text", payload.get("command", "")))
            result = self.execute_text(text, metadata=dict(payload.get("metadata", {})))
            return {"execution_id": result.execution_id, "success": result.success, "summary": result.summary}
        if topic in {"commands.preview", "uci.preview"}:
            text = str(payload.get("text", payload.get("command", "")))
            return self.preview(text)
        return {"status": "ignored", "topic": topic}

    def _next_id(self) -> str:
        self._execution_counter += 1
        return f"execution-{self._execution_counter}"

    def _publish(self, topic: str, payload: Dict[str, Any]) -> None:
        if self._bus is None:
            return
        self._bus.publish_event(
            event_type=topic,
            source="command_interface",
            payload=payload,
            topic=topic,
            tags=["commands", "system_bus"],
        )


class UnifiedCommandInterface:
    """Facade that exposes parse, route, preview, and execute entry points."""

    def __init__(
        self,
        memory: MemorySystem | None = None,
        skill_registry: SkillRegistry | None = None,
        orchestrator: AgentOrchestrator | None = None,
        device_manager: DeviceManager | None = None,
        system_bus: SystemBus | None = None,
    ) -> None:
        self._engine = UnifiedCommandExecutionEngine(
            memory=memory,
            skill_registry=skill_registry,
            orchestrator=orchestrator,
            device_manager=device_manager,
            system_bus=system_bus,
        )

    def parse(self, text: str) -> ParsedCommand:
        return self._engine.parser.parse(text)

    def route(self, text: str) -> RoutingPlan:
        parsed = self._engine.parser.parse(text)
        return self._engine.router.route(parsed)

    def preview(self, text: str) -> Dict[str, Any]:
        return self._engine.preview(text)

    def execute(self, text: str, metadata: Optional[Dict[str, Any]] = None) -> ExecutionResult:
        return self._engine.execute_text(text, metadata=metadata)

    def submit(self, text: str, metadata: Optional[Dict[str, Any]] = None) -> ExecutionResult:
        return self.execute(text, metadata=metadata)

    def execute_json(self, text: str, metadata: Optional[Dict[str, Any]] = None) -> str:
        return self.execute(text, metadata=metadata).to_json()

    @property
    def engine(self) -> UnifiedCommandExecutionEngine:
        return self._engine


def _example_execution() -> None:
    interface = UnifiedCommandInterface()
    result = interface.execute("open chrome and search ai news")
    print(result.to_json())


if __name__ == "__main__":
    _example_execution()
