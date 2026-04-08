"""Scenario Generator - Generates multiple possible future scenarios based on world state and context.

Creates diverse, plausible future scenarios for strategy simulation and outcome prediction.
Uses world model data, historical patterns, and probabilistic branching.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
from uuid import uuid4
import random
from enum import Enum


class ScenarioType(str, Enum):
    """Type of scenario being generated."""

    OPTIMISTIC = "optimistic"  # Best-case outcome
    PESSIMISTIC = "pessimistic"  # Worst-case outcome
    REALISTIC = "realistic"  # Most likely outcome
    ALTERNATIVE = "alternative"  # Plausible but unusual outcome


@dataclass(slots=True)
class Scenario:
    """A possible future scenario."""

    scenario_id: str = field(default_factory=lambda: str(uuid4()))
    scenario_type: ScenarioType = ScenarioType.REALISTIC
    timeline_days: int = 30
    probability: float = 0.25  # Probability of this scenario occurring
    world_state_changes: Dict[str, Any] = field(default_factory=dict)
    key_events: List[Dict[str, Any]] = field(default_factory=list)
    assumptions: List[str] = field(default_factory=list)
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class ScenarioGenerator:
    """Generates multiple plausible future scenarios.

    Scenarios serve as the basis for strategy simulation. They represent
    different possible futures based on various factors:
    - Market conditions and external factors
    - Stakeholder actions and reactions
    - Risk materializations
    - Opportunity developments
    - System state evolution

    Generates multiple scenario types:
    - Optimistic scenarios (best case)
    - Pessimistic scenarios (worst case)
    - Realistic scenarios (most likely)
    - Alternative scenarios (plausible variations)
    """

    def __init__(self) -> None:
        self._scenario_templates = self._load_scenario_templates()
        self._event_generators = self._load_event_generators()

    def generate_scenarios(
        self,
        world_state: Dict[str, Any],
        context: Dict[str, Any],
        timeline_days: int = 30,
        num_scenarios: int = 10,
    ) -> List[Dict[str, Any]]:
        """Generate multiple scenarios for simulation.

        Integration point: World Model → Scenario Generator

        Args:
            world_state: Current world state from World Model
            context: Additional context (goals, constraints)
            timeline_days: How far into future to project
            num_scenarios: Number of scenarios to generate

        Returns:
            List of scenario dictionaries with projected world states
        """
        scenarios = []

        if num_scenarios <= 0:
            return scenarios

        # Determine scenario distribution
        optimistic_count = max(1, num_scenarios // 4)
        pessimistic_count = max(1, num_scenarios // 4)
        realistic_count = max(1, num_scenarios // 2)

        # Generate each type
        scenarios.extend(
            self._generate_type_scenarios(
                world_state, context, timeline_days, ScenarioType.OPTIMISTIC, optimistic_count
            )
        )
        scenarios.extend(
            self._generate_type_scenarios(
                world_state, context, timeline_days, ScenarioType.PESSIMISTIC, pessimistic_count
            )
        )
        scenarios.extend(
            self._generate_type_scenarios(
                world_state, context, timeline_days, ScenarioType.REALISTIC, realistic_count
            )
        )

        # If we still need more, add alternatives
        if len(scenarios) < num_scenarios:
            additional_count = num_scenarios - len(scenarios)
            scenarios.extend(
                self._generate_type_scenarios(
                    world_state, context, timeline_days, ScenarioType.ALTERNATIVE, additional_count
                )
            )

        # Normalize probabilities so they sum to 1.0
        total_scenarios = len(scenarios)
        for scenario in scenarios:
            scenario["probability"] = 1.0 / total_scenarios

        return scenarios

    def _generate_type_scenarios(
        self,
        world_state: Dict[str, Any],
        context: Dict[str, Any],
        timeline_days: int,
        scenario_type: ScenarioType,
        count: int,
    ) -> List[Dict[str, Any]]:
        """Generate scenarios of a specific type."""
        scenarios = []

        for _ in range(count):
            scenario = self._create_scenario(
                world_state=world_state,
                context=context,
                timeline_days=timeline_days,
                scenario_type=scenario_type,
            )
            scenarios.append(scenario)

        return scenarios

    def _create_scenario(
        self,
        world_state: Dict[str, Any],
        context: Dict[str, Any],
        timeline_days: int,
        scenario_type: ScenarioType,
    ) -> Dict[str, Any]:
        """Create a single scenario."""
        scenario = Scenario(
            scenario_type=scenario_type,
            timeline_days=timeline_days,
        )

        # Project world state changes
        projected_state = self._project_world_state(
            world_state=world_state,
            timeline_days=timeline_days,
            scenario_type=scenario_type,
        )

        # Generate key events
        key_events = self._generate_key_events(
            world_state=world_state,
            timeline_days=timeline_days,
            scenario_type=scenario_type,
        )

        # Generate assumptions
        assumptions = self._generate_assumptions(scenario_type=scenario_type)

        return {
            "scenario_id": scenario.scenario_id,
            "scenario_type": scenario_type.value,
            "timeline_days": timeline_days,
            "probability": scenario.probability,
            "world_state_changes": projected_state,
            "key_events": key_events,
            "assumptions": assumptions,
            "created_at": scenario.created_at,
        }

    def _project_world_state(
        self,
        world_state: Dict[str, Any],
        timeline_days: int,
        scenario_type: ScenarioType,
    ) -> Dict[str, Any]:
        """Project world state changes into the future."""
        projected = {}

        # Extract key state variables and project them
        for key, value in world_state.items():
            if isinstance(value, (int, float)):
                # Project numerical values with scenario-appropriate changes
                projected[key] = self._project_numeric_value(
                    value=value,
                    timeline_days=timeline_days,
                    scenario_type=scenario_type,
                )
            elif isinstance(value, dict):
                # Recursively project nested dictionaries
                projected[key] = self._project_world_state(
                    world_state=value,
                    timeline_days=timeline_days,
                    scenario_type=scenario_type,
                )
            else:
                # Keep non-numeric, non-dict values as-is
                projected[key] = value

        return projected

    def _project_numeric_value(
        self,
        value: float,
        timeline_days: int,
        scenario_type: ScenarioType,
    ) -> float:
        """Project a numeric value into the future."""
        # Annual trending (assumes 365 days)
        daily_change_rate = 0.05 / 365  # 5% annual growth default

        # Scenario-specific multipliers
        scenario_factors = {
            ScenarioType.OPTIMISTIC: 1.5,
            ScenarioType.PESSIMISTIC: 0.5,
            ScenarioType.REALISTIC: 1.0,
            ScenarioType.ALTERNATIVE: 0.8 + random.random() * 0.4,  # 0.8-1.2
        }

        factor = scenario_factors.get(scenario_type, 1.0)
        change = value * daily_change_rate * timeline_days * factor

        # Add some randomness
        variance = change * (0.1 * random.random())
        return value + change + variance

    def _generate_key_events(
        self,
        world_state: Dict[str, Any],
        timeline_days: int,
        scenario_type: ScenarioType,
    ) -> List[Dict[str, Any]]:
        """Generate key events that might occur in this scenario."""
        events = []

        # Number of events depends on scenario type
        event_counts = {
            ScenarioType.OPTIMISTIC: random.randint(2, 4),
            ScenarioType.PESSIMISTIC: random.randint(3, 5),
            ScenarioType.REALISTIC: random.randint(2, 3),
            ScenarioType.ALTERNATIVE: random.randint(1, 3),
        }

        num_events = event_counts.get(scenario_type, 2)

        for _ in range(num_events):
            event_day = random.randint(1, timeline_days)
            event = {
                "event_id": str(uuid4()),
                "day": event_day,
                "type": random.choice(["market_shift", "opportunity", "risk", "catalyst"]),
                "description": self._generate_event_description(scenario_type),
                "impact": {
                    "severity": random.choice(["low", "medium", "high"]),
                    "affected_areas": random.sample(
                        ["market", "operations", "resources", "timeline"], k=random.randint(1, 2)
                    ),
                },
            }
            events.append(event)

        return sorted(events, key=lambda x: x["day"])

    def _generate_event_description(self, scenario_type: ScenarioType) -> str:
        """Generate a realistic event description."""
        optimistic_events = [
            "Market demand increases",
            "Key partnership secured",
            "Resource availability improves",
            "Critical risk mitigates",
            "Competitive advantage emerges",
        ]

        pessimistic_events = [
            "Market downturn occurs",
            "Key supplier fails",
            "Resource shortage develops",
            "Critical risk materializes",
            "Unexpected competition emerges",
        ]

        realistic_events = [
            "Moderate market change",
            "New information available",
            "Schedule adjustment needed",
            "Minor resource constraint",
            "Stakeholder feedback received",
        ]

        event_pools = {
            ScenarioType.OPTIMISTIC: optimistic_events,
            ScenarioType.PESSIMISTIC: pessimistic_events,
            ScenarioType.REALISTIC: realistic_events,
            ScenarioType.ALTERNATIVE: optimistic_events + pessimistic_events,
        }

        pool = event_pools.get(scenario_type, realistic_events)
        return random.choice(pool)

    def _generate_assumptions(self, scenario_type: ScenarioType) -> List[str]:
        """Generate assumptions underlying this scenario."""
        assumptions = [
            "Current market trends continue with scenario-appropriate modifications",
            "Stakeholder behavior follows historical patterns",
            "No unprecedented external shocks occur",
            "Resource availability remains consistent with projections",
        ]

        scenario_specific = {
            ScenarioType.OPTIMISTIC: [
                "Favorable conditions persist",
                "Key opportunities materialize",
                "Execution proceeds smoothly",
            ],
            ScenarioType.PESSIMISTIC: [
                "Unfavorable conditions develop",
                "Key risks materialize",
                "Execution faces obstacles",
            ],
            ScenarioType.REALISTIC: [
                "Conditions are mixed",
                "Some plans succeed, others face headwinds",
            ],
            ScenarioType.ALTERNATIVE: [
                "Unexpected conditions emerge",
                "Unusual but plausible events occur",
            ],
        }

        assumptions.extend(scenario_specific.get(scenario_type, []))
        return assumptions

    def _load_scenario_templates(self) -> Dict[str, Any]:
        """Load pre-defined scenario templates."""
        return {
            "market_conditions": ["stable", "growing", "declining", "volatile"],
            "resource_availability": ["abundant", "adequate", "constrained", "scarce"],
            "stakeholder_alignment": ["aligned", "mixed", "conflicted"],
        }

    def _load_event_generators(self) -> Dict[str, Any]:
        """Load event generation rules."""
        return {
            "market_event": {"probability": 0.3, "types": ["shift", "crash", "boom", "stagnation"]},
            "resource_event": {"probability": 0.2, "types": ["shortage", "surplus", "quality_issue"]},
            "stakeholder_event": {"probability": 0.25, "types": ["alignment", "conflict", "withdrawal"]},
        }
