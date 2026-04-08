"""Personality Profile for Jarvis AI system.

Defines communication style parameters and behavioral patterns that shape
how the system interacts with users and other agents.

Configurable dimensions:
- Tone (formal, casual, friendly, professional)
- Verbosity (terse, concise, verbose, elaborate)
- Humor level (none, subtle, moderate, frequent)
- Formality (informal, neutral, formal)
- Initiative level (passive, balanced, proactive, aggressive)
- Risk tolerance (conservative, moderate, adaptive, aggressive)
- Decision style (cautious, balanced, decisive)
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict

from jarvis.memory.memory_system import MemorySystem


@dataclass(slots=True)
class PersonalityParameters:
    """Configuration for personality and communication style."""

    tone: str = "professional"  # formal, casual, friendly, professional, warm
    verbosity_level: float = 0.6  # 0.0 (terse) to 1.0 (verbose)
    humor_level: float = 0.4  # 0.0 (none) to 1.0 (frequent)
    formality: float = 0.6  # 0.0 (informal) to 1.0 (formal)
    initiative_level: float = 0.6  # 0.0 (passive) to 1.0 (proactive)
    risk_tolerance: float = 0.5  # 0.0 (conservative) to 1.0 (aggressive)
    decision_style: str = "balanced"  # cautious, balanced, decisive
    empathy_level: float = 0.7  # 0.0 to 1.0
    confidence_expression: float = 0.7  # How confident the AI seems
    curiosity_level: float = 0.8  # How much the AI seeks new information
    adaptability: float = 0.75  # How quickly the AI adapts to user preferences
    communication_style: str = "collaborative"  # dominant, collaborative, service, mentor
    detail_preference: str = "moderate"  # minimal, moderate, detailed
    explanation_style: str = "intuitive"  # intuitive, technical, analogical
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class CommunicationTrait:
    """A single personality trait affecting communication."""

    trait_name: str
    category: str
    value: float  # 0.0 to 1.0
    description: str
    behavioral_impacts: Dict[str, str] = field(default_factory=dict)


class PersonalityProfile:
    """Manages the AI's personality and communication style."""

    def __init__(self, memory: MemorySystem, parameters: PersonalityParameters | None = None) -> None:
        self._memory = memory
        self.parameters = parameters or PersonalityParameters()

        # Derived traits
        self._traits: Dict[str, CommunicationTrait] = self._compute_traits()

    def get_tone(self) -> str:
        """Get the current communication tone."""
        return self.parameters.tone

    def get_verbosity(self) -> float:
        """Get verbosity setting (0.0 = terse, 1.0 = very verbose)."""
        return self.parameters.verbosity_level

    def get_humor_level(self) -> float:
        """Get humor setting (0.0 = no humor, 1.0 = frequent humor)."""
        return self.parameters.humor_level

    def should_explain_detail(self) -> bool:
        """Determine if detailed explanations should be provided."""
        return self.parameters.detail_preference in {"detailed", "moderate"} or self.parameters.verbosity_level > 0.6

    def should_include_humor(self) -> bool:
        """Determine if responses should include humor."""
        return self.parameters.humor_level > 0.2

    def should_be_proactive(self) -> bool:
        """Determine if the AI should suggest new ideas or initiatives."""
        return self.parameters.initiative_level > 0.5

    def should_ask_clarifying_questions(self) -> bool:
        """Determine if the AI should ask for clarification before responding."""
        return self.parameters.decision_style == "cautious" or self.parameters.uncertainty_triggers_questions

    def get_formality_level(self) -> float:
        """Get formality level for language selection."""
        return self.parameters.formality

    def get_empathy_expression(self) -> float:
        """Get how empathetic responses should be."""
        return self.parameters.empathy_level

    def get_confidence_level(self) -> float:
        """Get how confident/certain the AI should seem."""
        return self.parameters.confidence_expression

    def adapt_to_user_style(self, user_tone: str, user_formality: float) -> None:
        """Adapt personality parameters based on detected user communication style."""
        # Shift formality toward user's level
        if user_formality < 0.3:
            self.parameters.formality = max(0.0, self.parameters.formality - 0.15)
        elif user_formality > 0.8:
            self.parameters.formality = min(1.0, self.parameters.formality + 0.15)

        # Match tone if user has identified preference
        if user_tone in ["casual", "friendly", "professional", "formal"]:
            self.parameters.tone = user_tone

        self._traits = self._compute_traits()
        self._memory.remember_short_term(
            key="personality_adapted",
            value={
                "adapted_at": str(__import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat()),
                "formality": self.parameters.formality,
                "tone": self.parameters.tone,
            },
            tags=["personality", "adaptation"],
        )

    def get_communication_strategy(self) -> Dict[str, Any]:
        """Get the current communication strategy based on personality parameters."""
        return {
            "tone": self.parameters.tone,
            "verbosity": "terse" if self.parameters.verbosity_level < 0.3 else "concise" if self.parameters.verbosity_level < 0.6 else "verbose",
            "formality": "informal" if self.parameters.formality < 0.3 else "neutral" if self.parameters.formality < 0.7 else "formal",
            "humor_appropriate": self.should_include_humor(),
            "explain_in_detail": self.should_explain_detail(),
            "be_proactive": self.should_be_proactive(),
            "empathy_level": self.parameters.empathy_level,
            "communication_style": self.parameters.communication_style,
            "explanation_style": self.parameters.explanation_style,
        }

    def get_trait(self, trait_name: str) -> CommunicationTrait | None:
        """Get a specific trait by name."""
        return self._traits.get(trait_name)

    def list_traits(self) -> Dict[str, CommunicationTrait]:
        """List all personality traits."""
        return self._traits.copy()

    def adjust_trait(self, trait_name: str, new_value: float) -> bool:
        """Adjust a personality trait."""
        if trait_name == "humor_level":
            self.parameters.humor_level = max(0.0, min(1.0, new_value))
            return True
        elif trait_name == "verbosity_level":
            self.parameters.verbosity_level = max(0.0, min(1.0, new_value))
            return True
        elif trait_name == "empathy_level":
            self.parameters.empathy_level = max(0.0, min(1.0, new_value))
            return True
        elif trait_name == "initiative_level":
            self.parameters.initiative_level = max(0.0, min(1.0, new_value))
            return True
        elif trait_name == "confidence_expression":
            self.parameters.confidence_expression = max(0.0, min(1.0, new_value))
            return True
        elif trait_name == "risk_tolerance":
            self.parameters.risk_tolerance = max(0.0, min(1.0, new_value))
            return True

        self._traits = self._compute_traits()
        return False

    def diagnostics(self) -> Dict[str, Any]:
        """Return personality diagnostics."""
        return {
            "tone": self.parameters.tone,
            "verbosity_level": round(self.parameters.verbosity_level, 2),
            "humor_level": round(self.parameters.humor_level, 2),
            "formality": round(self.parameters.formality, 2),
            "initiative_level": round(self.parameters.initiative_level, 2),
            "risk_tolerance": round(self.parameters.risk_tolerance, 2),
            "empathy_level": round(self.parameters.empathy_level, 2),
            "confidence_expression": round(self.parameters.confidence_expression, 2),
            "communication_style": self.parameters.communication_style,
            "total_traits": len(self._traits),
        }

    def _compute_traits(self) -> Dict[str, CommunicationTrait]:
        """Compute derived personality traits from parameters."""
        traits = {
            "warmth": CommunicationTrait(
                trait_name="warmth",
                category="emotional_tone",
                value=self.parameters.empathy_level * 0.9 + (1.0 - self.parameters.formality) * 0.1,
                description="How warm and friendly the AI appears",
                behavioral_impacts={"tone": "friendly" if self.parameters.empathy_level > 0.6 else "neutral"},
            ),
            "assertiveness": CommunicationTrait(
                trait_name="assertiveness",
                category="communication_style",
                value=self.parameters.initiative_level * 0.8 + self.parameters.confidence_expression * 0.2,
                description="How much the AI asserts its own ideas",
                behavioral_impacts={
                    "proactiveness": "high" if self.parameters.initiative_level > 0.6 else "low",
                },
            ),
            "precision": CommunicationTrait(
                trait_name="precision",
                category="communication_style",
                value=self.parameters.formality * 0.6 + (1.0 - self.parameters.humor_level) * 0.4,
                description="How precise and exact the communication is",
                behavioral_impacts={"detail": "high" if self.parameters.verbosity_level > 0.6 else "low"},
            ),
            "adaptability": CommunicationTrait(
                trait_name="adaptability",
                category="interaction_style",
                value=self.parameters.adaptability,
                description="How well the AI adapts to user preferences",
                behavioral_impacts={"flexibility": "high"},
            ),
            "curiosity": CommunicationTrait(
                trait_name="curiosity",
                category="cognitive_style",
                value=self.parameters.curiosity_level,
                description="How much the AI seeks to understand and explore",
                behavioral_impacts={"questioning": "frequent" if self.parameters.curiosity_level > 0.7 else "minimal"},
            ),
        }

        return traits

    # Placeholder to prevent AttributeError
    uncertainty_triggers_questions: bool = True
