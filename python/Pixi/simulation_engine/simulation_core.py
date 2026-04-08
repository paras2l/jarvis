"""Simulation Engine Core - Central controller for scenario simulation and outcome prediction.

Coordinates the simulation pipeline: world model data â†’ scenarios â†’ strategy simulation â†’
outcome prediction â†’ risk analysis â†’ results to reasoning engine.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple
from uuid import uuid4
from enum import Enum
import json
import time

from Pixi.world_model.world_model import WorldState
from Pixi.knowledge_system.knowledge_core import KnowledgeCore
from Pixi.memory.memory_system import MemorySystem
from Pixi.system_bus.bus_core import SystemBus


class SimulationStatus(str, Enum):
    """Status of a simulation run."""

    PENDING = "pending"
    SCENARIO_GENERATION = "scenario_generation"
    STRATEGY_SIMULATION = "strategy_simulation"
    OUTCOME_PREDICTION = "outcome_prediction"
    RISK_ANALYSIS = "risk_analysis"
    COMPLETE = "complete"
    FAILED = "failed"


@dataclass(slots=True)
class SimulationRequest:
    """Request for a simulation run."""

    request_id: str = field(default_factory=lambda: str(uuid4()))
    world_state: Dict[str, Any] = field(default_factory=dict)
    context: Dict[str, Any] = field(default_factory=dict)
    strategies: List[Dict[str, Any]] = field(default_factory=list)
    timeline_days: int = 30
    num_scenarios: int = 10
    confidence_threshold: float = 0.7
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


@dataclass(slots=True)
class SimulationResult:
    """Result from a complete simulation run."""

    result_id: str = field(default_factory=lambda: str(uuid4()))
    request_id: str = ""
    status: SimulationStatus = SimulationStatus.PENDING
    scenarios: List[Dict[str, Any]] = field(default_factory=list)
    strategy_outcomes: Dict[str, Dict[str, Any]] = field(default_factory=dict)
    risk_analysis: Dict[str, Any] = field(default_factory=dict)
    best_strategy: Dict[str, Any] = field(default_factory=dict)
    confidence: float = 0.0
    execution_time_ms: float = 0.0
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class SimulationEngine:
    """Central orchestrator for scenario simulation and outcome prediction.

    Manages the complete simulation pipeline:
    1. Receive request with world state and strategies
    2. Generate possible future scenarios
    3. Simulate each strategy across scenarios
    4. Predict outcomes using models
    5. Analyze risks and uncertainties
    6. Return results to reasoning engine

    Integration points:
    - World Model Engine â†’ context and world state
    - Knowledge System â†’ entity/relationship context
    - Strategy Simulator â†’ simulate strategies
    - Outcome Predictor â†’ predict results
    - Risk Analyzer â†’ evaluate uncertainty
    - Memory System â†’ store results for learning
    - Reasoning Engine â† provide simulation results
    """

    def __init__(
        self,
        knowledge_core: Optional[KnowledgeCore] = None,
        memory_system: Optional[MemorySystem] = None,
        system_bus: Optional[SystemBus] = None,
    ) -> None:
        self._knowledge = knowledge_core
        self._memory = memory_system
        self._bus = system_bus
        self._results_cache: Dict[str, SimulationResult] = {}
        self._active_simulations: Dict[str, SimulationResult] = {}

        # Import modules here to avoid circular imports
        from Pixi.simulation_engine.scenario_generator import ScenarioGenerator
        from Pixi.simulation_engine.strategy_simulator import StrategySimulator
        from Pixi.simulation_engine.outcome_predictor import OutcomePredictor
        from Pixi.simulation_engine.risk_analyzer import RiskAnalyzer
        from Pixi.simulation_engine.simulation_memory import SimulationMemory

        self._scenario_gen = ScenarioGenerator()
        self._strategy_sim = StrategySimulator()
        self._outcome_predictor = OutcomePredictor()
        self._risk_analyzer = RiskAnalyzer()
        self._sim_memory = SimulationMemory(memory_system=memory_system)

    def simulate(
        self,
        world_state: Dict[str, Any],
        strategies: List[Dict[str, Any]],
        context: Optional[Dict[str, Any]] = None,
        timeline_days: int = 30,
        num_scenarios: int = 10,
    ) -> SimulationResult:
        """Execute a complete simulation run.

        Integration point: World Model / Reasoning Engine â†’ Simulation Engine

        Args:
            world_state: Current world state from World Model
            strategies: List of strategies to simulate
            context: Additional context (goals, constraints, etc.)
            timeline_days: How far into the future to simulate
            num_scenarios: Number of scenarios to generate

        Returns:
            SimulationResult with all findings
        """
        if not strategies:
            return SimulationResult(
                status=SimulationStatus.FAILED,
                confidence=0.0,
            )

        request = SimulationRequest(
            world_state=world_state,
            strategies=strategies,
            context=context or {},
            timeline_days=timeline_days,
            num_scenarios=num_scenarios,
        )

        start_time = time.perf_counter()
        result = SimulationResult(request_id=request.request_id)
        self._active_simulations[result.result_id] = result

        try:
            # Step 1: Generate scenarios
            result.status = SimulationStatus.SCENARIO_GENERATION
            scenarios = self._scenario_gen.generate_scenarios(
                world_state=world_state,
                context=request.context,
                timeline_days=timeline_days,
                num_scenarios=num_scenarios,
            )
            result.scenarios = scenarios

            if not scenarios:
                result.status = SimulationStatus.FAILED
                return result

            # Step 2: Simulate each strategy
            result.status = SimulationStatus.STRATEGY_SIMULATION
            strategy_outcomes = {}

            for strategy in strategies:
                outcomes = self._strategy_sim.simulate_strategy(
                    strategy=strategy,
                    scenarios=scenarios,
                    world_state=world_state,
                )
                strategy_outcomes[strategy.get("id", strategy.get("name", "unknown"))] = outcomes

            result.strategy_outcomes = strategy_outcomes

            # Step 3: Predict outcomes
            result.status = SimulationStatus.OUTCOME_PREDICTION
            for strategy_id, outcomes in strategy_outcomes.items():
                predicted_results = self._outcome_predictor.predict_outcomes(
                    strategy_id=strategy_id,
                    strategy=next(s for s in strategies if s.get("id", s.get("name")) == strategy_id),
                    simulation_outcomes=outcomes,
                    scenarios=scenarios,
                )
                strategy_outcomes[strategy_id]["predicted_results"] = predicted_results

            # Step 4: Analyze risks
            result.status = SimulationStatus.RISK_ANALYSIS
            risk_analysis = self._risk_analyzer.analyze_risks(
                strategy_outcomes=strategy_outcomes,
                scenarios=scenarios,
            )
            result.risk_analysis = risk_analysis

            # Step 5: Determine best strategy
            best_strategy = self._select_best_strategy(strategy_outcomes, risk_analysis)
            result.best_strategy = best_strategy
            result.confidence = best_strategy.get("overall_confidence", 0.5)

            result.status = SimulationStatus.COMPLETE

            # Store results for learning
            self._persist_results(result)
            self._publish("simulation.completed", {"result_id": result.result_id, "confidence": result.confidence, "best_strategy": result.best_strategy})

        except Exception as e:
            result.status = SimulationStatus.FAILED
            result.risk_analysis = {"error": str(e)}
            self._publish("simulation.failed", {"result_id": result.result_id, "error": str(e)})

        finally:
            # Calculate execution time
            result.execution_time_ms = (time.perf_counter() - start_time) * 1000
            result.updated_at = datetime.now(timezone.utc).isoformat()

            # Cache result
            self._results_cache[result.result_id] = result
            if result.result_id in self._active_simulations:
                del self._active_simulations[result.result_id]

        return result

    def get_simulation_result(self, result_id: str) -> Optional[SimulationResult]:
        """Retrieve a cached simulation result.

        Integration point: Reasoning Engine â† Simulation results
        """
        return self._results_cache.get(result_id)

    def get_reasoning_context(self, simulation_result: SimulationResult) -> Dict[str, Any]:
        """Format simulation results for reasoning engine consumption.

        Integration point: Simulation Engine â†’ Reasoning Engine
        """
        return {
            "simulation_id": simulation_result.result_id,
            "status": simulation_result.status.value,
            "execution_time_ms": simulation_result.execution_time_ms,
            "scenarios_analyzed": len(simulation_result.scenarios),
            "best_strategy": simulation_result.best_strategy,
            "overall_confidence": simulation_result.confidence,
            "strategy_outcomes": self._format_strategy_outcomes(simulation_result.strategy_outcomes),
            "risk_summary": {
                "total_risk": simulation_result.risk_analysis.get("total_risk", 0.0),
                "critical_risks": simulation_result.risk_analysis.get("critical_risks", []),
                "mitigation_strategies": simulation_result.risk_analysis.get("mitigations", []),
            },
            "recommendation": self._generate_recommendation(simulation_result),
        }

    def handle_bus_message(self, message: Dict[str, Any]) -> Dict[str, Any]:
        topic = str(message.get("topic", "")).lower()
        payload = dict(message.get("payload", {}))
        if topic in {"simulation.run", "simulation.request", "world_model.simulate"}:
            result = self.simulate(
                world_state=dict(payload.get("world_state", {})),
                strategies=list(payload.get("strategies", [])),
                context=dict(payload.get("context", {})),
                timeline_days=int(payload.get("timeline_days", 30)),
                num_scenarios=int(payload.get("num_scenarios", 10)),
            )
            return {"result_id": result.result_id, "status": result.status.value, "confidence": result.confidence}
        return {"status": "ignored", "topic": topic}

    def compare_strategies(self, simulation_result: SimulationResult) -> List[Dict[str, Any]]:
        """Compare all simulated strategies.

        Integration point: Reasoning Engine â†’ Strategy comparison
        """
        comparisons = []

        for strategy_id, outcomes in simulation_result.strategy_outcomes.items():
            # Calculate aggregated metrics
            predicted = outcomes.get("predicted_results", {})
            success_rate = predicted.get("success_rate", 0.0)
            avg_outcome_value = predicted.get("avg_outcome_value", 0.0)
            risk_score = outcomes.get("risk_score", 0.5)

            comparisons.append(
                {
                    "strategy_id": strategy_id,
                    "success_rate": success_rate,
                    "expected_value": avg_outcome_value,
                    "risk_score": risk_score,
                    "scenarios_tested": len(outcomes.get("scenario_results", [])),
                    "confidence": success_rate * (1 - risk_score),
                    "recommendation": "high" if success_rate > 0.7 else "medium" if success_rate > 0.5 else "low",
                }
            )

        # Sort by confidence (success * reduced risk)
        return sorted(comparisons, key=lambda x: x.get("confidence", 0), reverse=True)

    def get_diagnostics(self) -> Dict[str, Any]:
        """Get simulation engine diagnostics.

        Integration point: Self-Improvement â†’ Simulation Engine health
        """
        return {
            "active_simulations": len(self._active_simulations),
            "cached_results": len(self._results_cache),
            "components": {
                "scenario_generator": "initialized",
                "strategy_simulator": "initialized",
                "outcome_predictor": "initialized",
                "risk_analyzer": "initialized",
                "simulation_memory": "initialized",
            },
            "memory_integration": self._memory is not None,
            "knowledge_integration": self._knowledge is not None,
        }

    def clear_results_cache(self) -> None:
        """Clear cached simulation results to free memory."""
        self._results_cache.clear()

    def _select_best_strategy(
        self,
        strategy_outcomes: Dict[str, Dict[str, Any]],
        risk_analysis: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Select the best strategy based on outcomes and risks."""
        best = None
        best_score = -1.0

        for strategy_id, outcomes in strategy_outcomes.items():
            predicted = outcomes.get("predicted_results", {})
            success_rate = predicted.get("success_rate", 0.0)
            avg_outcome_value = predicted.get("avg_outcome_value", 0.0)

            # Score: success * value, adjusted for risk
            risk_factor = 1.0 - risk_analysis.get("strategy_risks", {}).get(strategy_id, 0.5)
            score = success_rate * avg_outcome_value * risk_factor

            if score > best_score:
                best_score = score
                best = {
                    "strategy_id": strategy_id,
                    "success_rate": success_rate,
                    "expected_value": avg_outcome_value,
                    "risk_adjusted_score": score,
                    "overall_confidence": (success_rate + (1.0 - risk_factor)) / 2.0,
                }

        return best or {}

    def _format_strategy_outcomes(self, strategy_outcomes: Dict[str, Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Format strategy outcomes for transmission."""
        formatted = []

        for strategy_id, outcomes in strategy_outcomes.items():
            formatted.append(
                {
                    "strategy_id": strategy_id,
                    "avg_outcome": outcomes.get("predicted_results", {}).get("avg_outcome_value", 0.0),
                    "success_rate": outcomes.get("predicted_results", {}).get("success_rate", 0.0),
                    "scenario_count": len(outcomes.get("scenario_results", [])),
                }
            )

        return formatted

    def _generate_recommendation(self, simulation_result: SimulationResult) -> str:
        """Generate a text recommendation based on simulation results."""
        if not simulation_result.best_strategy:
            return "Unable to determine best strategy from simulations"

        confidence = simulation_result.confidence
        risk = simulation_result.risk_analysis.get("total_risk", 0.5)

        if confidence > 0.8 and risk < 0.3:
            return (
                f"Strongly recommend {simulation_result.best_strategy.get('strategy_id')} "
                f"(confidence: {confidence:.1%}, risk: {risk:.1%})"
            )
        elif confidence > 0.6:
            return (
                f"Recommend {simulation_result.best_strategy.get('strategy_id')} "
                f"(confidence: {confidence:.1%}, risk: {risk:.1%})"
            )
        else:
            return (
                f"Uncertain. {simulation_result.best_strategy.get('strategy_id')} shows "
                f"promise but confidence is moderate (confidence: {confidence:.1%})"
            )

    def _persist_results(self, result: SimulationResult) -> None:
        """Persist simulation results to memory for future learning.

        Integration point: Simulation Engine â†’ Memory System
        """
        if not self._memory:
            return

        try:
            self._memory.remember_short_term(
                key=f"simulation:result:{result.result_id}",
                value={
                    "timestamp": result.created_at,
                    "best_strategy": result.best_strategy,
                    "confidence": result.confidence,
                    "execution_time_ms": result.execution_time_ms,
                },
                tags=["simulation", "result"],
            )

            # Store long-term for high-confidence results
            if result.confidence > 0.75:
                self._memory.remember_long_term(
                    key=f"simulation:high_confidence:{result.result_id}",
                    value={
                        "best_strategy": result.best_strategy,
                        "confidence": result.confidence,
                        "scenarios": len(result.scenarios),
                    },
                    source="simulation_engine",
                    importance=result.confidence,
                    tags=["simulation", "successful"],
                )
        except Exception:
            pass  # Graceful degradation if memory system unavailable

    def _publish(self, topic: str, payload: Dict[str, Any]) -> None:
        if self._bus is None:
            return
        self._bus.publish_event(
            event_type=topic,
            source="simulation_engine",
            payload=payload,
            topic=topic,
            tags=["simulation", "system_bus"],
        )

