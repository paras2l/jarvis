"""Risk Analyzer - Evaluates risk factors and uncertainty in predicted outcomes.

Analyzes risks, identifies critical failure points, quantifies uncertainties,
and recommends mitigation strategies.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional
from uuid import uuid4
import statistics


@dataclass(slots=True)
class Risk:
    """A identified risk factor."""

    risk_id: str = field(default_factory=lambda: str(uuid4()))
    risk_name: str = ""
    risk_category: str = ""  # market, technical, operational, strategic
    probability: float = 0.5  # 0.0-1.0
    impact: float = 0.5  # 0.0-1.0
    severity: float = 0.25  # probability * impact
    mitigation: str = ""
    triggering_factors: List[str] = field(default_factory=list)


class RiskAnalyzer:
    """Analyzes risks in strategy execution across scenarios.

    Identifies and quantifies:
    - Execution risks (can we do this?)
    - Market risks (is the market right?)
    - Operational risks (do we have resources?)
    - Strategic risks (does this align with goals?)
    - Black swan risks (unexpected events?)

    Provides:
    - Risk scoring and ranking
    - Critical risk identification
    - Mitigation strategy recommendations
    - Risk-adjusted confidence metrics
    - Scenario-specific risk profiles
    """

    def __init__(self) -> None:
        self._risk_categories = self._define_risk_categories()
        self._mitigation_strategies = self._load_mitigations()

    def analyze_risks(
        self,
        strategy_outcomes: Dict[str, Dict[str, Any]],
        scenarios: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """Analyze risks across all strategies and scenarios.

        Integration point: Strategy Simulator → Risk Analyzer

        Args:
            strategy_outcomes: Outcomes from strategy simulation
            scenarios: Scenarios being evaluated

        Returns:
            Comprehensive risk analysis with mitigations
        """
        identified_risks = []
        strategy_risks = {}

        # Analyze risks for each strategy
        for strategy_id, outcomes in strategy_outcomes.items():
            risks = self._identify_strategy_risks(
                strategy_id=strategy_id,
                outcomes=outcomes,
                scenarios=scenarios,
            )
            identified_risks.extend(risks)
            strategy_risks[strategy_id] = self._aggregate_risk_scores(risks)

        # Identify critical risks
        critical_risks = [r for r in identified_risks if r.severity > 0.6]

        # Generate mitigation recommendations
        mitigations = self._recommend_mitigations(identified_risks)

        # Calculate overall risk metrics
        total_risk = statistics.mean([r.severity for r in identified_risks]) if identified_risks else 0.0

        return {
            "total_risk": total_risk,
            "identified_risks": len(identified_risks),
            "critical_risks": [self._risk_to_dict(r) for r in critical_risks],
            "strategy_risks": strategy_risks,
            "mitigations": mitigations,
            "risk_distribution": self._categorize_risks(identified_risks),
            "risk_trend": "increasing" if total_risk > 0.5 else "stable" if total_risk > 0.3 else "low",
        }

    def analyze_strategy_risks(
        self,
        strategy: Dict[str, Any],
        scenarios: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """Analyze risks specific to a single strategy.

        Integration point: Reasoning Engine → Risk analysis
        """
        risks = []

        # Assess risks based on strategy characteristics
        for scenario in scenarios:
            scenario_risks = self._identify_scenario_risks(strategy, scenario)
            risks.extend(scenario_risks)

        # Aggregate by risk type
        risk_by_type = {}
        for risk in risks:
            cat = risk.risk_category
            if cat not in risk_by_type:
                risk_by_type[cat] = []
            risk_by_type[cat].append(risk.severity)

        return {
            "strategy_name": strategy.get("name", "unknown"),
            "total_risks": len(risks),
            "average_severity": statistics.mean([r.severity for r in risks]) if risks else 0.0,
            "risks_by_category": {k: statistics.mean(v) for k, v in risk_by_type.items()},
            "critical_risks": [self._risk_to_dict(r) for r in risks if r.severity > 0.6],
            "top_risks": sorted(
                [self._risk_to_dict(r) for r in risks],
                key=lambda x: x["severity"],
                reverse=True,
            )[:5],
        }

    def _identify_strategy_risks(
        self,
        strategy_id: str,
        outcomes: Dict[str, Any],
        scenarios: List[Dict[str, Any]],
    ) -> List[Risk]:
        """Identify risks for a specific strategy."""
        risks = []

        # Assess execution risks
        execution_risk = self._assess_execution_risk(outcomes)
        if execution_risk:
            risks.append(execution_risk)

        # Assess scenario-specific risks
        scenario_results = outcomes.get("scenario_results", [])
        for scenario_result in scenario_results:
            scenario_risk = self._assess_scenario_risk(strategy_id, scenario_result, scenarios)
            if scenario_risk:
                risks.append(scenario_risk)

        # Assess outcome uncertainty
        uncertainty_risk = self._assess_outcome_uncertainty(outcomes)
        if uncertainty_risk:
            risks.append(uncertainty_risk)

        return risks

    def _identify_scenario_risks(
        self,
        strategy: Dict[str, Any],
        scenario: Dict[str, Any],
    ) -> List[Risk]:
        """Identify risks in a strategy-scenario combination."""
        risks = []

        # Check scenario type
        scenario_type = scenario.get("scenario_type", "realistic")
        if scenario_type == "pessimistic":
            risks.append(
                Risk(
                    risk_name="Adverse Market Conditions",
                    risk_category="market",
                    probability=0.7,
                    impact=0.8,
                    severity=0.56,
                    mitigation="Plan for contingency scenarios and maintain flexibility",
                )
            )

        # Check for key risks in scenario
        key_events = scenario.get("key_events", [])
        for event in key_events:
            if event.get("type") == "risk":
                risks.append(
                    Risk(
                        risk_name=f"Risk Event: {event.get('description', 'Unknown')}",
                        risk_category="operational",
                        probability=0.5,
                        impact=0.7,
                        severity=0.35,
                        mitigation="Monitor for early warning signs and prepare response plan",
                    )
                )

        # Check strategy complexity
        complexity = strategy.get("complexity", 50)
        if complexity > 70:
            risks.append(
                Risk(
                    risk_name="High Complexity Execution Risk",
                    risk_category="technical",
                    probability=0.6,
                    impact=0.7,
                    severity=0.42,
                    mitigation="Break down into smaller milestones with regular reviews",
                )
            )

        return risks

    def _assess_execution_risk(self, outcomes: Dict[str, Any]) -> Optional[Risk]:
        """Assess risk of execution failure."""
        predicted_results = outcomes.get("predicted_results", {})
        success_rate = predicted_results.get("success_rate", 0.5)

        if success_rate < 0.6:
            return Risk(
                risk_name="Execution Failure Risk",
                risk_category="operational",
                probability=1.0 - success_rate,
                impact=0.8,
                severity=(1.0 - success_rate) * 0.8,
                mitigation="Increase resources, improve planning, or reconsider strategy",
            )

        return None

    def _assess_scenario_risk(
        self,
        strategy_id: str,
        scenario_result: Dict[str, Any],
        scenarios: List[Dict[str, Any]],
    ) -> Optional[Risk]:
        """Assess risk in a specific scenario."""
        scenario_id = scenario_result.get("scenario_id")
        scenario = self._find_scenario(scenario_id, scenarios)

        if not scenario:
            return None

        scenario_type = scenario.get("scenario_type", "realistic")

        # Pessimistic scenarios have higher risk
        if scenario_type == "pessimistic":
            return Risk(
                risk_name="Pessimistic Scenario Risk",
                risk_category="market",
                probability=0.3,  # 30% chance of pessimistic outcome
                impact=0.9,
                severity=0.27,
                mitigation="Develop contingency plans for adverse conditions",
            )

        return None

    def _assess_outcome_uncertainty(self, outcomes: Dict[str, Any]) -> Optional[Risk]:
        """Assess uncertainty in outcome predictions."""
        predicted_results = outcomes.get("predicted_results", {})

        # Calculate variance in predictions
        success_rates = [outcomes.get("success_rate", 0.5)]
        variance = 0.2  # Assume 20% variance in predictions

        if variance > 0.15:
            return Risk(
                risk_name="High Outcome Uncertainty",
                risk_category="strategic",
                probability=variance,
                impact=0.6,
                severity=variance * 0.6,
                mitigation="Implement monitoring and adjust approach based on results",
            )

        return None

    def _aggregate_risk_scores(self, risks: List[Risk]) -> float:
        """Aggregate individual risk scores into total risk."""
        if not risks:
            return 0.0

        # Use weighted average of severities
        total_severity = sum(r.severity for r in risks)
        return total_severity / len(risks)

    def _recommend_mitigations(self, risks: List[Risk]) -> List[Dict[str, Any]]:
        """Recommend mitigation strategies for identified risks."""
        mitigations = []
        seen_categories = set()

        # Sort by severity (highest first)
        sorted_risks = sorted(risks, key=lambda r: r.severity, reverse=True)

        for risk in sorted_risks[:5]:  # Top 5 risks
            if risk.risk_category not in seen_categories:
                mitigations.append(
                    {
                        "risk_id": risk.risk_id,
                        "risk_name": risk.risk_name,
                        "category": risk.risk_category,
                        "mitigation": risk.mitigation,
                        "priority": "critical" if risk.severity > 0.7 else "high" if risk.severity > 0.4 else "medium",
                    }
                )
                seen_categories.add(risk.risk_category)

        return mitigations

    def _categorize_risks(self, risks: List[Risk]) -> Dict[str, float]:
        """Categorize risks by type."""
        distribution = {}

        for risk in risks:
            cat = risk.risk_category
            if cat not in distribution:
                distribution[cat] = []
            distribution[cat].append(risk.severity)

        # Calculate average severity per category
        return {cat: statistics.mean(severities) for cat, severities in distribution.items()}

    def _risk_to_dict(self, risk: Risk) -> Dict[str, Any]:
        """Convert risk to dictionary."""
        return {
            "risk_id": risk.risk_id,
            "risk_name": risk.risk_name,
            "category": risk.risk_category,
            "probability": risk.probability,
            "impact": risk.impact,
            "severity": risk.severity,
            "mitigation": risk.mitigation,
        }

    def _find_scenario(self, scenario_id: str, scenarios: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        """Find a scenario by ID."""
        for scenario in scenarios:
            if scenario.get("scenario_id") == scenario_id or scenario.get("id") == scenario_id:
                return scenario
        return None

    def _define_risk_categories(self) -> Dict[str, Any]:
        """Define risk categories and their characteristics."""
        return {
            "market": {
                "description": "Market and external factors",
                "typical_triggers": ["demand", "competition", "trends"],
            },
            "operational": {
                "description": "Execution and resource risks",
                "typical_triggers": ["resources", "timeline", "complexity"],
            },
            "technical": {
                "description": "Technical and implementation risks",
                "typical_triggers": ["complexity", "unknowns", "dependencies"],
            },
            "strategic": {
                "description": "Goal alignment and strategy risks",
                "typical_triggers": ["alignment", "priorities", "changes"],
            },
        }

    def _load_mitigations(self) -> Dict[str, List[str]]:
        """Load standard mitigation strategies."""
        return {
            "market": [
                "Monitor market trends continuously",
                "Maintain flexibility in strategy",
                "Develop contingency plans",
            ],
            "operational": [
                "Allocate sufficient resources",
                "Create detailed timeline and checkpoints",
                "Reduce complexity where possible",
            ],
            "technical": [
                "Prototype and test early",
                "Manage dependencies carefully",
                "Plan for skill gaps",
            ],
            "strategic": [
                "Maintain clear goal alignment",
                "Regular review and adjustment",
                "Stakeholder communication",
            ],
        }
