"""Jarvis AI System entrypoint.

Bootstraps the continuous brain loop and supporting stability/runtime systems.
"""

from __future__ import annotations

from dataclasses import dataclass

from jarvis_ai_system.action.action_core import ActionCore
from jarvis_ai_system.autonomy.initiative_engine.initiative_core import InitiativeCore
from jarvis_ai_system.interface.chat_interface import ChatInterface
from jarvis_ai_system.integrations.browser_automation import BrowserAutomation
from jarvis_ai_system.integrations.openai_api import OpenAIAPI
from jarvis_ai_system.integrations.supabase_client import SupabaseClient
from jarvis_ai_system.integrations.trading_api import TradingAPI
from jarvis_ai_system.integrations.youtube_api import YouTubeAPI
from jarvis_ai_system.perception.perception_core import PerceptionCore
from jarvis_ai_system.perception.system_monitor import SystemMonitor
from jarvis.core.contracts import ContextSnapshot
from jarvis.memory.memory_system import MemorySystem
from jarvis.world_model.world_state import WorldStateModel
from jarvis.reasoning_engine.reasoning_core import ReasoningCore
from jarvis.goal_manager.goal_manager import GoalManager
from jarvis.core.planner.planner_engine import PlannerEngine
from jarvis.world_model.decision_selector import DecisionSelector
from jarvis.agent_system.agent_registry import AgentRegistry
from jarvis.agent_system.agent_manager import AgentManager
from jarvis.agent_system.capability_router import CapabilityRouter
from jarvis.agent_system.agent_communication import AgentCommunicationBus
from jarvis.agent_system.task_dispatcher import TaskDispatcher
from jarvis.simulation_engine.simulation_core import SimulationEngine
from jarvis.stability_core.stability_core import SystemStabilityCore
from jarvis.brain_loop.observation_cycle import ObservationCycle
from jarvis.brain_loop.reasoning_cycle import ReasoningCycle
from jarvis.brain_loop.action_cycle import ActionCycle
from jarvis.brain_loop.reflection_cycle import ReflectionCycle
from jarvis.brain_loop.learning_cycle import LearningCycle
from jarvis.brain_loop.brain_loop_core import BrainLoopCore


@dataclass(slots=True)
class JarvisArchitecture:
    memory: MemorySystem
    perception: PerceptionCore
    system_monitor: SystemMonitor
    initiative: InitiativeCore
    action: ActionCore
    chat: ChatInterface
    openai: OpenAIAPI
    supabase: SupabaseClient
    trading: TradingAPI
    youtube: YouTubeAPI
    browser: BrowserAutomation
    stability: SystemStabilityCore
    brain_loop: BrainLoopCore


def start_jarvis() -> None:
    """Initialize the core runtime and enter the continuous cognitive loop."""

    memory = MemorySystem()
    perception = PerceptionCore()
    system_monitor = SystemMonitor()
    initiative = InitiativeCore()
    action = ActionCore()
    chat = ChatInterface()
    openai = OpenAIAPI()
    supabase = SupabaseClient()
    trading = TradingAPI()
    youtube = YouTubeAPI()
    browser = BrowserAutomation()

    world_model = WorldStateModel(memory)
    planner = PlannerEngine()
    decision_selector = DecisionSelector(memory)
    goal_manager = GoalManager(memory, planner, decision_selector)
    reasoning_core = ReasoningCore(memory, world_model)
    simulation_engine = SimulationEngine(memory_system=memory)

    registry = AgentRegistry()
    agent_manager = AgentManager(registry=registry, memory_system=memory)
    agent_manager.initialize_default_agents()
    communication = AgentCommunicationBus()
    router = CapabilityRouter(registry=registry)
    dispatcher = TaskDispatcher(registry=registry, router=router, communication=communication)

    stability = SystemStabilityCore(memory_system=memory)
    stability.configure_integrations(
        agent_manager=agent_manager,
        task_dispatcher=dispatcher,
        planning_system=planner,
        action_system=action,
        simulation_engine=simulation_engine,
        self_improvement_manager=None,
    )
    stability.start_background()

    brain_loop = BrainLoopCore(
        observation_cycle=ObservationCycle(memory=memory, world_model=world_model),
        reasoning_cycle=ReasoningCycle(
            memory=memory,
            reasoning_core=reasoning_core,
            simulation_engine=simulation_engine,
            goal_manager=goal_manager,
        ),
        action_cycle=ActionCycle(
            agent_manager=agent_manager,
            task_dispatcher=dispatcher,
            communication=communication,
            stability_core=stability,
        ),
        reflection_cycle=ReflectionCycle(memory=memory, goal_manager=goal_manager),
        learning_cycle=LearningCycle(memory=memory, improvement_manager=None),
        stability_core=stability,
    )

    architecture = JarvisArchitecture(
        memory=memory,
        perception=perception,
        system_monitor=system_monitor,
        initiative=initiative,
        action=action,
        chat=chat,
        openai=openai,
        supabase=supabase,
        trading=trading,
        youtube=youtube,
        browser=browser,
        stability=stability,
        brain_loop=brain_loop,
    )

    context = architecture.perception.observe(
        current_application="jarvis_ai_system",
        user_activity="boot",
        time_of_day="runtime",
        signals={
            "startup": True,
            "system_metrics": architecture.system_monitor.sample(),
            "initiative": architecture.initiative.run({"user_activity": "boot", "system_health": "healthy"}).suggestions,
        },
    )

    bootstrap_message = architecture.chat.format_reply(
        "Jarvis AI System initialized and entering continuous cognitive loop.",
        tone="professional",
        verbosity="concise",
    )
    architecture.supabase.upsert("runtime_bootstrap", bootstrap_message)
    architecture.openai.chat_payload([
        {"role": "system", "content": "Jarvis architecture bootstrap"},
        {"role": "user", "content": "Begin continuous operation."},
    ])
    architecture.trading.quote("JARVIS")
    architecture.youtube.upload_metadata({"event": "bootstrap"})
    architecture.browser.navigate("about:blank")

    brain_loop.start()
    try:
        while True:
            current_context = architecture.perception.observe(
                current_application=context.current_application,
                user_activity=context.user_activity,
                time_of_day=context.time_of_day,
                signals=dict(context.signals),
            )
            brain_loop.run_cycle(current_context, metadata={"mode": "foreground_bootstrap"})
    except KeyboardInterrupt:
        brain_loop.stop()


if __name__ == "__main__":
    start_jarvis()
