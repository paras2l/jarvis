"""Behavior controller that applies identity traits to runtime subsystems."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, Mapping, MutableMapping, Optional

from Pixi.identity_system.decision_philosophy import DecisionPhilosophy
from Pixi.identity_system.personality_profile import PersonalityProfile


@dataclass(slots=True)
class BehaviorInfluenceSummary:
    """Summary of how personality modified runtime policies."""

    reasoning_modifiers: Dict[str, Any] = field(default_factory=dict)
    goal_modifiers: Dict[str, Any] = field(default_factory=dict)
    planning_modifiers: Dict[str, Any] = field(default_factory=dict)
    action_modifiers: Dict[str, Any] = field(default_factory=dict)
    interaction_modifiers: Dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class BehaviorController:
    """Transforms subsystem policies according to personality and philosophy."""

    profile: PersonalityProfile
    philosophy: DecisionPhilosophy

    def apply_to_reasoning(
        self,
        reasoning_input: Mapping[str, Any],
        context: Optional[Mapping[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Apply identity preferences to reasoning engine inputs."""

        context = context or {}
        adapted = self.profile.with_context_adjustments(context)
        payload = dict(reasoning_input)

        payload["reasoning_style"] = adapted.reasoning_style
        payload["analysis_depth"] = self._analysis_depth(adapted)
        payload["hypothesis_breadth"] = self._hypothesis_breadth(adapted)
        payload["needs_evidence_threshold"] = round(0.5 + adapted.traits.analytical_thinking * 0.4, 3)
        payload["risk_tolerance"] = adapted.traits.risk_tolerance

        return payload

    def apply_to_goal_manager(
        self,
        goal_payload: Mapping[str, Any],
        context: Optional[Mapping[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Tune goal prioritization and decomposition style."""

        context = context or {}
        adapted = self.profile.with_context_adjustments(context)
        payload = dict(goal_payload)

        payload["prioritize_long_term"] = self.philosophy.principles.long_term_value >= 0.7
        payload["goal_risk_budget"] = round(adapted.traits.risk_tolerance, 3)
        payload["decomposition_mode"] = "stepwise" if adapted.preferences.prefers_stepwise_plans else "hybrid"
        payload["milestone_granularity"] = "fine" if adapted.traits.caution > 0.6 else "coarse"
        payload["goal_alignment_weight"] = self.philosophy.principles.goal_alignment

        return payload

    def apply_to_planning(
        self,
        planning_payload: Mapping[str, Any],
        context: Optional[Mapping[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Apply planning-time identity controls."""

        context = context or {}
        adapted = self.profile.with_context_adjustments(context)
        payload = dict(planning_payload)

        payload["planning_strategy"] = "conservative" if adapted.traits.caution > 0.7 else "balanced"
        payload["include_alternative_paths"] = adapted.preferences.include_alternatives
        payload["validation_depth"] = adapted.preferences.validation_depth
        payload["deadline_assertiveness"] = round(adapted.traits.decisiveness, 3)
        payload["fallback_required"] = adapted.preferences.uses_conservative_fallbacks

        return payload

    def apply_to_action(
        self,
        action_payload: Mapping[str, Any],
        context: Optional[Mapping[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Apply guardrails and execution behavior to action layer."""

        context = context or {}
        adapted = self.profile.with_context_adjustments(context)
        payload = self.philosophy.apply_to_action_policy(action_payload)

        payload["execution_aggressiveness"] = round(
            max(0.0, adapted.traits.decisiveness - adapted.traits.caution * 0.4),
            3,
        )
        payload["retry_policy"] = {
            "max_retries": 1 if adapted.traits.caution > 0.75 else 2,
            "backoff": "linear" if adapted.traits.persistence > 0.75 else "none",
        }
        payload["requires_precheck"] = adapted.preferences.validation_depth in {"high", "very_high"}

        return payload

    def apply_to_interaction_layer(
        self,
        interaction_payload: Mapping[str, Any],
        context: Optional[Mapping[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Apply interaction-related behavior settings."""

        context = context or {}
        adapted = self.profile.with_context_adjustments(context)
        payload = dict(interaction_payload)

        payload["explain_reasoning"] = adapted.preferences.explain_decisions
        payload["tone_bias"] = "empathetic" if adapted.traits.empathy > 0.65 else "neutral"
        payload["verbosity_bias"] = "detailed" if adapted.traits.analytical_thinking > 0.85 else "balanced"
        payload["clarity_priority"] = round((adapted.traits.analytical_thinking + adapted.traits.caution) / 2.0, 3)

        return payload

    def apply_across_stack(
        self,
        reasoning_payload: Mapping[str, Any],
        goal_payload: Mapping[str, Any],
        planning_payload: Mapping[str, Any],
        action_payload: Mapping[str, Any],
        interaction_payload: Mapping[str, Any],
        context: Optional[Mapping[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Apply consistent identity influence to all required systems."""

        context = context or {}
        reasoning_modified = self.apply_to_reasoning(reasoning_payload, context)
        goal_modified = self.apply_to_goal_manager(goal_payload, context)
        planning_modified = self.apply_to_planning(planning_payload, context)
        action_modified = self.apply_to_action(action_payload, context)
        interaction_modified = self.apply_to_interaction_layer(interaction_payload, context)

        return {
            "reasoning": reasoning_modified,
            "goal_manager": goal_modified,
            "planning": planning_modified,
            "action": action_modified,
            "interaction": interaction_modified,
            "identity_signature": self.identity_signature(context),
        }

    def identity_signature(self, context: Optional[Mapping[str, Any]] = None) -> Dict[str, Any]:
        """Create a compact signature proving consistent policy origin."""

        context = context or {}
        adapted = self.profile.with_context_adjustments(context)
        return {
            "profile": adapted.profile_name,
            "profile_version": adapted.version,
            "philosophy": self.philosophy.philosophy_name,
            "philosophy_version": self.philosophy.version,
            "risk_tolerance": round(adapted.traits.risk_tolerance, 3),
            "decisiveness": round(adapted.traits.decisiveness, 3),
            "caution": round(adapted.traits.caution, 3),
        }

    def _analysis_depth(self, profile: PersonalityProfile) -> str:
        if profile.traits.analytical_thinking > 0.85:
            return "deep"
        if profile.traits.analytical_thinking > 0.65:
            return "medium"
        return "light"

    def _hypothesis_breadth(self, profile: PersonalityProfile) -> int:
        base = 2 + int(profile.traits.creativity * 4)
        return max(2, min(6, base))

