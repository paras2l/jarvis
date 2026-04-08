"""Pixi Simulation Engine - Complete System Documentation.

This document provides comprehensive documentation for the Simulation Engine,
including architecture, usage, integration, and configuration.

## Table of Contents

1. Overview and Purpose
2. Architecture
3. Core Components
4. Integration Points
5. API Reference
6. Configuration
7. Examples and Recipes
8. Performance and Optimization
9. Troubleshooting
10. Contributing

---

## 1. Overview and Purpose

### What is the Simulation Engine?

The Simulation Engine enables Pixi to predict future outcomes before making
decisions. Instead of blindly executing strategies, Pixi can:

- **Simulate** strategies across multiple possible futures
- **Predict** outcomes with confidence metrics
- **Analyze** risks and identify critical failure points
- **Compare** strategies side-by-side
- **Learn** from past simulations to improve future predictions

### Why Simulation?

Decision-making without simulation is reactive and risky:
- Strategies fail unexpectedly
- Risks materialize without warning
- Opportunities are missed
- Learning is slow

With simulation, Pixi becomes proactive:
- Strategies are validated before execution
- Risks are identified and mitigated
- Better decisions come faster
- Learning accelerates

### Key Use Cases

1. **Trading & Finance**: Simulate trading strategies, optimize portfolio allocation
2. **Business Strategy**: Evaluate growth strategies, entry/exit decisions
3. **Project Planning**: Simulate project execution, identify bottlenecks
4. **Risk Management**: Stress-test strategies under adverse conditions
5. **Automation**: Evaluate robot/process automation strategies
6. **Resource Allocation**: Optimize distribution of limited resources

---

## 2. Architecture

### Overall System Architecture

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚                    REASONING ENGINE                             â”‚
â”‚  (Makes decisions based on predictions and recommendations)     â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
                              â†‘
                              â”‚ (results, rankings)
                              â”‚
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚                   SIMULATION ENGINE                             â”‚
â”‚ â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â” â”‚
â”‚ â”‚ 1. Scenario Generator                                       â”‚ â”‚
â”‚ â”‚    â””â”€ Creates 3-4 possible futures                          â”‚ â”‚
â”‚ â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤ â”‚
â”‚ â”‚ 2. Strategy Simulator                                       â”‚ â”‚
â”‚ â”‚    â””â”€ Executes strategies step-by-step in each scenario     â”‚ â”‚
â”‚ â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤ â”‚
â”‚ â”‚ 3. Outcome Predictor                                        â”‚ â”‚
â”‚ â”‚    â””â”€ Estimates results and confidence                      â”‚ â”‚
â”‚ â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤ â”‚
â”‚ â”‚ 4. Risk Analyzer                                            â”‚ â”‚
â”‚ â”‚    â””â”€ Identifies critical risks and mitigations             â”‚ â”‚
â”‚ â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤ â”‚
â”‚ â”‚ 5. Simulation Memory                                        â”‚ â”‚
â”‚ â”‚    â””â”€ Stores results and learns patterns                    â”‚ â”‚
â”‚ â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤ â”‚
â”‚ â”‚ 6. Core Orchestrator                                        â”‚ â”‚
â”‚ â”‚    â””â”€ Coordinates entire pipeline                           â”‚ â”‚
â”‚ â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜ â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
     â†‘                    â†‘                    â†‘
     â”‚                    â”‚                    â”‚
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”    â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”    â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚   WORLD    â”‚    â”‚  KNOWLEDGE  â”‚    â”‚    MEMORY    â”‚
â”‚   MODEL    â”‚    â”‚   SYSTEM    â”‚    â”‚   SYSTEM     â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜    â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜    â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

### Data Flow Through Simulation Pipeline

```
1. REQUEST
   â”œâ”€ World State (environment conditions)
   â”œâ”€ Strategies (options to evaluate)
   â”œâ”€ Timeline (how long to simulate)
   â””â”€ Num Scenarios (uncertainty levels)

2. SCENARIO GENERATION
   â”œâ”€ Generate Optimistic scenarios (best-case)
   â”œâ”€ Generate Realistic scenarios (most-likely)
   â”œâ”€ Generate Pessimistic scenarios (worst-case)
   â””â”€ Generate Alternative scenarios (unusual but plausible)

3. STRATEGY SIMULATION
   â”œâ”€ Decompose each strategy into steps
   â”œâ”€ Execute steps in each scenario
   â”œâ”€ Track state changes and dependencies
   â””â”€ Identify bottlenecks and failures

4. OUTCOME PREDICTION
   â”œâ”€ Calculate success probability per scenario
   â”œâ”€ Estimate outcome value
   â”œâ”€ Predict time to completion
   â””â”€ Aggregate across scenarios (mean, median, percentiles)

5. RISK ANALYSIS
   â”œâ”€ Identify scenario-specific risks
   â”œâ”€ Score risks (probability Ã— impact)
   â”œâ”€ Categorize risks (market, operational, technical, strategic)
   â””â”€ Recommend mitigations

6. MEMORY & LEARNING
   â”œâ”€ Store simulation result
   â”œâ”€ Compare to historical accuracy
   â”œâ”€ Learn patterns and correlations
   â””â”€ Improve future predictions

7. RESULTS
   â”œâ”€ Best strategy recommendation
   â”œâ”€ Confidence score
   â”œâ”€ Risk assessment
   â”œâ”€ Strategy rankings
   â””â”€ Reasoning context for decision engine
```

### Key Design Patterns

1. **Orchestrator Pattern**: SimulationEngine coordinates all components
2. **Pipeline Pattern**: Data flows through distinct stages
3. **Scenario-Based Testing**: Every decision evaluated against multiple futures
4. **Probabilistic Modeling**: Uncertainty represented as probability distributions
5. **Learning Integration**: Results feed back for continuous improvement

---

## 3. Core Components

### 3.1 SimulationEngine (Orchestrator)

**Purpose**: Central coordinator managing the entire simulation pipeline.

**Key Methods**:
- `simulate(world_state, strategies, ...)` - Run complete simulation
- `get_simulation_result(simulation_id)` - Retrieve cached result
- `get_reasoning_context(result)` - Extract data for reasoning engine
- `compare_strategies(result)` - Get strategy comparison data
- `get_diagnostics()` - Inspect engine state

**Example**:
```python
engine = SimulationEngine(knowledge_core=knowledge, memory_system=memory)

result = engine.simulate(
    world_state={"market": 0.7, "sentiment": 0.65},
    strategies=[{"id": "s1", "name": "Strategy 1"}],
    context={"goal": "maximize_value"},
    timeline_days=90,
    num_scenarios=10,
)

reasoning = engine.get_reasoning_context(result)
print(f"Best strategy: {reasoning['best_strategy']['name']}")
```

### 3.2 ScenarioGenerator

**Purpose**: Creates multiple plausible future scenarios for strategy testing.

**Scenario Types**:
- **Optimistic** (25%): Best-case scenarios with favorable conditions
- **Realistic** (50%): Most-likely scenarios with mixed conditions
- **Pessimistic** (15%): Worst-case scenarios with adverse conditions
- **Alternative** (10%): Unusual but plausible scenarios

**Features**:
- Generates 3-4 independent scenarios per type
- Projects numeric world state values forward
- Generates 2-5 key events per scenario
- Normalizes probabilities to sum to 1.0

**Example**:
```python
generator = ScenarioGenerator()
scenarios = generator.generate_scenarios(
    base_world_state={"market": 0.7},
    num_scenarios=12,
)

for scenario in scenarios:
    print(f"{scenario.scenario_type}: {scenario.probability:.0%}")
```

### 3.3 StrategySimulator

**Purpose**: Executes strategies step-by-step in scenario contexts.

**Key Features**:
- Decomposes strategies into executable steps
- Respects step dependencies
- Tracks state changes during execution
- Identifies bottlenecks and failure points
- Aggregates results across scenarios

**Example**:
```python
simulator = StrategySimulator()
result = simulator.simulate_strategy(
    strategy={
        "id": "s1",
        "steps": [
            {"name": "Phase 1", "duration": 7, "success_probability": 0.95},
            {"name": "Phase 2", "duration": 30, "success_probability": 0.80},
        ]
    },
    scenarios=scenarios,
)

print(f"Success rate: {result['aggregate_execution']['success_rate']:.0%}")
```

### 3.4 OutcomePredictor

**Purpose**: Predicts outcomes with probability and confidence.

**Predictions Include**:
- Success probability (0.0-1.0)
- Outcome value (expected result)
- Time to completion
- Confidence score (how certain the prediction is)

**Features**:
- Per-scenario predictions
- Aggregate statistics (mean, median, percentiles)
- Confidence calculation
- Reasoning explanations

**Example**:
```python
predictor = OutcomePredictor()
result = predictor.predict_outcomes(
    strategy=strategy,
    scenarios=scenarios,
)

print(f"Success: {result['aggregate']['success_rate']:.0%}")
print(f"Value: ${result['aggregate']['mean_outcome_value']:,.0f}")
```

### 3.5 RiskAnalyzer

**Purpose**: Identifies, quantifies, and recommends mitigations for risks.

**Risk Categories**:
- **Market Risk**: Competition, demand, economic factors
- **Operational Risk**: Resources, timeline, execution
- **Technical Risk**: Complexity, dependencies, unknowns
- **Strategic Risk**: Goal alignment, priorities, conflicts

**Features**:
- Risk scoring (probability Ã— impact)
- Identifies critical risks (severity > 0.6)
- Generates specific mitigations
- Risk aggregation and distribution analysis

**Example**:
```python
analyzer = RiskAnalyzer()
result = analyzer.analyze_strategy_risks(
    strategy=strategy,
    scenarios=scenarios,
    outcome_predictions=predictions,
)

print(f"Risk score: {result['risk_score']:.0%}")
for risk in result['identified_risks'][:3]:
    print(f"â€¢ {risk['risk_description']}")
```

### 3.6 SimulationMemory

**Purpose**: Stores results, learns from outcomes, improves predictions.

**Key Features**:
- Stores simulation results with metadata
- Records actual outcomes and compares to predictions
- Calculates prediction accuracy metrics
- Identifies patterns in historical simulations
- Generates learning insights
- Provides strategy performance baselines

**Example**:
```python
memory = SimulationMemory(external_memory_system=memory_system)

# Store result
record_id = memory.store_simulation_result(
    world_state=world_state,
    strategies=strategies,
    best_strategy=best_strategy,
)

# Record actual outcome after execution
memory.record_actual_outcome(
    simulation_id=record_id,
    actual_outcome={"outcome_value": 120, "success": True},
)

# Learn from patterns
learning = memory.learn_from_patterns()
print(f"Patterns found: {learning['patterns_found']}")
```

---

## 4. Integration Points

### 4.1 Integration with World Model Engine

**Input**: World state (environment conditions)

```python
# Get current world state from world model
world_state = world_model.get_complete_state()

# Pass to simulation engine
result = engine.simulate(
    world_state=world_state,
    strategies=strategies,
    ...
)
```

**What to Pass**:
- Current metrics (market conditions, sentiment, prices)
- Resource availability
- Constraints and limitations
- Key entities and relationships
- Uncertainty indicators

### 4.2 Integration with Knowledge System

**Input**: Entity relationships and context

```python
# Query knowledge system for context
context = knowledge.query({
    "entity_type": "strategy",
    "relationship": "requires_resource",
})

# Use in simulation
result = engine.simulate(
    world_state=world_state,
    strategies=strategies,
    context=context,
    ...
)
```

### 4.3 Integration with Memory System

**Bidirectional**: Simulation engine stores and learns

```python
# Memory system passed to simulation engine
engine = SimulationEngine(
    knowledge_core=knowledge,
    external_memory_system=memory_system,
)

# Results automatically stored
result = engine.simulate(...)  # Stores in memory

# Learn from history
pattern_learning = engine.get_diagnostics()
```

### 4.4 Integration with Reasoning Engine

**Output**: Predictions and recommendations

```python
# Run simulation
result = engine.simulate(...)

# Extract data for reasoning
reasoning_context = engine.get_reasoning_context(result)

# Pass to reasoning engine
decision = reasoning_engine.decide(reasoning_context)
```

**What Reasoning Engine Receives**:
```python
{
    'best_strategy': {
        'id': 'strategy_a',
        'name': 'Aggressive Growth',
        'success_rate': 0.75,
        'expected_value': 500000,
        'risk_score': 0.45,
    },
    'overall_confidence': 0.82,
    'strategy_rankings': [
        {'id': 's1', 'name': '...', 'score': 8.5},
        {'id': 's2', 'name': '...', 'score': 7.2},
    ],
    'risk_summary': 'Moderate risk with identified mitigations',
    'key_assumptions': [...],
    'decision_deadline': '2024-12-31',
}
```

### 4.5 Integration with Self-Improvement Engine

**Feedback Loop**: Learning improves future predictions

```
Simulation Result
      â†“
Record Prediction Accuracy
      â†“
Memory System
      â†“
Pattern Learning
      â†“
Improved Baseline Probabilities
      â†“
Next Simulation (more accurate)
```

---

## 5. API Reference

### SimulationEngine

#### `__init__(knowledge_core=None, external_memory_system=None)`

Initialize the simulation engine.

**Parameters**:
- `knowledge_core` (optional): Knowledge system for entity context
- `external_memory_system` (optional): Memory system for storage

**Returns**: SimulationEngine instance

#### `simulate(world_state, strategies, context=None, timeline_days=90, num_scenarios=12)`

Run complete simulation pipeline.

**Parameters**:
- `world_state` (dict): Current environment conditions
- `strategies` (list): Strategy objects to evaluate
- `context` (dict, optional): Additional context
- `timeline_days` (int): Simulation timeline in days
- `num_scenarios` (int): Number of scenarios to generate

**Returns**:
```python
{
    'status': 'complete',
    'scenarios_evaluated': 12,
    'strategies_analyzed': 2,
    'best_strategy': {
        'id': '...', 'name': '...', 'success_rate': 0.75, ...
    },
    'overall_confidence': 0.82,
    'risk_assessment': {...},
    'strategy_rankings': [...],
}
```

#### `get_reasoning_context(result)`

Extract data for reasoning engine.

**Parameters**:
- `result` (dict): Result from simulate()

**Returns**: Dict with best strategy, rankings, confidence, assumptions

#### `compare_strategies(result)`

Compare all evaluated strategies.

**Parameters**:
- `result` (dict): Result from simulate()

**Returns**: List of strategy comparisons with metrics

```python
[
    {
        'strategy_id': 's1',
        'strategy_name': 'Strategy A',
        'success_rate': 0.75,
        'expected_value': 500000,
        'risk_score': 0.45,
        'combined_score': 8.2,
    },
    ...
]
```

#### `get_diagnostics()`

Get engine state and diagnostics.

**Returns**: Dict with performance metrics and status

### ScenarioGenerator

#### `generate_scenarios(base_world_state, num_scenarios=12)`

Generate multiple scenarios.

**Parameters**:
- `base_world_state` (dict): Current world state
- `num_scenarios` (int): Total scenarios to generate

**Returns**: List of Scenario objects

```python
Scenario(
    id='scenario_1',
    scenario_type=ScenarioType.OPTIMISTIC,
    probability=0.25,
    timeline_days=90,
    world_state_changes={'market': 0.9},
    key_events=[...],
    assumptions={...},
)
```

### OutcomePredictor

#### `predict_outcomes(strategy, scenarios)`

Predict outcomes across scenarios.

**Parameters**:
- `strategy` (dict): Strategy to evaluate
- `scenarios` (list): List of Scenario objects

**Returns**: Dict with per-scenario and aggregate predictions

### RiskAnalyzer

#### `analyze_strategy_risks(strategy, scenarios, outcome_predictions)`

Analyze risks for a strategy.

**Parameters**:
- `strategy` (dict): Strategy to analyze
- `scenarios` (list): List of scenarios
- `outcome_predictions` (dict): Outcome predictions from predictor

**Returns**: Dict with identified risks, risk score, and mitigations

### StrategySimulator

#### `simulate_strategy(strategy, scenarios)`

Simulate strategy execution in scenarios.

**Parameters**:
- `strategy` (dict): Strategy with steps
- `scenarios` (list): List of scenarios

**Returns**: Dict with execution results per scenario and aggregates

### SimulationMemory

#### `store_simulation_result(world_state, strategies, best_strategy)`

Store simulation result.

**Parameters**:
- `world_state` (dict): World state at simulation time
- `strategies` (list): Strategies evaluated
- `best_strategy` (dict): Best strategy identified

**Returns**: Simulation record ID

#### `record_actual_outcome(simulation_id, actual_outcome)`

Record actual outcome after execution.

**Parameters**:
- `simulation_id` (str): ID from store_simulation_result()
- `actual_outcome` (dict): Actual results observed

#### `learn_from_patterns()`

Extract patterns from historical simulations.

**Returns**: Dict with patterns, insights, and recommendations

---

## 6. Configuration

### Scenario Configuration

Control scenario generation behavior:

```python
# More optimistic scenarios
num_optimistic = 25% of num_scenarios

# More realistic scenarios
num_realistic = 50% of num_scenarios

# Fewer pessimistic scenarios
num_pessimistic = 15% of num_scenarios

# Alternative scenarios
num_alternative = 10% of num_scenarios
```

### Risk Scoring

Risk severity = probability Ã— impact

Critical threshold: severity > 0.6

Risk categories and weights:
- Market Risk: 0.25 weight
- Operational Risk: 0.25 weight
- Technical Risk: 0.25 weight
- Strategic Risk: 0.25 weight

### Learning Configuration

Prediction accuracy is tracked. Records are stored:
- All results: In short-term memory
- High-confidence (>0.75): In long-term memory with higher importance weight
- Accuracy > 0.8: Used for immediate learning

---

## 7. Examples and Recipes

### Recipe 1: Basic Strategy Evaluation

```python
from Pixi.simulation_engine import SimulationEngine

# Initialize
engine = SimulationEngine()

# Prepare data
world_state = {"market": 0.7, "sentiment": 0.65}
strategies = [
    {"id": "s1", "name": "Strategy A"},
    {"id": "s2", "name": "Strategy B"},
]

# Run simulation
result = engine.simulate(
    world_state=world_state,
    strategies=strategies,
    timeline_days=90,
    num_scenarios=12,
)

# Extract best strategy
best = result["best_strategy"]
print(f"Choose: {best['name']} (Success: {best['success_rate']:.0%})")
```

### Recipe 2: Stress Testing

```python
# Test strategy under different market conditions
test_cases = [
    {"market": 0.9, "name": "Bull market"},
    {"market": 0.5, "name": "Normal market"},
    {"market": 0.2, "name": "Bear market"},
]

for test in test_cases:
    result = engine.simulate(
        world_state=test,
        strategies=strategies,
        num_scenarios=15,
    )
    print(f"{test['name']}: "
          f"Success {result['best_strategy']['success_rate']:.0%}, "
          f"Risk {result['best_strategy']['risk_score']:.0%}")
```

### Recipe 3: Learning from History

```python
# Simulate, execute, and record outcomes
for _ in range(5):
    result = engine.simulate(world_state, strategies)
    
    # Execute best strategy
    actual_outcome = execute_strategy(result['best_strategy'])
    
    # Record for learning
    memory.record_actual_outcome(result['id'], actual_outcome)

# Extract learning
patterns = memory.learn_from_patterns()
print(f"Improved prediction accuracy: {patterns['accuracy']:.0%}")
```

---

## 8. Performance and Optimization

### Execution Time

Typical execution times:
- Small (5 scenarios, 3 strategies): 100-500ms
- Medium (10 scenarios, 5 strategies): 500-2000ms
- Large (20 scenarios, 10 strategies): 2-5 seconds

### Memory Usage

Typical memory usage:
- Core components: ~50MB
- Per scenario: ~1-2MB
- Historical records: ~50KB per record

### Optimization Strategies

1. **Reduce scenarios**: Start with 5-10, increase as needed
2. **Cache results**: Don't re-simulate unchanged scenarios
3. **Parallel execution**: Run scenario simulations in parallel (future)
4. **Approximate calculations**: Use fast heuristics for large evaluations
5. **Prune strategies**: Only simulate most promising strategies

---

## 9. Troubleshooting

### Simulation Takes Too Long

**Problem**: Simulation exceeds acceptable time limits.

**Solutions**:
1. Reduce num_scenarios (try 5-8 instead of 15+)
2. Reduce num_strategies (simulate top N candidates)
3. Enable result caching (avoid re-running identical simulations)
4. Use parallel scenario generation (available in future versions)

### Low Confidence Scores

**Problem**: Overall confidence is below 0.7.

**Solutions**:
1. Increase num_scenarios for better coverage
2. Provide more complete world state information
3. Check that strategies are well-defined
4. Ensure timeline is appropriate for decisions

### Inaccurate Predictions

**Problem**: Predicted outcomes diverge significantly from actuals.

**Solutions**:
1. Record actual outcomes: `memory.record_actual_outcome()`
2. Check learning: `memory.learn_from_patterns()`
3. Verify world state accuracy (bias in assumptions?)
4. Increase success_probability estimates to be more conservative
5. Add domain-specific risk factors

### High Risk Scores with Viable Strategies

**Problem**: Risk analysis indicates strategy is too risky.

**Solutions**:
1. Add mitigation strategies to reduce identified risks
2. Adjust timeline (longer timeline = lower execution risk)
3. Decompose strategy into lower-risk stages
4. Hedge strategy with complementary approaches

### Missing Integration

**Problem**: Simulation engine can't access world model or knowledge system.

**Solutions**:
1. Ensure world model and knowledge system are initialized before engine
2. Pass systems explicitly: `SimulationEngine(knowledge_core=k, ...)`
3. Check system connectivity and imports
4. Verify required attributes exist on passed objects

---

## 10. Contributing

### Adding New Scenario Types

Extend ScenarioType enum in scenario_generator.py:

```python
class ScenarioType(Enum):
    OPTIMISTIC = "optimistic"
    REALISTIC = "realistic"
    PESSIMISTIC = "pessimistic"
    ALTERNATIVE = "alternative"
    EXTREME_BULL = "extreme_bull"  # New type
```

### Adding Custom Risk Categories

Extend risk analysis in risk_analyzer.py:

```python
risk_categories = [
    "market", "operational", "technical", "strategic",
    "regulatory",  # New category
    "reputational",  # New category
]
```

### Extending Prediction Models

Override or extend OutcomePredictor methods:

```python
def _calculate_success_probability(self, strategy, scenario):
    # Custom probability calculation
    base = strategy.get("base_success_probability", 0.5)
    # ... domain-specific adjustments ...
    return adjusted_probability
```

---

## Summary

The Simulation Engine empowers Pixi to:
âœ“ Predict outcomes before decisions
âœ“ Compare alternatives systematically
âœ“ Identify and mitigate risks
âœ“ Learn from experience
âœ“ Make better decisions faster

For complete examples, see: examples.py
For testing, see: test_simulation_engine.py
For API details, see: Inline documentation in module headers
"""

# This is documentation. To run examples:
# python Pixi/simulation_engine/examples.py
#
# To run tests:
# python -m unittest Pixi.simulation_engine.test_simulation_engine
#
# To integrate:
# from Pixi.simulation_engine import SimulationEngine
# engine = SimulationEngine(knowledge_core=k, external_memory_system=m)
# result = engine.simulate(world_state, strategies, ...)

