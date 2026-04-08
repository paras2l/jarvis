"""Identity and Personality System for Jarvis.

This layer enforces consistent behavior and decision patterns across sessions by
combining personality traits, decision philosophy, behavior policies, and
interaction style controls.
"""

from jarvis.identity_system.behavior_controller import BehaviorController, BehaviorInfluenceSummary
from jarvis.identity_system.decision_philosophy import (
    DecisionPhilosophy,
    DecisionPrinciples,
    EthicalConstraints,
    PhilosophyEvaluation,
)
from jarvis.identity_system.identity_core import IdentityCore, IdentityState
from jarvis.identity_system.interaction_style import InteractionPreferences, InteractionStyleController
from jarvis.identity_system.personality_profile import (
    BehaviorPreferences,
    PersonalityProfile,
    PersonalityTraits,
)

__all__ = [
    "BehaviorController",
    "BehaviorInfluenceSummary",
    "BehaviorPreferences",
    "DecisionPhilosophy",
    "DecisionPrinciples",
    "EthicalConstraints",
    "IdentityCore",
    "IdentityState",
    "InteractionPreferences",
    "InteractionStyleController",
    "PersonalityProfile",
    "PersonalityTraits",
    "PhilosophyEvaluation",
]
