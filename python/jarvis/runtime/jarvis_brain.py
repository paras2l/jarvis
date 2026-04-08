"""Main Jarvis Brain Runtime Loop orchestrating the full cognitive pipeline."""
from __future__ import annotations

from threading import Event
import time
from typing import Any, Dict, List
import uuid

from jarvis.agent_swarm_lab.swarm_controller import SwarmController
from jarvis.cognitive_budget.budget_core import BudgetCore
from jarvis.guardian_layer.guardian_core import GuardianCore
from jarvis.identity_core.identity_api import IdentityAPI
from jarvis.core.context.context_engine import ContextEngine
from jarvis.core.orchestrator.agent_orchestrator import AgentOrchestrator
from jarvis.core.orchestrator.task_router import AgentTask
from jarvis.core.planner.planner_engine import PlannerEngine
from jarvis.curiosity_engine.curiosity_core import CuriosityCore
from jarvis.evolution_system.evolution_core import EvolutionCore
from jarvis.goal_manager.goal_manager import GoalManager
from jarvis.initiative_engine.behavior_model import BehaviorModel
from jarvis.initiative_engine.initiative_detector import InitiativeDetector
from jarvis.initiative_engine.prediction_engine import PredictionEngine
from jarvis.initiative_engine.suggestion_generator import SuggestionGenerator
from jarvis.memory.memory_system import MemorySystem
from jarvis.reasoning_engine.reasoning_core import ReasoningCore
from jarvis.runtime.error_handler import RuntimeErrorHandler
from jarvis.runtime.task_queue import TaskQueue, planner_step_to_queued_task
from jarvis.self_improvement.improvement_manager import ImprovementManager
from jarvis.system_bus.bus_core import SystemBus
from jarvis.uci.execution_engine import UnifiedCommandInterface
from jarvis.skills.skill_registry import SkillRegistry
from jarvis.simulation_engine.simulation_core import SimulationEngine
from jarvis.world_model.decision_selector import DecisionSelector

class JarvisBrainRuntime:
    """Continuous brain loop coordinating all Jarvis subsystems."""

    def __init__(
        self,
        loop_interval_seconds: float = 3.0,
        max_tasks_per_cycle: int = 4,
        improve_every_n_cycles: int = 4,
        curiosity_every_n_cycles: int = 6,
        evolution_every_n_cycles: int = 9,
        swarm_every_n_cycles: int = 11,
        budget_every_n_cycles: int = 7,
        guardian_every_n_cycles: int = 5,
    ) -> None:
        self.loop_interval_seconds = max(0.5, loop_interval_seconds)
        self.max_tasks_per_cycle = max(1, max_tasks_per_cycle)
        self.improve_every_n_cycles = max(1, improve_every_n_cycles)
        self.curiosity_every_n_cycles = max(1, curiosity_every_n_cycles)
        self.evolution_every_n_cycles = max(1, evolution_every_n_cycles)
        self.swarm_every_n_cycles = max(1, swarm_every_n_cycles)
        self.budget_every_n_cycles = max(1, budget_every_n_cycles)
        self.guardian_every_n_cycles = max(1, guardian_every_n_cycles)

        self.memory = MemorySystem()
        self.system_bus = SystemBus(self.memory)
        self.skills = SkillRegistry()
        self.context_engine = ContextEngine(interval_seconds=2.5)
        self.planner = PlannerEngine(system_bus=self.system_bus)
        self.task_queue = TaskQueue()
        self.orchestrator = AgentOrchestrator(
            context_engine=self.context_engine,
            planner=self.planner,
            skill_registry=self.skills,
            memory=self.memory,
            system_bus=self.system_bus,
        )
        self.uci = UnifiedCommandInterface(
            memory=self.memory,
            skill_registry=self.skills,
            orchestrator=self.orchestrator,
            system_bus=self.system_bus,
        )
        self.behavior_model = BehaviorModel(self.memory)
        self.prediction_engine = PredictionEngine(self.memory, self.behavior_model)
        self.suggestion_generator = SuggestionGenerator(self.memory)
        self.initiative_detector = InitiativeDetector(
            context_engine=self.context_engine,
            memory=self.memory,
            behavior_model=self.behavior_model,
            prediction_engine=self.prediction_engine,
            suggestion_generator=self.suggestion_generator,
            trigger_threshold=0.62,
            cooldown_seconds=20.0,
        )
        self.world_model = DecisionSelector(self.memory)
        self.simulation_engine = SimulationEngine(memory_system=self.memory, system_bus=self.system_bus)
        self.reasoning_engine = ReasoningCore(
            memory=self.memory,
            system_bus=self.system_bus,
        )
        self.goal_manager = GoalManager(
            memory=self.memory,
            planner=self.planner,
            world_model=self.world_model,
            system_bus=self.system_bus,
        )
        self.improvement_manager = ImprovementManager(
            memory=self.memory,
            skill_registry=self.skills,
            system_bus=self.system_bus,
        )
        self.curiosity_engine = CuriosityCore(
            memory=self.memory,
            world_model=self.world_model,
            reasoning=self.reasoning_engine,
            planner=self.planner,
            system_bus=self.system_bus,
        )
        self.evolution_engine = EvolutionCore(
            memory=self.memory,
            world_model=self.world_model,
            system_bus=self.system_bus,
        )
        self.swarm_lab = SwarmController(
            memory=self.memory,
            system_bus=self.system_bus,
        )
        self.cognitive_budget = BudgetCore(
            memory=self.memory,
            system_bus=self.system_bus,
        )
        self.identity_core = IdentityAPI(
            memory=self.memory,
            system_bus=self.system_bus,
        )
        self.guardian_layer = GuardianCore(
            memory=self.memory,
            system_bus=self.system_bus,
            cognitive_budget=self.cognitive_budget,
            swarm_lab=self.swarm_lab,
            reasoning_engine=self.reasoning_engine,
            action_system=self.uci,
        )

        self.error_handler = RuntimeErrorHandler()
        self._stop_event = Event()
        self._goals: List[Dict[str, Any]] = []
        self._pending_uci_commands: List[Dict[str, Any]] = []
        self._cycle = 0

        self.system_bus.register_default_modules()
        self.system_bus.register_module(
            module_id="brain_loop",
            name="Brain Loop",
            subsystem="brain",
            capabilities=["coordination", "runtime", "cognitive_loop"],
            topics=["brain", "brain_loop", "cognition"],
            handler=self._handle_bus_message,
            status="online",
        )
        self.system_bus.register_module(
            module_id="reasoning_engine",
            name="Reasoning Engine",
            subsystem="reasoning",
            capabilities=["inference", "decision", "analysis"],
            topics=["reasoning", "reasoning_engine"],
            handler=self.reasoning_engine.handle_bus_message,
            status="online",
        )
        self.system_bus.register_module(
            module_id="planning_system",
            name="Planning System",
            subsystem="planning",
            capabilities=["task_breakdown", "scheduling", "execution_plan"],
            topics=["planning", "planner"],
            handler=self.planner.handle_bus_message,
            status="online",
        )
        self.system_bus.register_module(
            module_id="agent_system",
            name="Agent System",
            subsystem="agent",
            capabilities=["multi_agent", "task_execution", "collaboration"],
            topics=["agent", "agent_system"],
            handler=self.orchestrator.handle_bus_message,
            status="online",
        )
        self.system_bus.register_module(
            module_id="goal_manager",
            name="Goal Manager",
            subsystem="goal",
            capabilities=["goal_lifecycle", "milestones", "progress"],
            topics=["goal", "goal_manager"],
            handler=self.goal_manager.handle_bus_message,
            status="online",
        )
        self.system_bus.register_module(
            module_id="self_improvement",
            name="Self-Improvement System",
            subsystem="self_improvement",
            capabilities=["learning", "optimization", "tool_learning"],
            topics=["self_improvement", "tool_learning"],
            handler=self.improvement_manager.handle_bus_message,
            status="online",
        )
        self.system_bus.register_module(
            module_id="simulation_engine",
            name="Simulation Engine",
            subsystem="simulation",
            capabilities=["forecasting", "scenario", "risk"],
            topics=["simulation", "world_model"],
            handler=self.simulation_engine.handle_bus_message,
            status="online",
        )
        self.system_bus.register_module(
            module_id="command_interface",
            name="Command Interface",
            subsystem="interfaces",
            capabilities=["commands", "uci", "text"],
            topics=["commands", "uci"],
            handler=self.uci.engine.handle_bus_message,
            status="online",
        )
        self.system_bus.register_module(
            module_id="curiosity_engine",
            name="Curiosity Engine",
            subsystem="learning",
            capabilities=["knowledge_gap_detection", "research", "summarization", "memory_updates"],
            topics=["curiosity", "research", "learning"],
            handler=self.curiosity_engine.handle_bus_message,
            status="online",
        )
        self.system_bus.register_module(
            module_id="evolution_engine",
            name="Evolution Engine",
            subsystem="learning",
            capabilities=["capability_analysis", "feature_generation", "sandbox_validation", "safe_deployment"],
            topics=["evolution", "feature_generation", "deployment"],
            handler=self.evolution_engine.handle_bus_message,
            status="online",
        )
        self.system_bus.register_module(
            module_id="swarm_lab",
            name="Agent Swarm Lab",
            subsystem="agent",
            capabilities=["parallel_exploration", "sub_agent_swarm", "consensus_selection"],
            topics=["swarm", "parallel_agents", "consensus"],
            handler=self.swarm_lab.handle_bus_message,
            status="online",
        )
        self.system_bus.register_module(
            module_id="cognitive_budget",
            name="Cognitive Budget System",
            subsystem="resource",
            capabilities=["budget_allocation", "resource_management", "monitoring"],
            topics=["cognitive_budget", "resource"],
            handler=self._handle_budget_bus_message,
            status="online",
        )
        self.system_bus.register_module(
            module_id="identity_core",
            name="Identity and Personality Core",
            subsystem="identity",
            capabilities=["identity_management", "personality", "behavior_policy", "user_relationships"],
            topics=["identity", "personality", "behavior", "relationship"],
            handler=self._handle_identity_bus_message,
            status="online",
        )
        self.system_bus.register_module(
            module_id="guardian_layer",
            name="Guardian Layer",
            subsystem="safety",
            capabilities=["failure_detection", "loop_prevention", "repair", "rollback", "health_monitoring"],
            topics=["guardian", "guardian.alert", "guardian.repair", "guardian.health"],
            handler=self._handle_guardian_bus_message,
            status="online",
        )

    def submit_goal(self, text: str, metadata: Dict[str, Any] | None = None) -> str:
        goal = {
            "goal_id": f"goal-{uuid.uuid4().hex[:10]}",
            "text": text.strip(),
            "metadata": dict(metadata or {}),
        }
        self._goals.append(goal)
        self.memory.remember_short_term(
            key=f"brain:goal:{goal['goal_id']}",
            value={"goal": goal["text"]},
            tags=["brain", "goal"],
        )
        self.system_bus.publish_event(
            event_type="brain.goal.submitted",
            source="brain_loop",
            payload=goal,
            topic="goal.request",
            tags=["brain", "goal"],
        )
        return str(goal["goal_id"])

    def submit_command(self, text: str, metadata: Dict[str, Any] | None = None) -> str:
        command = {
            "command_id": f"uci-{uuid.uuid4().hex[:10]}",
            "text": text.strip(),
            "metadata": dict(metadata or {}),
        }
        self._pending_uci_commands.append(command)
        self.memory.remember_short_term(
            key=f"brain:uci:{command['command_id']}",
            value={"command": command["text"]},
            tags=["brain", "uci"],
        )
        self.system_bus.publish_event(
            event_type="brain.command.submitted",
            source="brain_loop",
            payload=command,
            topic="commands.request",
            tags=["brain", "commands"],
        )
        return str(command["command_id"])
    def run_forever(self) -> None:
        while not self._stop_event.is_set():
            self.run_cycle(); time.sleep(self.loop_interval_seconds)

    def stop(self) -> None:
        self._stop_event.set(); self.initiative_detector.stop(); self.context_engine.shutdown()
    def run_cycle(self) -> None:
        """Execute one full cognitive loop with crash-safe boundaries."""
        self._cycle += 1
        try:
            # 1) Observe context from the live environment.
            context = self.context_engine.collect()
            self.behavior_model.ingest_context(context)
            self.memory.remember_short_term(
                key="brain:last_context",
                value={"app": context.current_application, "activity": context.user_activity, "time": context.time_of_day},
                tags=["brain", "context"],
            )
            self.system_bus.publish_event(
                event_type="brain.context.observed",
                source="brain_loop",
                payload={"app": context.current_application, "activity": context.user_activity, "time": context.time_of_day},
                topic="brain.context",
                tags=["brain", "context"],
            )

            # 2) Interpret user intent from queued goals + observed context.
            intent_label = self._interpret_intent(context)
            self.memory.remember_short_term(
                key="brain:last_intent",
                value={"intent": intent_label, "cycle": self._cycle},
                tags=["brain", "intent"],
            )
            self.system_bus.publish_event(
                event_type="brain.intent.interpreted",
                source="brain_loop",
                payload={"intent": intent_label, "cycle": self._cycle},
                topic="brain.intent",
                tags=["brain", "intent"],
            )

            # 3) Generate planner plan and optimize via World Model before queueing.
            self._execute_pending_uci_commands()

            # 4) Generate planner plan and optimize via World Model before queueing.
            self._plan_pending_goals(context)

            # 5) Execute tasks through Agent Orchestrator (which internally uses Skills).
            self._execute_queued_tasks(intent_label)

            # 6) Update memory with cycle-level status and diagnostics.
            self.memory.remember_long_term(
                key=f"brain:cycle:{self._cycle}",
                value={"cycle": self._cycle, "intent": intent_label, "queue_size": self.task_queue.size()},
                source="jarvis_brain",
                importance=0.55,
                tags=["brain", "cycle"],
            )
            self.system_bus.publish_event(
                event_type="brain.cycle.completed",
                source="brain_loop",
                payload={"cycle": self._cycle, "intent": intent_label, "queue_size": self.task_queue.size()},
                topic="brain.cycle",
                tags=["brain", "cycle"],
            )

            # 7) Trigger initiative engine when proactive assistance may help.
            if self.task_queue.size() == 0 or self._cycle % 3 == 0:
                self.initiative_detector.evaluate_once(auto_execution_enabled=False)

            # 8) Improve: periodically run self-improvement cycle based on live context.
            if self._cycle % self.improve_every_n_cycles == 0:
                self._run_improvement_cycle(context)

            # 9) Curiosity: run bounded research cycle on schedule.
            if self._cycle % self.curiosity_every_n_cycles == 0:
                self._run_curiosity_cycle(context)

            # 10) Evolution: run safe capability-evolution cycle on schedule.
            if self._cycle % self.evolution_every_n_cycles == 0:
                self._run_evolution_cycle(context)
            # 11) Swarm lab: run bounded multi-agent exploration on schedule.
            if self._cycle % self.swarm_every_n_cycles == 0:
                self._run_swarm_cycle(context)

            # 12) Cognitive budget: monitor resources and allocate compute budgets.
            if self._cycle % self.budget_every_n_cycles == 0:
                self._run_budget_cycle()

            # 13) Guardian layer: detect failures and enforce recovery policies.
            if self._cycle % self.guardian_every_n_cycles == 0:
                self._run_guardian_cycle(context)

        except Exception as exc:  # noqa: BLE001
            self.error_handler.capture(
                component="jarvis_brain",
                operation="run_cycle",
                error=exc,
                context={"cycle": self._cycle},
            )
            self.guardian_layer.report_exception(
                source_module="jarvis_brain",
                operation="run_cycle",
                error=exc,
                context={"cycle": self._cycle},
            )
            self.system_bus.publish_event(
                event_type="brain.cycle.failed",
                source="brain_loop",
                payload={"cycle": self._cycle, "error": str(exc)},
                topic="brain.error",
                severity="error",
                tags=["brain", "error"],
            )
    def _plan_pending_goals(self, context: Any) -> None:
        incoming_goals = list(self._goals)
        self._goals.clear()

        for goal in incoming_goals:
            reasoning_report = self.reasoning_engine.reason(
                str(goal["text"]),
                context,
                queued_goals=incoming_goals,
                objective_metadata=dict(goal.get("metadata", {})),
            )

            managed_goal = self.goal_manager.create_goal_from_reasoning(
                reasoning_report,
                source_text=str(goal["text"]),
                priority=int(goal.get("metadata", {}).get("priority", 60)),
                metadata={
                    "submit_goal_id": str(goal["goal_id"]),
                    **dict(goal.get("metadata", {})),
                },
            )
            self.memory.remember_short_term(
                key=f"brain:reasoning:{managed_goal.goal_id}",
                value={
                    "reasoning_id": reasoning_report.reasoning_id,
                    "objective": reasoning_report.objective,
                    "planning_goal": reasoning_report.planning_goal,
                    "selected_strategy": reasoning_report.decision.selected_strategy_id,
                    "style": reasoning_report.decision.selected_style,
                    "confidence": reasoning_report.confidence,
                    "trace": reasoning_report.trace[:8],
                },
                tags=["brain", "reasoning"],
            )

        scheduled_plans = self.goal_manager.schedule_plans(
            context=context,
            max_goals=max(1, self.max_tasks_per_cycle),
        )

        for scheduled in scheduled_plans:
            self.memory.remember_short_term(
                key=f"brain:world_model:{scheduled.goal.goal_id}",
                value={
                    "strategy": scheduled.metadata.get("world_strategy", ""),
                    "score": scheduled.metadata.get("world_score", 0.0),
                    "milestone_id": scheduled.milestone.milestone_id,
                    "reason": scheduled.schedule.reason,
                    "plan_steps": len(scheduled.selected_plan.steps),
                },
                tags=["brain", "world_model"],
            )

            for step in scheduled.selected_plan.steps:
                step_id = (
                    f"{scheduled.goal.goal_id}:{scheduled.milestone.milestone_id}:{step.id}"
                )
                if self.task_queue.get(step_id) is not None:
                    continue

                queued = planner_step_to_queued_task(
                    goal_id=scheduled.goal.goal_id,
                    step_id=step_id,
                    description=step.description,
                    agent_role=step.agent_role,
                    skill_name=step.skill_name,
                )
                queued.metadata.update(dict(scheduled.goal.metadata))
                queued.metadata.update(
                    {
                        "milestone_id": scheduled.milestone.milestone_id,
                        "milestone_title": scheduled.milestone.title,
                        "goal_title": scheduled.goal.title,
                        "goal_priority": scheduled.goal.priority,
                        "reasoning_id": scheduled.goal.reasoning_id,
                        "reasoning_confidence": scheduled.goal.confidence,
                        "schedule_reason": scheduled.schedule.reason,
                        "world_strategy": scheduled.metadata.get("world_strategy", ""),
                        "world_score": scheduled.metadata.get("world_score", 0.0),
                    }
                )
                self.goal_manager.bind_task_to_milestone(scheduled.milestone.milestone_id, step_id)
                self.task_queue.enqueue(queued)

    def _execute_queued_tasks(self, intent_label: str) -> None:
        executed = 0
        while executed < self.max_tasks_per_cycle and self.task_queue.has_pending():
            queued = self.task_queue.dequeue()
            if queued is None:
                break

            try:
                record = self.orchestrator.execute_task(
                    AgentTask(
                        task_id=queued.task_id,
                        title=queued.title,
                        description=queued.description,
                        metadata={
                            "agent_role": queued.agent_role,
                            "skill_name": queued.skill_name,
                            **queued.metadata,
                        },
                    )
                )
                if record.success:
                    self.task_queue.mark_completed(queued.task_id)
                else:
                    self.task_queue.mark_failed(queued.task_id, error=record.summary)
                    if queued.can_retry():
                        self.task_queue.requeue(queued.task_id, new_priority=min(90, queued.priority + 8))

                self.goal_manager.update_from_task_result(
                    goal_id=queued.goal_id,
                    task_id=queued.task_id,
                    success=record.success,
                    summary=record.summary,
                    milestone_id=str(queued.metadata.get("milestone_id") or "") or None,
                )

                self.memory.remember_short_term(
                    key=f"brain:task_result:{queued.task_id}",
                    value={"success": record.success, "summary": record.summary, "intent": intent_label},
                    tags=["brain", "task_result"],
                )
            except Exception as exc:  # noqa: BLE001
                self.error_handler.capture(
                    component="jarvis_brain",
                    operation="execute_task",
                    error=exc,
                    context={"task_id": queued.task_id},
                )
                self.task_queue.mark_failed(queued.task_id, error=str(exc))
                if queued.can_retry():
                    self.task_queue.requeue(queued.task_id, new_priority=min(95, queued.priority + 10))

                self.goal_manager.update_from_task_result(
                    goal_id=queued.goal_id,
                    task_id=queued.task_id,
                    success=False,
                    summary=str(exc),
                    milestone_id=str(queued.metadata.get("milestone_id") or "") or None,
                )
            finally:
                executed += 1

    def _execute_pending_uci_commands(self) -> None:
        executed = 0
        while self._pending_uci_commands and executed < self.max_tasks_per_cycle:
            command = self._pending_uci_commands.pop(0)
            try:
                result = self.uci.execute(command["text"], metadata=command.get("metadata", {}))
                self.memory.remember_short_term(
                    key=f"brain:uci_result:{command['command_id']}",
                    value={"success": result.success, "summary": result.summary, "execution_id": result.execution_id},
                    tags=["brain", "uci", "result"],
                )
            except Exception as exc:  # noqa: BLE001
                self.error_handler.capture(
                    component="jarvis_brain",
                    operation="execute_uci_command",
                    error=exc,
                    context={"command_id": command["command_id"]},
                )
            finally:
                executed += 1

    def _run_improvement_cycle(self, context: Any) -> None:
        """Run improvement cycle in a local safety boundary.

        The outer brain loop already has global protection, but this dedicated
        boundary keeps improvement failures isolated and observable.
        """
        try:
            result = self.improvement_manager.run_cycle(
                context=context,
                force=False,
                integrate_placeholders=False,
                max_new_tools=4,
                learning_runs_per_cycle=2,
            )
            summary = self.improvement_manager.summarize_cycle(result)
            self.memory.remember_short_term(
                key=f"brain:self_improvement:{self._cycle}",
                value={"cycle": self._cycle, **summary},
                tags=["brain", "self_improvement"],
            )
            self.system_bus.publish_event(
                event_type="brain.self_improvement.completed",
                source="brain_loop",
                payload={"cycle": self._cycle, **summary},
                topic="self_improvement.cycle",
                tags=["brain", "self_improvement"],
            )
        except Exception as exc:  # noqa: BLE001
            self.error_handler.capture(
                component="jarvis_brain",
                operation="_run_improvement_cycle",
                error=exc,
                context={"cycle": self._cycle},
            )

    def _run_curiosity_cycle(self, context: Any) -> None:
        try:
            result = self.curiosity_engine.maybe_run(context=context)
            self.memory.remember_short_term(
                key=f"brain:curiosity:{self._cycle}",
                value={
                    "cycle": self._cycle,
                    "curiosity_cycle_id": result.cycle_id,
                    "triggered": result.triggered,
                    "reason": result.reason,
                },
                tags=["brain", "curiosity"],
            )
            self.system_bus.publish_event(
                event_type="brain.curiosity.completed",
                source="brain_loop",
                payload={
                    "cycle": self._cycle,
                    "curiosity_cycle_id": result.cycle_id,
                    "triggered": result.triggered,
                    "reason": result.reason,
                },
                topic="curiosity.cycle",
                tags=["brain", "curiosity"],
            )
        except Exception as exc:  # noqa: BLE001
            self.error_handler.capture(
                component="jarvis_brain",
                operation="_run_curiosity_cycle",
                error=exc,
                context={"cycle": self._cycle},
            )

    def _run_evolution_cycle(self, context: Any) -> None:
        try:
            result = self.evolution_engine.maybe_run(context=context)
            self.memory.remember_short_term(
                key=f"brain:evolution:{self._cycle}",
                value={
                    "cycle": self._cycle,
                    "evolution_cycle_id": result.cycle_id,
                    "triggered": result.triggered,
                    "reason": result.reason,
                    "deployments": len(result.deployments),
                },
                tags=["brain", "evolution"],
            )
            self.system_bus.publish_event(
                event_type="brain.evolution.completed",
                source="brain_loop",
                payload={
                    "cycle": self._cycle,
                    "evolution_cycle_id": result.cycle_id,
                    "triggered": result.triggered,
                    "reason": result.reason,
                    "deployments": len(result.deployments),
                },
                topic="evolution.cycle",
                tags=["brain", "evolution"],
            )
        except Exception as exc:  # noqa: BLE001
            self.error_handler.capture(
                component="jarvis_brain",
                operation="_run_evolution_cycle",
                error=exc,
                context={"cycle": self._cycle},
            )

    def _run_swarm_cycle(self, context: Any) -> None:
        try:
            problem = (
                f"Investigate high-impact strategy options for current app={context.current_application}, "
                f"activity={context.user_activity}, time={context.time_of_day}."
            )
            result = self.swarm_lab.run(problem=problem, context=context, force=False)
            self.memory.remember_short_term(
                key=f"brain:swarm:{self._cycle}",
                value={
                    "cycle": self._cycle,
                    "swarm_run_id": result.run_id,
                    "triggered": result.triggered,
                    "reason": result.reason,
                    "winner_role": None if result.consensus is None else result.consensus.winner_role,
                },
                tags=["brain", "swarm"],
            )
            self.system_bus.publish_event(
                event_type="brain.swarm.completed",
                source="brain_loop",
                payload={
                    "cycle": self._cycle,
                    "swarm_run_id": result.run_id,
                    "triggered": result.triggered,
                    "reason": result.reason,
                    "winner_role": None if result.consensus is None else result.consensus.winner_role,
                    "winner_score": None if result.consensus is None else result.consensus.score,
                },
                topic="swarm.run",
                tags=["brain", "swarm"],
            )
        except Exception as exc:  # noqa: BLE001
            self.error_handler.capture(
                component="jarvis_brain",
                operation="_run_swarm_cycle",
                error=exc,
                context={"cycle": self._cycle},
            )

    def _run_budget_cycle(self) -> None:
        try:
            diag = self.cognitive_budget.diagnostics()
            
            self.memory.remember_short_term(
                key=f"brain:budget:{self._cycle}",
                value={
                    "cycle": self._cycle,
                    "active_allocations": diag["active_allocations"],
                    "exceeded_allocations": diag["exceeded_allocations"],
                    "total_api_allocated": diag["total_api_allocated"],
                    "total_compute_allocated": diag["total_compute_allocated"],
                },
                tags=["brain", "cognitive_budget"],
            )
            self.system_bus.publish_event(
                event_type="brain.budget.monitored",
                source="brain_loop",
                payload={
                    "cycle": self._cycle,
                    "active_allocations": diag["active_allocations"],
                    "exceeded_allocations": diag["exceeded_allocations"],
                    "api_allocated": diag["total_api_allocated"],
                    "compute_allocated": diag["total_compute_allocated"],
                },
                topic="cognitive_budget",
                tags=["brain", "cognitive_budget"],
            )
        except Exception as exc:  # noqa: BLE001
            self.error_handler.capture(
                component="jarvis_brain",
                operation="_run_budget_cycle",
                error=exc,
                context={"cycle": self._cycle},
            )

    def _run_guardian_cycle(self, context: Any) -> None:
        try:
            result = self.guardian_layer.run_guardian_cycle(
                cycle=self._cycle,
                context={
                    "current_application": getattr(context, "current_application", "unknown"),
                    "user_activity": getattr(context, "user_activity", "unknown"),
                    "time_of_day": getattr(context, "time_of_day", "unknown"),
                },
            )
            self.memory.remember_short_term(
                key=f"brain:guardian:{self._cycle}",
                value={
                    "cycle": self._cycle,
                    "cycle_id": result.cycle_id,
                    "status": result.status,
                    "incidents": len(result.incidents),
                    "repairs": len(result.repairs),
                    "blocked": result.blocked_executions,
                },
                tags=["brain", "guardian"],
            )
        except Exception as exc:  # noqa: BLE001
            self.error_handler.capture(
                component="jarvis_brain",
                operation="_run_guardian_cycle",
                error=exc,
                context={"cycle": self._cycle},
            )

    def _handle_budget_bus_message(self, message: Dict[str, Any]) -> Dict[str, Any]:
        """Handle budget-related messages from the system bus."""
        topic = message.get("topic", "")
        payload = message.get("payload", {})
        
        if topic == "cognitive_budget.allocate":
            task_id = payload.get("task_id", f"task-{self._cycle}")
            task_desc = payload.get("task_description", "")
            context = payload.get("context")
            
            allocation = self.cognitive_budget.allocate_budget(
                task_id=task_id,
                task_description=task_desc,
                context=context,
            )
            return {
                "status": "allocated",
                "allocation_id": allocation.allocation_id,
                "complexity_score": allocation.complexity_score,
            }
        
        elif topic == "cognitive_budget.consume":
            allocation_id = payload.get("allocation_id", "")
            task_id = payload.get("task_id", "")
            
            record = self.cognitive_budget.record_consumption(
                allocation_id=allocation_id,
                task_id=task_id,
                api_calls=payload.get("api_calls", 0),
                compute_steps=payload.get("compute_steps", 0),
                reasoning_steps=payload.get("reasoning_steps", 0),
                agents_spawned=payload.get("agents_spawned", 0),
                recursion_depth=payload.get("recursion_depth", 0),
            )
            return {"status": "recorded", "record_id": record.record_id, "exceeded": record.status == "exceeded"}
        
        else:
            return {"status": "ok", "topic": topic}

    def _handle_identity_bus_message(self, message: Dict[str, Any]) -> Dict[str, Any]:
        """Handle identity-related messages from the system bus."""
        topic = message.get("topic", "")
        payload = message.get("payload", {})
        
        try:
            if topic == "identity.record_achievement":
                achievement_type = payload.get("achievement_type", "accomplishment")
                description = payload.get("description", "")
                context_data = payload.get("context")
                
                self.identity_core.record_achievement(
                    achievement_type=achievement_type,
                    description=description,
                    context=context_data,
                )
                return {"status": "recorded", "achievement_type": achievement_type}
            
            elif topic == "identity.record_learning":
                learning_desc = payload.get("description", "")
                domain = payload.get("domain", "general")
                context_data = payload.get("context")
                
                self.identity_core.record_learning(
                    description=learning_desc,
                    domain=domain,
                    learned_from=payload.get("learned_from", "interaction"),
                    context=context_data,
                )
                return {"status": "recorded", "learning_domain": domain}
            
            elif topic == "identity.update_trust":
                user_id = payload.get("user_id", "unknown")
                trust_delta = payload.get("trust_delta", 0.0)
                
                self.identity_core.update_user_trust(user_id=user_id, trust_delta=trust_delta)
                return {"status": "updated", "user_id": user_id}
            
            elif topic == "identity.update_warmth":
                user_id = payload.get("user_id", "unknown")
                warmth_delta = payload.get("warmth_delta", 0.0)
                
                self.identity_core.update_relationship_warmth(user_id=user_id, warmth_delta=warmth_delta)
                return {"status": "updated", "user_id": user_id}
            
            elif topic == "identity.check_compliance":
                action_type = payload.get("action_type", "")
                context_data = payload.get("context")
                
                is_compliant = self.identity_core.can_execute_action(
                    action_type=action_type,
                    context=context_data,
                )
                return {"status": "checked", "compliant": is_compliant}
            
            elif topic == "identity.get_context":
                user_id = payload.get("user_id", "unknown")
                
                context = self.identity_core.get_user_context(user_id=user_id)
                return {"status": "retrieved", "context": context}
            
            elif topic == "identity.get_personality":
                strategy = self.identity_core.get_communication_strategy()
                return {
                    "status": "retrieved",
                    "tone": strategy.get("tone"),
                    "verbosity": strategy.get("verbosity"),
                    "proactive": self.identity_core.should_be_proactive(),
                }
            
            else:
                return {"status": "ok", "topic": topic}
        
        except Exception as e:
            self.error_handler.capture(
                component="jarvis_brain",
                operation="_handle_identity_bus_message",
                error=e,
                context={"topic": topic},
            )
            return {"status": "error", "error": str(e)}

    def _handle_guardian_bus_message(self, message: Dict[str, Any]) -> Dict[str, Any]:
        """Handle guardian layer messages from the system bus."""
        topic = message.get("topic", "")
        payload = message.get("payload", {})

        try:
            if topic == "guardian.run_cycle":
                cycle = int(payload.get("cycle", self._cycle))
                result = self.guardian_layer.run_guardian_cycle(
                    cycle=cycle,
                    context=dict(payload.get("context", {})),
                )
                return {
                    "status": "ok",
                    "cycle_id": result.cycle_id,
                    "result_status": result.status,
                    "incidents": len(result.incidents),
                    "repairs": len(result.repairs),
                }

            if topic == "guardian.report_exception":
                error_text = str(payload.get("error", "runtime_error"))
                signal = self.guardian_layer.report_invalid_output(
                    source_module=str(payload.get("source_module", "unknown")),
                    contract_name=str(payload.get("operation", "unknown_operation")),
                    reason=error_text,
                    payload=dict(payload),
                )
                return {"status": "recorded", "signal_id": signal.signal_id, "category": signal.category}

            if topic == "guardian.report_timeout":
                signal = self.guardian_layer.report_timeout(
                    source_module=str(payload.get("source_module", "unknown")),
                    operation=str(payload.get("operation", "unknown_operation")),
                    timeout_seconds=float(payload.get("timeout_seconds", 0.0)),
                    elapsed_seconds=float(payload.get("elapsed_seconds", 0.0)),
                )
                return {"status": "recorded", "signal_id": signal.signal_id, "category": signal.category}

            if topic == "guardian.check_reasoning_guard":
                decision = self.guardian_layer.should_allow_reasoning(
                    fingerprint_hint=str(payload.get("fingerprint_hint", "reasoning:default")),
                    current_depth=int(payload.get("current_depth", 1)),
                )
                return {
                    "status": "ok",
                    "allow": decision.allow,
                    "reason": decision.reason,
                    "cooldown_seconds": decision.cooldown_seconds,
                }

            if topic == "guardian.check_spawn_guard":
                decision = self.guardian_layer.should_allow_agent_spawn(
                    fingerprint_hint=str(payload.get("fingerprint_hint", "spawn:default")),
                    current_depth=int(payload.get("current_depth", 1)),
                )
                return {
                    "status": "ok",
                    "allow": decision.allow,
                    "reason": decision.reason,
                    "max_depth_allowed": decision.max_depth_allowed,
                }

            if topic == "guardian.capture_stable_state":
                snapshot = self.guardian_layer.capture_stable_state(
                    reason=str(payload.get("reason", "manual_capture")),
                    score=float(payload.get("score", 0.82)),
                )
                return {"status": "captured", **snapshot}

            if topic == "guardian.diagnostics":
                return {"status": "ok", "diagnostics": self.guardian_layer.diagnostics()}

            return {"status": "ok", "topic": topic}

        except Exception as e:
            self.error_handler.capture(
                component="jarvis_brain",
                operation="_handle_guardian_bus_message",
                error=e,
                context={"topic": topic},
            )
            return {"status": "error", "error": str(e)}

    def _handle_bus_message(self, message: Dict[str, Any]) -> Dict[str, Any]:
        return {"status": "ok", "topic": message.get("topic", "")}

    @staticmethod
    def _interpret_intent(context: Any) -> str:
        app = str(context.current_application).lower()
        activity = str(context.user_activity).lower()
        if "trading" in app:
            return "market_analysis"
        if activity in {"development", "coding"}:
            return "software_delivery"
        if activity in {"research", "analysis"}:
            return "knowledge_discovery"
        return "general_assistance"
