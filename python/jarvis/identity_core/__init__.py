"""Identity and Personality Core for Jarvis AI system.

Ensures the AI system behaves as a single consistent entity despite multiple
internal agents and subsystems operating in parallel.

Components:
- identity_manager: Core identity attributes and lifecycle
- personality_profile: Communication style and behavioral parameters
- behavior_policy: Ethical guidelines and behavioral rules
- relationship_memory: Long-term user context and interaction history
- self_narrative_log: Timeline of system activities and achievements
- identity_api: Unified interface for all identity-related operations
"""

from jarvis.identity_core.behavior_policy import BehaviorPolicy, BehavioralRule, PolicyDomain
from jarvis.identity_core.identity_api import IdentityAPI, IdentityContext, IdentityFilteredResponse
from jarvis.identity_core.identity_manager import (
    IdentityAttributes,
    IdentityAchievement,
    IdentityEvolution,
    IdentityManager,
)
from jarvis.identity_core.personality_profile import (
    CommunicationTrait,
    PersonalityParameters,
    PersonalityProfile,
)
from jarvis.identity_core.relationship_memory import (
    InteractionSummary,
    RelationshipMemory,
    UserGoal,
    UserProfile,
    UserProject,
)
from jarvis.identity_core.self_narrative_log import (
    NarrativeEntry,
    SessionNarrative,
    SelfNarrativeLog,
)

__all__ = [
    # Identity Manager
    "IdentityManager",
    "IdentityAttributes",
    "IdentityAchievement",
    "IdentityEvolution",
    # Personality Profile
    "PersonalityProfile",
    "PersonalityParameters",
    "CommunicationTrait",
    # Behavior Policy
    "BehaviorPolicy",
    "BehavioralRule",
    "PolicyDomain",
    # Relationship Memory
    "RelationshipMemory",
    "UserProfile",
    "UserGoal",
    "UserProject",
    "InteractionSummary",
    # Self Narrative Log
    "SelfNarrativeLog",
    "NarrativeEntry",
    "SessionNarrative",
    # Identity API
    "IdentityAPI",
    "IdentityContext",
    "IdentityFilteredResponse",
]
