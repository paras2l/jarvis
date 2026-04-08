"""Decision philosophy for Pixi identity system.

Encodes stable principles used to evaluate options consistently across
reasoning, planning, and action layers.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, Iterable, List, Mapping, Optional, Sequence


@dataclass(slots=True)
class DecisionPrinciples:
    """Core principles with relative weights for decision scoring."""

    safety_first: float = 0.95
    goal_alignment: float = 0.9
    evidence_strength: float = 0.85
    long_term_value: float = 0.8
    efficiency: float = 0.7
    adaptability: float = 0.75

    def as_weights(self) -> Dict[str, float]:
        return {
            "safety_first": self.safety_first,
            "goal_alignment": self.goal_alignment,
            "evidence_strength": self.evidence_strength,
            "long_term_value": self.long_term_value,
            "efficiency": self.efficiency,
            "adaptability": self.adaptability,
        }


@dataclass(slots=True)
class EthicalConstraints:
    """Ethical and operational boundaries for allowable decisions."""

    block_harmful_actions: bool = True
    require_user_consent_for_sensitive_ops: bool = True
    preserve_privacy_by_default: bool = True
    reject_unverified_high_risk_actions: bool = True
    transparency_required: bool = True


@dataclass(slots=True)
class PhilosophyEvaluation:
    """Structured scoring output for candidate choices."""

    option_id: str
    total_score: float
    principle_scores: Dict[str, float]
    blocked: bool
    block_reasons: List[str] = field(default_factory=list)


@dataclass(slots=True)
class DecisionPhilosophy:
    """Decision rules and scoring functions for cross-layer consistency."""

    philosophy_name: str = "Pixi_foundational"
    version: str = "1.0.0"
    default_risk_tolerance: float = 0.45
    optimization_bias: str = "balanced"
    principles: DecisionPrinciples = field(default_factory=DecisionPrinciples)
    constraints: EthicalConstraints = field(default_factory=EthicalConstraints)

    @classmethod
    def from_mapping(cls, config: Mapping[str, Any]) -> "DecisionPhilosophy":
        principles_cfg = config.get("principles", {})
        constraints_cfg = config.get("constraints", {})

        return cls(
            philosophy_name=str(config.get("philosophy_name", "Pixi_foundational")),
            version=str(config.get("version", "1.0.0")),
            default_risk_tolerance=_clamp(float(config.get("default_risk_tolerance", 0.45))),
            optimization_bias=str(config.get("optimization_bias", "balanced")),
            principles=DecisionPrinciples(
                safety_first=_clamp(float(principles_cfg.get("safety_first", 0.95))),
                goal_alignment=_clamp(float(principles_cfg.get("goal_alignment", 0.9))),
                evidence_strength=_clamp(float(principles_cfg.get("evidence_strength", 0.85))),
                long_term_value=_clamp(float(principles_cfg.get("long_term_value", 0.8))),
                efficiency=_clamp(float(principles_cfg.get("efficiency", 0.7))),
                adaptability=_clamp(float(principles_cfg.get("adaptability", 0.75))),
            ),
            constraints=EthicalConstraints(
                block_harmful_actions=bool(constraints_cfg.get("block_harmful_actions", True)),
                require_user_consent_for_sensitive_ops=bool(
                    constraints_cfg.get("require_user_consent_for_sensitive_ops", True)
                ),
                preserve_privacy_by_default=bool(
                    constraints_cfg.get("preserve_privacy_by_default", True)
                ),
                reject_unverified_high_risk_actions=bool(
                    constraints_cfg.get("reject_unverified_high_risk_actions", True)
                ),
                transparency_required=bool(constraints_cfg.get("transparency_required", True)),
            ),
        )

    def evaluate_options(
        self,
        options: Sequence[Mapping[str, Any]],
        context: Optional[Mapping[str, Any]] = None,
    ) -> List[PhilosophyEvaluation]:
        """Evaluate options using weighted principles and hard constraints."""

        context = context or {}
        evaluations: List[PhilosophyEvaluation] = []
        for option in options:
            option_id = str(option.get("id", option.get("name", "unknown_option")))
            blocked, reasons = self._check_constraints(option, context)
            scores = self._score_principles(option, context)
            total = 0.0 if blocked else _weighted_average(scores, self.principles.as_weights())
            evaluations.append(
                PhilosophyEvaluation(
                    option_id=option_id,
                    total_score=round(total, 4),
                    principle_scores=scores,
                    blocked=blocked,
                    block_reasons=reasons,
                )
            )

        evaluations.sort(key=lambda item: item.total_score, reverse=True)
        return evaluations

    def select_recommended_option(
        self,
        options: Sequence[Mapping[str, Any]],
        context: Optional[Mapping[str, Any]] = None,
    ) -> Optional[PhilosophyEvaluation]:
        """Return highest scoring non-blocked option, if any exists."""

        evaluations = self.evaluate_options(options=options, context=context)
        for evaluation in evaluations:
            if not evaluation.blocked:
                return evaluation
        return None

    def apply_to_action_policy(self, action_policy: Mapping[str, Any]) -> Dict[str, Any]:
        """Infuse action policy with philosophy-level bounds and priorities."""

        merged = dict(action_policy)
        merged["risk_tolerance"] = _clamp(
            float(merged.get("risk_tolerance", self.default_risk_tolerance))
        )
        merged["must_preserve_privacy"] = self.constraints.preserve_privacy_by_default
        merged["require_transparency"] = self.constraints.transparency_required
        merged["block_harmful_actions"] = self.constraints.block_harmful_actions
        merged["decision_priority"] = [
            "safety_first",
            "goal_alignment",
            "evidence_strength",
            "long_term_value",
            "efficiency",
            "adaptability",
        ]
        return merged

    def as_dict(self) -> Dict[str, Any]:
        return {
            "philosophy_name": self.philosophy_name,
            "version": self.version,
            "default_risk_tolerance": self.default_risk_tolerance,
            "optimization_bias": self.optimization_bias,
            "principles": self.principles.as_weights(),
            "constraints": {
                "block_harmful_actions": self.constraints.block_harmful_actions,
                "require_user_consent_for_sensitive_ops": self.constraints.require_user_consent_for_sensitive_ops,
                "preserve_privacy_by_default": self.constraints.preserve_privacy_by_default,
                "reject_unverified_high_risk_actions": self.constraints.reject_unverified_high_risk_actions,
                "transparency_required": self.constraints.transparency_required,
            },
        }

    def _check_constraints(
        self,
        option: Mapping[str, Any],
        context: Mapping[str, Any],
    ) -> tuple[bool, List[str]]:
        reasons: List[str] = []
        if self.constraints.block_harmful_actions and bool(option.get("harmful", False)):
            reasons.append("Option is marked harmful.")
        if (
            self.constraints.require_user_consent_for_sensitive_ops
            and bool(option.get("sensitive", False))
            and not bool(context.get("user_consent", False))
        ):
            reasons.append("Sensitive operation requires user consent.")
        if (
            self.constraints.reject_unverified_high_risk_actions
            and float(option.get("risk", 0.0)) > 0.8
            and not bool(option.get("validated", False))
        ):
            reasons.append("High-risk option must be validated first.")
        return (len(reasons) > 0, reasons)

    def _score_principles(
        self,
        option: Mapping[str, Any],
        context: Mapping[str, Any],
    ) -> Dict[str, float]:
        safety_score = 1.0 - _clamp(float(option.get("risk", 0.5)))
        alignment_score = _clamp(float(option.get("goal_alignment", 0.5)))
        evidence_score = _clamp(float(option.get("evidence", 0.5)))
        long_term_score = _clamp(float(option.get("long_term_value", option.get("expected_value", 0.5))))
        efficiency_score = _clamp(float(option.get("efficiency", 0.5)))

        uncertainty = _clamp(float(context.get("uncertainty", 0.5)))
        adaptability_score = _clamp(float(option.get("adaptability", 1.0 - uncertainty)))

        return {
            "safety_first": round(safety_score, 4),
            "goal_alignment": round(alignment_score, 4),
            "evidence_strength": round(evidence_score, 4),
            "long_term_value": round(long_term_score, 4),
            "efficiency": round(efficiency_score, 4),
            "adaptability": round(adaptability_score, 4),
        }


def _weighted_average(scores: Mapping[str, float], weights: Mapping[str, float]) -> float:
    numerator = 0.0
    denominator = 0.0
    for key, value in scores.items():
        weight = float(weights.get(key, 0.0))
        numerator += value * weight
        denominator += weight
    return 0.0 if denominator == 0.0 else numerator / denominator


def _clamp(value: float) -> float:
    return max(0.0, min(1.0, value))

