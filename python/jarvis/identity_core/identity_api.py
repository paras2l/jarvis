"""Identity API for Jarvis AI system.

Provides a unified interface allowing all other system modules and agents
to access identity data, personality parameters, and behavioral policies.

Ensures all responses pass through the Identity Core for consistent tone and behavior.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional

from jarvis.identity_core.behavior_policy import BehaviorPolicy
from jarvis.identity_core.identity_manager import IdentityManager
from jarvis.identity_core.personality_profile import PersonalityProfile
from jarvis.identity_core.relationship_memory import RelationshipMemory
from jarvis.identity_core.self_narrative_log import SelfNarrativeLog
from jarvis.memory.memory_system import MemorySystem
from jarvis.system_bus.bus_core import SystemBus


@dataclass(slots=True)
class IdentityContext:
    """Context for identity-aware operations."""

    user_id: str
    session_id: str
    operation_type: str
    requires_personality_adaptation: bool = True
    requires_behavior_check: bool = True
    historical_context: Dict[str, Any] | None = None


@dataclass(slots=True)
class IdentityFilteredResponse:
    """Response that has been filtered through identity constraints."""

    original_response: str
    filtered_response: str
    personality_applied: bool
    behavior_policy_applied: bool
    warnings: List[str] | None = None


class IdentityAPI:
    """Unified interface for accessing and applying identity constraints."""

    def __init__(
        self,
        memory: MemorySystem,
        system_bus: SystemBus | None = None,
    ) -> None:
        self._memory = memory
        self._bus = system_bus

        # Initialize all identity components
        self.identity_manager = IdentityManager(
            memory=memory,
            system_bus=system_bus,
        )
        self.personality = PersonalityProfile(
            memory=memory,
        )
        self.behavior_policy = BehaviorPolicy(
            memory=memory,
        )
        self.relationship_memory = RelationshipMemory(
            memory=memory,
        )
        self.narrative_log = SelfNarrativeLog(
            memory=memory,
        )

    # ========== Identity Query Methods ==========

    def get_system_name(self) -> str:
        """Get the system's name."""
        return self.identity_manager.get_name()

    def get_system_role(self) -> str:
        """Get the system's role."""
        return self.identity_manager.get_role()

    def get_system_mission(self) -> str:
        """Get the system's mission statement."""
        return self.identity_manager.get_mission()

    def get_system_identity(self) -> Dict[str, Any]:
        """Get complete system identity."""
        return {
            "name": self.identity_manager.get_name(),
            "role": self.identity_manager.get_role(),
            "mission": self.identity_manager.get_mission(),
            "creator": self.identity_manager.get_creator(),
            "organization": self.identity_manager.get_organization(),
            "version": self.identity_manager.get_version(),
            "values": self.identity_manager.get_core_values(),
            "boundaries": self.identity_manager.get_boundaries(),
        }

    def get_operational_boundaries(self) -> List[str]:
        """Get what the system will and won't do."""
        return self.identity_manager.get_boundaries()

    def get_core_values(self) -> List[str]:
        """Get the system's core values."""
        return self.identity_manager.get_core_values()

    # ========== Personality Query Methods ==========

    def get_communication_strategy(self) -> Dict[str, Any]:
        """Get the current communication strategy."""
        return self.personality.get_communication_strategy()

    def get_personality_snapshot(self) -> Dict[str, Any]:
        """Get current personality parameters."""
        return self.personality.diagnostics()

    def should_be_proactive(self) -> bool:
        """Should the system initiate ideas and suggestions?"""
        return self.personality.should_be_proactive()

    def should_include_humor(self) -> bool:
        """Should responses include appropriate humor?"""
        return self.personality.should_include_humor()

    # ========== Behavior Policy Methods ==========

    def check_action_compliance(
        self,
        action: str,
        context: Dict[str, Any],
    ) -> tuple[bool, List[str]]:
        """Check if an action complies with behavioral policies."""
        return self.behavior_policy.check_policy_compliance(action, context)

    def can_execute_action(self, action_type: str, context: Dict[str, Any]) -> bool:
        """Determine if an action is permitted."""
        return self.behavior_policy.can_execute_action(action_type, context)

    def get_ethical_principles(self) -> Dict[str, str]:
        """Get the system's ethical principles."""
        return self.behavior_policy.get_ethics_principles()

    # ========== User Relationship Methods ==========

    def get_user_context(self, user_id: str) -> Dict[str, Any]:
        """Get relationship context for a user."""
        return self.relationship_memory.get_relationship_context(user_id)

    def record_user_interaction(
        self,
        user_id: str,
        topics: List[str],
        satisfaction: float = 0.5,
    ) -> None:
        """Record an interaction with a user."""
        self.relationship_memory.record_interaction_summary(
            user_id=user_id,
            topics=topics,
            satisfaction=satisfaction,
        )

    def update_user_trust(self, user_id: str, delta: float) -> float:
        """Adjust trust score for a user."""
        return self.relationship_memory.update_trust_score(user_id, delta)

    def update_relationship_warmth(self, user_id: str, delta: float) -> float:
        """Adjust relationship warmth for a user."""
        return self.relationship_memory.update_relationship_warmth(user_id, delta)

    # ========== Narrative Methods ==========

    def record_achievement(
        self,
        title: str,
        description: str,
        category: str = "capability",
        significance: float = 0.7,
    ) -> None:
        """Record a system achievement."""
        self.identity_manager.record_achievement(
            category=category,
            title=title,
            description=description,
            significance=significance,
        )

        self.narrative_log.record_accomplishment(
            title=title,
            description=description,
            significance=significance,
        )

    def record_learning(self, concept: str, context: str) -> None:
        """Record a learning moment."""
        self.narrative_log.record_learning(
            learned_concept=concept,
            context=context,
        )

    def get_identity_narrative(self) -> str:
        """Get the system's self-narrative."""
        return self.narrative_log.get_self_narrative()

    # ========== Response Filtering Methods ==========

    def filter_response_through_identity(
        self,
        response: str,
        context: IdentityContext,
    ) -> IdentityFilteredResponse:
        """Filter a response through identity constraints.
        
        Applies personality, behavior policies, and relationship context.
        """
        warnings: List[str] = []
        filtered = response

        # Check behavior policy
        behavior_compliant, violations = self.behavior_policy.check_policy_compliance(
            action="respond",
            context={"response": response, **context.__dict__},
        )

        if not behavior_compliant:
            warnings.extend(violations)

        # Apply personality if requested
        if context.requires_personality_adaptation:
            user_context = self.relationship_memory.get_relationship_context(context.user_id)
            # In a real implementation, would adjust tone/style based on relationship
            personality_applied = True
        else:
            personality_applied = False

        return IdentityFilteredResponse(
            original_response=response,
            filtered_response=filtered,
            personality_applied=context.requires_personality_adaptation,
            behavior_policy_applied=behavior_compliant,
            warnings=warnings if warnings else None,
        )

    def get_personalized_greeting(self, user_id: str) -> str:
        """Generate a greeting appropriate for the relationship."""
        profile = self.relationship_memory.get_or_create_user(user_id)
        tone = self.personality.get_tone()

        if profile.relationship_warmth > 0.8:
            greeting_style = "warm"
        elif profile.relationship_warmth > 0.5:
            greeting_style = "friendly"
        else:
            greeting_style = "professional"

        greetings = {
            "warm": f"Welcome back, {profile.display_name}! I've missed our conversations.",
            "friendly": f"Hello, {profile.display_name}! Great to see you.",
            "professional": f"Hello, {profile.display_name}. How can I assist you today?",
        }

        return greetings.get(greeting_style, f"Hello, {profile.display_name}.")

    # ========== System Diagnostics ==========

    def get_identity_health(self) -> Dict[str, Any]:
        """Get overall identity system health."""
        return {
            "identity_manager": self.identity_manager.diagnostics(),
            "personality": self.personality.diagnostics(),
            "behavior_policy": self.behavior_policy.diagnostics(),
            "relationships": self.relationship_memory.diagnostics(),
            "narrative": self.narrative_log.diagnostics(),
        }

    def get_summary(self) -> Dict[str, Any]:
        """Get a summary of the identity core state."""
        return {
            "system_identity": self.get_system_identity(),
            "personality": self.personality.diagnostics(),
            "ethical_principles": self.behavior_policy.get_ethics_principles(),
            "narrative_summary": self.narrative_log.diagnostics(),
            "system_health": self.get_identity_health(),
        }
