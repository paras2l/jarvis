"""Pixi AI System entrypoint.

Bootstraps the continuous brain loop and supporting stability/runtime systems.
"""

from __future__ import annotations

from dataclasses import dataclass

from Pixi_ai_system.action.action_core import ActionCore
from Pixi_ai_system.autonomy.initiative_engine.initiative_core import InitiativeCore
from Pixi_ai_system.interface.chat_interface import ChatInterface
from Pixi_ai_system.integrations.browser_automation import BrowserAutomation
from Pixi_ai_system.integrations.openai_api import OpenAIAPI
from Pixi_ai_system.integrations.supabase_client import SupabaseClient
from Pixi_ai_system.integrations.trading_api import TradingAPI
from Pixi_ai_system.integrations.youtube_api import YouTubeAPI
from Pixi_ai_system.perception.perception_core import PerceptionCore
from Pixi_ai_system.perception.system_monitor import SystemMonitor
from Pixi.core.contracts import ContextSnapshot
from Pixi.memory.memory_system import MemorySystem
from Pixi.world_model.world_state import WorldStateModel
from Pixi.reasoning_engine.reasoning_core import ReasoningCore
from Pixi.goal_manager.goal_manager import GoalManager
from Pixi.core.planner.planner_engine import PlannerEngine
from Pixi.world_model.decision_selector import DecisionSelector
from Pixi.agent_system.agent_registry import AgentRegistry
from Pixi.agent_system.agent_manager import AgentManager
from Pixi.agent_system.capability_router import CapabilityRouter
from Pixi.agent_system.agent_communication import AgentCommunicationBus
from Pixi.agent_system.task_dispatcher import TaskDispatcher
from Pixi.simulation_engine.simulation_core import SimulationEngine
from Pixi.stability_core.stability_core import SystemStabilityCore
from Pixi.brain_loop.observation_cycle import ObservationCycle
from Pixi.brain_loop.reasoning_cycle import ReasoningCycle
from Pixi.brain_loop.action_cycle import ActionCycle
from Pixi.brain_loop.reflection_cycle import ReflectionCycle
from Pixi.brain_loop.learning_cycle import LearningCycle
from Pixi.brain_loop.brain_loop_core import BrainLoopCore


@dataclass(slots=True)
class PixiArchitecture:
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


def start_Pixi() -> None:
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

    architecture = PixiArchitecture(
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
        current_application="Pixi_ai_system",
        user_activity="boot",
        time_of_day="runtime",
        signals={
            "startup": True,
            "system_metrics": architecture.system_monitor.sample(),
            "initiative": architecture.initiative.run({"user_activity": "boot", "system_health": "healthy"}).suggestions,
        },
    )

    bootstrap_message = architecture.chat.format_reply(
        "Pixi AI System initialized and entering continuous cognitive loop.",
        tone="professional",
        verbosity="concise",
    )
    architecture.supabase.upsert("runtime_bootstrap", bootstrap_message)
    architecture.openai.chat_payload([
        {"role": "system", "content": "Pixi architecture bootstrap"},
        {"role": "user", "content": "Begin continuous operation."},
    ])
    architecture.trading.quote("Pixi")
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
    start_Pixi()

