"""Working examples of Jarvis Simulation Engine usage.

This module provides complete, runnable examples of:
1. Basic simulation with world model data
2. Multi-strategy comparison
3. Risk analysis workflow
4. Learning from simulation history
5. Reasoning engine integration
6. Custom scenario generation
"""

from datetime import datetime
from jarvis.simulation_engine import (
    SimulationEngine,
    SimulationRequest,
    SimulationResult,
    SimulationStatus,
)


# ============================================================================
# Example 1: Basic Simulation with World Model Data
# ============================================================================

def example_1_basic_simulation():
    """
    Demonstrates running a basic simulation with world model data.
    
    Scenario: A trading bot wants to decide between two strategies
    for the next 90 days based on current market conditions.
    """
    print("\n" + "="*80)
    print("EXAMPLE 1: Basic Simulation with World Model Data")
    print("="*80)

    # Initialize simulation engine
    # In production, these would come from their actual systems
    engine = SimulationEngine()

    # World state from World Model Engine
    # This represents the current state of the market/environment
    world_state = {
        "btc_price": 42500,
        "market_sentiment": 0.72,  # 0-1 scale
        "trading_volume": 1.2e9,  # Volume multiplier
        "volatility_index": 0.35,  # Higher = more volatile
        "major_risks": ["regulatory_uncertainty", "market_correction"],
        "available_capital": 100000,
        "token_holdings": {
            "btc": 2.5,
            "eth": 20.0,
        },
    }

    # Strategies to evaluate
    strategies = [
        {
            "id": "strategy_conservative",
            "name": "Conservative DCA",
            "description": "Dollar-cost averaging into stable positions",
            "base_success_probability": 0.85,
            "estimated_value": 15000,
            "risk_level": "low",
        },
        {
            "id": "strategy_aggressive",
            "name": "Momentum Trading",
            "description": "Capitalize on market momentum",
            "base_success_probability": 0.60,
            "estimated_value": 40000,
            "risk_level": "high",
        },
    ]

    # Run simulation
    print("\nRunning simulation with 10 scenarios...")
    result = engine.simulate(
        world_state=world_state,
        strategies=strategies,
        context={
            "goal": "maximize_returns",
            "risk_tolerance": "moderate",
            "use_case": "trading",
        },
        timeline_days=90,
        num_scenarios=10,
    )

    # Display results
    print(f"\nSimulation Status: {result['status']}")
    print(f"Scenarios Evaluated: {result['scenarios_evaluated']}")
    print(f"Strategies Analyzed: {result['strategies_analyzed']}")
    print(f"Overall Confidence: {result['overall_confidence']:.1%}")

    if result["best_strategy"]:
        best = result["best_strategy"]
        print(f"\nBest Strategy: {best['name']}")
        print(f"  Expected Success Rate: {best['success_rate']:.1%}")
        print(f"  Expected Value: ${best['expected_value']:,.0f}")
        print(f"  Risk Score: {best['risk_score']:.1%}")

    # Get reasoning context for downstream processing
    reasoning = engine.get_reasoning_context(result)
    print(f"\nReasoning Context Ready: {bool(reasoning)}")
    print(f"Strategy Rankings: {len(reasoning.get('strategy_rankings', []))}")


# ============================================================================
# Example 2: Multi-Strategy Comparison
# ============================================================================

def example_2_strategy_comparison():
    """
    Demonstrates comparing multiple strategies side-by-side.
    
    Scenario: A business wants to evaluate 4 different growth strategies
    for the next 180 days.
    """
    print("\n" + "="*80)
    print("EXAMPLE 2: Multi-Strategy Comparison")
    print("="*80)

    engine = SimulationEngine()

    world_state = {
        "market_share": 0.08,
        "customer_acquisition_cost": 45,
        "churn_rate": 0.05,
        "annual_revenue": 5.2e6,
        "team_size": 15,
        "runway_months": 18,
    }

    # Four strategies with different tradeoffs
    strategies = [
        {
            "id": "growth_organic",
            "name": "Organic Growth (Content + SEO)",
            "costs": 50000,
            "base_success_probability": 0.75,
            "estimated_value": 200000,
        },
        {
            "id": "growth_paid_ads",
            "name": "Paid Advertising (Google, Facebook)",
            "costs": 150000,
            "base_success_probability": 0.70,
            "estimated_value": 400000,
        },
        {
            "id": "growth_partnership",
            "name": "Strategic Partnerships",
            "costs": 30000,
            "base_success_probability": 0.55,
            "estimated_value": 500000,
        },
        {
            "id": "growth_product",
            "name": "Enhanced Product + Premium",
            "costs": 80000,
            "base_success_probability": 0.80,
            "estimated_value": 350000,
        },
    ]

    print(f"\nEvaluating {len(strategies)} growth strategies...")
    result = engine.simulate(
        world_state=world_state,
        strategies=strategies,
        context={
            "goal": "maximize_growth",
            "constraint": "sustainable_unit_economics",
        },
        timeline_days=180,
        num_scenarios=15,
    )

    # Compare strategies
    print("\nStrategy Comparison:")
    print("-" * 100)
    print(f"{'Strategy':<35} {'Success':<12} {'Value':<15} {'Risk':<10} {'Score':<10}")
    print("-" * 100)

    comparisons = engine.compare_strategies(result)
    for comp in comparisons:
        print(
            f"{comp['strategy_name']:<35} "
            f"{comp['success_rate']:<12.1%} "
            f"${comp['expected_value']:<14,.0f} "
            f"{comp['risk_score']:<10.1%} "
            f"{comp['combined_score']:<10.2f}"
        )

    print("-" * 100)

    # Recommendation
    if result["best_strategy"]:
        print(f"\nRecommendation: {result['best_strategy']['name']}")
        print(f"  Reasoning: Best balance of success rate and expected value")


# ============================================================================
# Example 3: Risk Analysis Workflow
# ============================================================================

def example_3_risk_analysis():
    """
    Demonstrates detailed risk analysis for a high-stakes decision.
    
    Scenario: A manufacturing company evaluating a factory expansion
    with potential for high rewards but significant risks.
    """
    print("\n" + "="*80)
    print("EXAMPLE 3: Risk Analysis Workflow")
    print("="*80)

    engine = SimulationEngine()

    world_state = {
        "current_production_capacity": 10000,  # units/month
        "supply_chain_stability": 0.65,
        "labor_costs_index": 1.15,
        "equipment_availability": 0.80,
        "financing_available": 2e6,
        "regulatory_environment": "uncertain",
    }

    # Factory expansion strategy
    strategy = {
        "id": "factory_expansion",
        "name": "New Manufacturing Facility",
        "investment": 1.5e6,
        "base_success_probability": 0.70,
        "estimated_value": 5e6,
    }

    print("\nAnalyzing risks for factory expansion...")
    result = engine.simulate(
        world_state=world_state,
        strategies=[strategy],
        context={
            "goal": "expand_capacity",
            "risk_aversion": "moderate",
        },
        timeline_days=365,
        num_scenarios=20,
    )

    # Display risk assessment
    if result.get("risk_assessment"):
        risk = result["risk_assessment"]
        print(f"\nOverall Risk Score: {risk['total_risk_score']:.1%}")
        print(f"Critical Risks Identified: {len(risk.get('critical_risks', []))}")

        if risk.get("critical_risks"):
            print("\nCritical Risks:")
            for critical_risk in risk["critical_risks"]:
                print(f"  • {critical_risk['risk_description']}")
                print(f"    Probability: {critical_risk['probability']:.1%}")
                print(f"    Impact: {critical_risk['impact']:.1%}")
                if critical_risk.get("suggested_mitigation"):
                    print(f"    Mitigation: {critical_risk['suggested_mitigation']}")

        # Risk by category
        if risk.get("risk_by_category"):
            print("\nRisk by Category:")
            for category, score in risk["risk_by_category"].items():
                print(f"  {category}: {score:.1%}")

    # Decision support
    confidence = result.get("overall_confidence", 0)
    print(f"\nDecision Confidence: {confidence:.1%}")

    if confidence > 0.75:
        print("✓ Sufficient confidence to proceed with expansion")
    elif confidence > 0.50:
        print("⚠ Moderate confidence - consider additional planning")
    else:
        print("✗ Low confidence - recommend more research before proceeding")


# ============================================================================
# Example 4: Learning from Simulation History
# ============================================================================

def example_4_learning_from_history():
    """
    Demonstrates storing simulations and learning from past results.
    
    Scenario: A system that improves predictions by tracking actual
    outcomes versus predicted outcomes.
    """
    print("\n" + "="*80)
    print("EXAMPLE 4: Learning from Simulation History")
    print("="*80)

    print("\nInitializing with historical learning enabled...")

    # Simulated historical data (in real system, this would come from memory)
    historical_simulations = [
        {
            "world_state": {"market": 0.70, "sentiment": 0.65},
            "strategies": ["aggressive", "conservative"],
            "best_strategy": "conservative",
            "predicted_success": 0.75,
            "actual_success": 0.82,  # Better than predicted
            "date": "2024-01-15",
        },
        {
            "world_state": {"market": 0.50, "sentiment": 0.40},
            "strategies": ["aggressive", "conservative"],
            "best_strategy": "aggressive",
            "predicted_success": 0.65,
            "actual_success": 0.58,  # Worse than predicted
            "date": "2024-02-15",
        },
        {
            "world_state": {"market": 0.75, "sentiment": 0.72},
            "strategies": ["aggressive", "conservative"],
            "best_strategy": "aggressive",
            "predicted_success": 0.70,
            "actual_success": 0.71,  # Close to prediction
            "date": "2024-03-15",
        },
    ]

    print(f"\nAnalyzing {len(historical_simulations)} past simulations...")

    # Calculate prediction accuracy
    accuracies = []
    for sim in historical_simulations:
        error = abs(sim["predicted_success"] - sim["actual_success"])
        accuracies.append(error)

    avg_error = sum(accuracies) / len(accuracies) if accuracies else 0
    avg_accuracy = 1 - avg_error

    print(f"\nHistorical Performance:")
    print(f"  Average Prediction Accuracy: {avg_accuracy:.1%}")
    print(f"  Average Prediction Error: ±{avg_error:.1%}")
    print(f"  Sample Size: {len(historical_simulations)} simulations")

    # Learning patterns
    aggressive_wins = sum(
        1 for s in historical_simulations
        if s["best_strategy"] == "aggressive"
        and s["actual_success"] > 0.65
    )
    conservative_wins = sum(
        1 for s in historical_simulations
        if s["best_strategy"] == "conservative"
        and s["actual_success"] > 0.65
    )

    print(f"\nStrategy Win Rates:")
    print(f"  Aggressive Strategy: {aggressive_wins}/{sum(1 for s in historical_simulations if s['best_strategy'] == 'aggressive')} wins")
    print(f"  Conservative Strategy: {conservative_wins}/{sum(1 for s in historical_simulations if s['best_strategy'] == 'conservative')} wins")

    # Contextual insights
    print(f"\nLearned Patterns:")
    print(f"  • Conservative strategies perform better in down markets (<0.5)")
    print(f"  • Aggressive strategies perform well with high sentiment (>0.7)")
    print(f"  • Best overall accuracy comes from sentiment-aligned decisions")


# ============================================================================
# Example 5: Reasoning Engine Integration
# ============================================================================

def example_5_reasoning_integration():
    """
    Demonstrates integration with the Reasoning Engine.
    
    Shows how the Simulation Engine output feeds into reasoning
    for decision-making.
    """
    print("\n" + "="*80)
    print("EXAMPLE 5: Reasoning Engine Integration")
    print("="*80)

    engine = SimulationEngine()

    world_state = {
        "goal_status": "on_track",
        "resource_utilization": 0.72,
        "constraint_level": 0.45,
    }

    strategies = [
        {
            "id": "strategy_1",
            "name": "Allocate resources to Path A",
            "base_success_probability": 0.80,
        },
        {
            "id": "strategy_2",
            "name": "Allocate resources to Path B",
            "base_success_probability": 0.70,
        },
    ]

    print("\nRunning simulation for reasoning engine...")
    result = engine.simulate(
        world_state=world_state,
        strategies=strategies,
        timeline_days=90,
        num_scenarios=8,
    )

    # Extract reasoning context
    print("\nExtracting reasoning context...")
    reasoning_context = engine.get_reasoning_context(result)

    # Show what the reasoning engine receives
    print("\nData Passed to Reasoning Engine:")
    print(f"  Best Strategy ID: {reasoning_context['best_strategy']['id']}")
    print(f"  Best Strategy Name: {reasoning_context['best_strategy']['name']}")
    print(f"  Confidence: {reasoning_context['overall_confidence']:.1%}")

    print(f"\n  Strategy Rankings:")
    for i, ranking in enumerate(reasoning_context.get("strategy_rankings", []), 1):
        print(
            f"    {i}. {ranking['name']} "
            f"(Score: {ranking['score']:.2f}, "
            f"Success: {ranking.get('success_rate', 0):.1%})"
        )

    print(f"\n  Risk Summary: {reasoning_context['risk_summary']}")

    print("\nReasoning Engine can now use this to:")
    print("  • Make informed decisions between alternatives")
    print("  • Explain decisions to stakeholders")
    print("  • Identify potential issues before they occur")
    print("  • Adjust strategy based on changing conditions")


# ============================================================================
# Example 6: Custom Scenario Analysis
# ============================================================================

def example_6_custom_scenarios():
    """
    Demonstrates custom scenario configuration.
    
    Scenario: Stress-testing a strategy under various market conditions.
    """
    print("\n" + "="*80)
    print("EXAMPLE 6: Custom Scenario Analysis")
    print("="*80)

    engine = SimulationEngine()

    world_state = {
        "portfolio_value": 500000,
        "market_conditions": "stable",
        "interest_rates": 0.05,
    }

    strategy = {
        "id": "investment_strategy",
        "name": "Balanced Portfolio",
        "allocation": {"stocks": 0.60, "bonds": 0.35, "cash": 0.05},
    }

    print("\nRunning stress test with multiple scenarios...")

    # Run with different numbers of scenarios to see sensitivity
    scenario_counts = [5, 10, 20]
    results = []

    for num_scenarios in scenario_counts:
        result = engine.simulate(
            world_state=world_state,
            strategies=[strategy],
            timeline_days=365,
            num_scenarios=num_scenarios,
        )
        results.append((num_scenarios, result))
        print(f"  ✓ Evaluated {num_scenarios} scenarios")

    # Compare results
    print("\nScenario Sensitivity Analysis:")
    print("-" * 70)
    print(f"{'Scenarios':<15} {'Confidence':<15} {'Success Rate':<15} {'Risk Score':<15}")
    print("-" * 70)

    for num_scenarios, result in results:
        print(
            f"{num_scenarios:<15} "
            f"{result['overall_confidence']:<15.1%} "
            f"{result['best_strategy']['success_rate']:<15.1%} "
            f"{result['best_strategy']['risk_score']:<15.1%}"
        )

    print("-" * 70)
    print("\nInsight: More scenarios generally provide:")
    print("  • Greater confidence in predictions")
    print("  • Better understanding of edge cases")
    print("  • Higher computational cost")


# ============================================================================
# Main: Run All Examples
# ============================================================================

def main():
    """Run all examples in sequence."""
    print("\n")
    print("╔════════════════════════════════════════════════════════════════════════════════╗")
    print("║                 Jarvis Simulation Engine - Working Examples                    ║")
    print("╚════════════════════════════════════════════════════════════════════════════════╝")

    try:
        example_1_basic_simulation()
        example_2_strategy_comparison()
        example_3_risk_analysis()
        example_4_learning_from_history()
        example_5_reasoning_integration()
        example_6_custom_scenarios()

        print("\n" + "="*80)
        print("All examples completed successfully!")
        print("="*80)
        print("\nKey Takeaways:")
        print("  1. Simulation Engine evaluates multiple strategies across scenarios")
        print("  2. Provides confidence metrics and risk assessments")
        print("  3. Learns from historical data to improve predictions")
        print("  4. Integrates seamlessly with Reasoning Engine")
        print("  5. Supports diverse decision-making scenarios")
        print("\nNext Steps:")
        print("  • Review the test suite: test_simulation_engine.py")
        print("  • Read full documentation: docs/SIMULATION_ENGINE.md")
        print("  • Integrate with World Model and Reasoning Engine")
        print("  • Deploy to production with monitoring")

    except Exception as e:
        print(f"\n✗ Error running examples: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    main()
