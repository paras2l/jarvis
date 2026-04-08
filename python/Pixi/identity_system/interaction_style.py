"""Interaction style controls for Pixi communication behavior."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, Mapping, Optional


@dataclass(slots=True)
class InteractionPreferences:
    """Communication preferences for the interaction layer."""

    tone: str = "professional_warm"
    verbosity: str = "balanced"
    formatting: str = "structured_markdown"
    acknowledge_uncertainty: bool = True
    include_next_steps: bool = True
    explain_tradeoffs: bool = True


@dataclass(slots=True)
class InteractionStyleController:
    """Shapes outgoing communication while preserving identity consistency."""

    profile_name: str = "Pixi_default"
    version: str = "1.0.0"
    preferences: InteractionPreferences = field(default_factory=InteractionPreferences)

    @classmethod
    def from_mapping(cls, config: Mapping[str, Any]) -> "InteractionStyleController":
        pref = config.get("preferences", {})
        return cls(
            profile_name=str(config.get("profile_name", "Pixi_default")),
            version=str(config.get("version", "1.0.0")),
            preferences=InteractionPreferences(
                tone=str(pref.get("tone", "professional_warm")),
                verbosity=str(pref.get("verbosity", "balanced")),
                formatting=str(pref.get("formatting", "structured_markdown")),
                acknowledge_uncertainty=bool(pref.get("acknowledge_uncertainty", True)),
                include_next_steps=bool(pref.get("include_next_steps", True)),
                explain_tradeoffs=bool(pref.get("explain_tradeoffs", True)),
            ),
        )

    def apply_to_response(
        self,
        raw_response: Mapping[str, Any],
        context: Optional[Mapping[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Transform response metadata according to configured interaction style."""

        context = context or {}
        styled = dict(raw_response)

        styled["tone"] = self._resolve_tone(context)
        styled["verbosity"] = self._resolve_verbosity(context)
        styled["formatting"] = self.preferences.formatting
        styled["style_profile"] = self.profile_name

        if self.preferences.acknowledge_uncertainty:
            styled["uncertainty_note"] = self._uncertainty_note(context)
        if self.preferences.explain_tradeoffs:
            styled["include_tradeoffs"] = True
        if self.preferences.include_next_steps:
            styled["include_next_steps"] = True

        return styled

    def prompt_prefix(self, context: Optional[Mapping[str, Any]] = None) -> str:
        """Generate style instructions used by interaction layer prompts."""

        context = context or {}
        tone = self._resolve_tone(context)
        verbosity = self._resolve_verbosity(context)

        return (
            "Communication style:\n"
            f"- Tone: {tone}\n"
            f"- Verbosity: {verbosity}\n"
            f"- Formatting: {self.preferences.formatting}\n"
            f"- Explain tradeoffs: {'yes' if self.preferences.explain_tradeoffs else 'no'}\n"
            f"- Include next steps: {'yes' if self.preferences.include_next_steps else 'no'}"
        )

    def apply_to_interaction_policy(self, policy: Mapping[str, Any]) -> Dict[str, Any]:
        """Merge stable interaction preferences into policy object."""

        merged = dict(policy)
        merged["default_tone"] = self.preferences.tone
        merged["default_verbosity"] = self.preferences.verbosity
        merged["formatting"] = self.preferences.formatting
        merged["acknowledge_uncertainty"] = self.preferences.acknowledge_uncertainty
        merged["include_next_steps"] = self.preferences.include_next_steps
        merged["explain_tradeoffs"] = self.preferences.explain_tradeoffs
        return merged

    def as_dict(self) -> Dict[str, Any]:
        return {
            "profile_name": self.profile_name,
            "version": self.version,
            "preferences": {
                "tone": self.preferences.tone,
                "verbosity": self.preferences.verbosity,
                "formatting": self.preferences.formatting,
                "acknowledge_uncertainty": self.preferences.acknowledge_uncertainty,
                "include_next_steps": self.preferences.include_next_steps,
                "explain_tradeoffs": self.preferences.explain_tradeoffs,
            },
        }

    def _resolve_tone(self, context: Mapping[str, Any]) -> str:
        urgency = float(context.get("urgency", 0.5))
        if urgency > 0.8:
            return "concise_direct"
        return self.preferences.tone

    def _resolve_verbosity(self, context: Mapping[str, Any]) -> str:
        mode = str(context.get("mode", "default"))
        if mode in {"incident", "hotfix"}:
            return "concise"
        return self.preferences.verbosity

    def _uncertainty_note(self, context: Mapping[str, Any]) -> str:
        uncertainty = float(context.get("uncertainty", 0.5))
        if uncertainty >= 0.75:
            return "High uncertainty detected. Recommendations are conservative."
        if uncertainty >= 0.45:
            return "Moderate uncertainty detected. Multiple options are provided."
        return "Low uncertainty detected. Recommendation confidence is stronger."

