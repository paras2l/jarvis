"""Pixi Simulation Engine - Predictive scenario simulation and strategy evaluation.

The Simulation Engine enables Pixi to predict future outcomes before making decisions.
It simulates strategies across multiple scenarios, evaluates risks, and provides
actionable insights to the reasoning engine.

### Architecture Overview

```
World Model Engine
        â†“
  Simulation Engine
  â”œâ”€ Scenario Generator â†’ Generate possible futures
  â”œâ”€ Strategy Simulator â†’ Execute strategies in scenarios
  â”œâ”€ Outcome Predictor â†’ Predict results with confidence
  â”œâ”€ Risk Analyzer â†’ Evaluate risks and uncertainties
  â”œâ”€ Simulation Memory â†’ Learn from past results
  â””â”€ Core Orchestrator â†’ Coordinate pipeline
        â†“
  Reasoning Engine (outcome predictions, risk assessment, strategy recommendations)
```

### Core Workflow

1. **Request**: Receive world state, strategies, and timeline from reasoning engine
2. **Scenarios**: Generate 3-4 scenario types (optimistic, realistic, pessimistic, alternative)
3. **Simulate**: Execute each strategy across all scenarios
4. **Predict**: Estimate outcomes with probability and confidence scores
5. **Risk**: Analyze risks, identify critical failure points, recommend mitigations
6. **Return**: Send best strategy recommendation with confidence and reasoning

### Key Components

- **SimulationEngine**: Central orchestrator managing the complete pipeline
- **ScenarioGenerator**: Creates plausible future scenarios with events and state changes
- **StrategySimulator**: Step-by-step execution of strategies in scenario contexts
- **OutcomePredictor**: Probabilistic outcome prediction with confidence scores
- **RiskAnalyzer**: Risk quantification, critical path analysis, mitigation recommendations
- **SimulationMemory**: Historical storage and learning from past simulations

### Integration Points

**Input Providers:**
- World Model Engine â†’ World state and context
- Knowledge System â†’ Entity/relationship context
- Reasoning Engine â†’ Strategies to evaluate

**Output Consumers:**
- Reasoning Engine â† Strategy rankings and recommendations
- Memory System â† Simulation results for learning
- Self-Improvement Engine â† Performance metrics

### Features

âœ“ **Multi-scenario simulation** - Optimistic, realistic, pessimistic, alternative
âœ“ **Step-by-step execution** - Track bottlenecks and failure points
âœ“ **Probabilistic outcomes** - Success rates with confidence metrics
âœ“ **Risk analysis** - Identify critical risks and mitigations
âœ“ **Comparative evaluation** - Rank strategies by expected value and risk
âœ“ **Learning from history** - Improve predictions over time
âœ“ **Adaptive simulation** - Adjust predictions based on past accuracy
âœ“ **Executive summaries** - Brief recommendations with reasoning

### Usage Example

```python
from Pixi.simulation_engine import SimulationEngine

engine = SimulationEngine(
    knowledge_core=knowledge,
    memory_system=memory
)

# Run simulation
result = engine.simulate(
    world_state=world_model.get_state(),
    strategies=[
        {"id": "strategy_a", "name": "Aggressive growth"},
        {"id": "strategy_b", "name": "Conservative focus"},
    ],
    context={"goal": "maximize_revenue", "timeline": 90},
    timeline_days=90,
    num_scenarios=12
)

# Get results for reasoning
reasoning_context = engine.get_reasoning_context(result)
print(f"Best strategy: {reasoning_context['best_strategy']}")
print(f"Confidence: {reasoning_context['overall_confidence']:.1%}")

# Compare strategies
comparisons = engine.compare_strategies(result)
for comp in comparisons:
    print(f"{comp['strategy_id']}: "
          f"Success rate {comp['success_rate']:.1%}, "
          f"Risk {comp['risk_score']:.1%}")
```

### Performance Expectations

- Small simulation (5 scenarios, 3 strategies): ~100-500ms
- Medium simulation (10 scenarios, 5 strategies): ~500-2000ms
- Large simulation (20 scenarios, 10 strategies): ~2-5 seconds

Results are cached for fast retrieval. Memory usage grows linearly with
historical records stored (can be cleared via SimulationMemory).

### Key Concepts

**Scenario Types:**
- **Optimistic**: Best-case with favorable conditions (25% probability estimate)
- **Realistic**: Most likely outcome with mixed conditions (50% probability estimate)
- **Pessimistic**: Worst-case with adverse conditions (15% probability estimate)
- **Alternative**: Unusual but plausible outcomes (10% probability estimate)

**Risk Categories:**
- **Market Risk**: External factors, competition, demand
- **Operational Risk**: Execution, resources, timeline
- **Technical Risk**: Complexity, dependencies, unknowns
- **Strategic Risk**: Goal alignment, priorities, stakeholder conflicts

**Outcome Metrics:**
- **Success Rate**: Probability of achieving strategy objectives
- **Expected Value**: Average outcome across scenarios (weighted)
- **Time to Completion**: Estimated duration
- **Confidence**: How confident in the prediction (0.0-1.0)
"""

from __future__ import annotations

# Core components
from Pixi.simulation_engine.simulation_core import (
    SimulationEngine,
    SimulationRequest,
    SimulationResult,
    SimulationStatus,
)

from Pixi.simulation_engine.scenario_generator import (
    ScenarioGenerator,
    Scenario,
    ScenarioType,
)

from Pixi.simulation_engine.outcome_predictor import (
    OutcomePredictor,
    OutcomePrediction,
)

from Pixi.simulation_engine.risk_analyzer import (
    RiskAnalyzer,
    Risk,
)

from Pixi.simulation_engine.strategy_simulator import (
    StrategySimulator,
    StrategyStep,
    SimulationExecution,
)

from Pixi.simulation_engine.simulation_memory import (
    SimulationMemory,
    SimulationRecord,
)

__all__ = [
    # Core
    "SimulationEngine",
    "SimulationRequest",
    "SimulationResult",
    "SimulationStatus",
    # Scenario Generation
    "ScenarioGenerator",
    "Scenario",
    "ScenarioType",
    # Outcome Prediction
    "OutcomePredictor",
    "OutcomePrediction",
    # Risk Analysis
    "RiskAnalyzer",
    "Risk",
    # Strategy Simulation
    "StrategySimulator",
    "StrategyStep",
    "SimulationExecution",
    # Memory and Learning
    "SimulationMemory",
    "SimulationRecord",
]

__version__ = "1.0.0"
__doc_title__ = "Pixi Simulation Engine"
__doc_subtitle__ = "Predictive Scenario Simulation and Strategy Evaluation"

