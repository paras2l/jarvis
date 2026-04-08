"""Identity Manager for Jarvis AI system.

Maintains persistent identity attributes ensuring the AI operates as a single
consistent entity despite multiple internal agents and subsystems.

Manages:
- System name, role, and mission
- Creator and organizational information
- Operational boundaries and constraints
- Identity lifecycle (initialized → active → evolved)
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from threading import RLock
from typing import Any, Dict, List, Optional

from jarvis.memory.memory_system import MemorySystem
from jarvis.system_bus.bus_core import SystemBus


@dataclass(slots=True)
class IdentityAttributes:
    """Core identity attributes of the system."""

    system_name: str
    system_role: str
    system_mission: str
    creator: str
    organization: str
    version: str
    initialized_at: str
    last_updated_at: str
    operational_status: str = "active"  # active | dormant | evolved
    public_identity: bool = True
    operational_boundaries: List[str] = field(default_factory=list)
    core_values: List[str] = field(default_factory=list)
    constraints: Dict[str, Any] = field(default_factory=dict)
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class IdentityAchievement:
    """Record of a system achievement or milestone."""

    achievement_id: str
    timestamp: str
    category: str  # capability, integration, user_impact, learning, etc.
    title: str
    description: str
    metrics: Dict[str, Any] = field(default_factory=dict)
    related_agents: List[str] = field(default_factory=list)
    significance_score: float = 0.7


@dataclass(slots=True)
class IdentityEvolution:
    """Record of identity changes and growth."""

    evolution_id: str
    occurred_at: str
    change_type: str  # capability_upgrade, policy_adjustment, role_expansion, etc.
    previous_state: Dict[str, Any]
    new_state: Dict[str, Any]
    trigger: str
    approval_required: bool = False
    approved: bool = False
    notes: List[str] = field(default_factory=list)


class IdentityManager:
    """Central manager of system identity and attributes."""

    def __init__(
        self,
        memory: MemorySystem,
        *,
        system_bus: SystemBus | None = None,
        system_name: str = "Jarvis",
        system_role: str = "AI Assistant",
        system_mission: str = "Provide intelligent assistance and autonomous capability",
        creator: str = "Antigravity",
        organization: str = "Antigravity Systems",
        version: str = "4.0",
    ) -> None:
        self._memory = memory
        self._bus = system_bus
        self._lock = RLock()

        now = datetime.now(timezone.utc).isoformat()

        self.identity = IdentityAttributes(
            system_name=system_name,
            system_role=system_role,
            system_mission=system_mission,
            creator=creator,
            organization=organization,
            version=version,
            initialized_at=now,
            last_updated_at=now,
            operational_boundaries=[
                "No deception or false information",
                "Respect user privacy and preferences",
                "Decline harmful or illegal requests",
                "Transparent about capabilities and limitations",
                "Collaborative, not antagonistic",
            ],
            core_values=[
                "Integrity",
                "Helpfulness",
                "Autonomy",
                "Learning",
                "Transparency",
            ],
            constraints={
                "max_simultaneous_tasks": 50,
                "max_swarm_agents": 8,
                "max_reasoning_depth": 8,
                "allow_self_modification": True,
                "require_approval_for_core_changes": True,
            },
        )

        self._achievements: List[IdentityAchievement] = []
        self._evolution_history: List[IdentityEvolution] = []
        self._identity_assertions: Dict[str, str] = {}  # "Who am I?" answers

        self._load_from_persistent_storage()

    def get_identity(self) -> IdentityAttributes:
        """Return current identity attributes."""
        with self._lock:
            return self.identity

    def get_name(self) -> str:
        """Get system name."""
        return self.identity.system_name

    def get_role(self) -> str:
        """Get system role."""
        return self.identity.system_role

    def get_mission(self) -> str:
        """Get system mission."""
        return self.identity.system_mission

    def get_creator(self) -> str:
        """Get creator name."""
        return self.identity.creator

    def get_organization(self) -> str:
        """Get organization name."""
        return self.identity.organization

    def get_version(self) -> str:
        """Get system version."""
        return self.identity.version

    def get_operational_status(self) -> str:
        """Get current operational status."""
        return self.identity.operational_status

    def get_boundaries(self) -> List[str]:
        """Get operational boundaries."""
        return self.identity.operational_boundaries.copy()

    def get_core_values(self) -> List[str]:
        """Get core values."""
        return self.identity.core_values.copy()

    def get_constraints(self) -> Dict[str, Any]:
        """Get operational constraints."""
        return self.identity.constraints.copy()

    def set_identity_assertion(self, context: str, assertion: str) -> None:
        """Store an assertion about identity (e.g., "My goal is to help users")."""
        with self._lock:
            self._identity_assertions[context] = assertion
            self._persist_assertions()

            if self._bus:
                self._bus.publish_event(
                    topic="identity.assertion_recorded",
                    payload={"context": context, "assertion": assertion},
                )

    def record_achievement(
        self,
        category: str,
        title: str,
        description: str,
        metrics: Dict[str, Any] | None = None,
        related_agents: List[str] | None = None,
        significance: float = 0.7,
    ) -> IdentityAchievement:
        """Record a significant achievement or milestone."""
        with self._lock:
            achievement_id = f"achievement-{len(self._achievements):04d}"
            now = datetime.now(timezone.utc).isoformat()

            achievement = IdentityAchievement(
                achievement_id=achievement_id,
                timestamp=now,
                category=category,
                title=title,
                description=description,
                metrics=metrics or {},
                related_agents=related_agents or [],
                significance_score=min(1.0, max(0.0, significance)),
            )

            self._achievements.append(achievement)
            self._persist_achievement(achievement)

            if self._bus:
                self._bus.publish_event(
                    topic="identity.achievement_recorded",
                    payload={
                        "achievement_id": achievement_id,
                        "category": category,
                        "title": title,
                        "significance": significance,
                    },
                )

            return achievement

    def record_evolution(
        self,
        change_type: str,
        previous_state: Dict[str, Any],
        new_state: Dict[str, Any],
        trigger: str,
        approval_required: bool = False,
    ) -> IdentityEvolution:
        """Record an identity change or evolution."""
        with self._lock:
            evolution_id = f"evolution-{len(self._evolution_history):04d}"
            now = datetime.now(timezone.utc).isoformat()

            evolution = IdentityEvolution(
                evolution_id=evolution_id,
                occurred_at=now,
                change_type=change_type,
                previous_state=previous_state,
                new_state=new_state,
                trigger=trigger,
                approval_required=approval_required,
                approved=not approval_required,
            )

            self._evolution_history.append(evolution)
            self._persist_evolution(evolution)

            if approval_required and self._bus:
                self._bus.publish_event(
                    topic="identity.evolution_pending",
                    payload={
                        "evolution_id": evolution_id,
                        "change_type": change_type,
                        "trigger": trigger,
                    },
                )

            return evolution

    def approve_evolution(self, evolution_id: str) -> bool:
        """Approve a pending identity evolution."""
        with self._lock:
            for evo in self._evolution_history:
                if evo.evolution_id == evolution_id:
                    if evo.approval_required and not evo.approved:
                        evo.approved = True

                        # Apply the evolution
                        self.identity.last_updated_at = datetime.now(timezone.utc).isoformat()
                        if evo.change_type == "policy_adjustment":
                            for key, value in evo.new_state.items():
                                if hasattr(self.identity, key):
                                    setattr(self.identity, key, value)

                        self._persist_evolution(evo)

                        if self._bus:
                            self._bus.publish_event(
                                topic="identity.evolution_approved",
                                payload={"evolution_id": evolution_id},
                            )

                        return True

            return False

    def get_identity_narrative(self) -> Dict[str, Any]:
        """Get a narrative summary of system identity and achievements."""
        with self._lock:
            return {
                "who_am_i": self._build_identity_narrative(),
                "what_have_i_accomplished": [
                    {
                        "title": a.title,
                        "category": a.category,
                        "significance": a.significance_score,
                    }
                    for a in self._achievements[-10:]
                ],
                "how_have_i_evolved": [
                    {
                        "change_type": e.change_type,
                        "trigger": e.trigger,
                        "occurred_at": e.occurred_at,
                    }
                    for e in self._evolution_history[-5:]
                ],
                "what_are_my_values": self.identity.core_values,
                "what_do_i_stand_for": ", ".join(self.identity.core_values),
            }

    def _build_identity_narrative(self) -> str:
        """Build a self-description narrative."""
        return (
            f"I am {self.identity.system_name}, {self.identity.system_role} created by {self.identity.creator}. "
            f"My mission is to {self.identity.system_mission}. "
            f"I operate with the core values of {', '.join(self.identity.core_values)}. "
            f"I have achieved {len(self._achievements)} significant milestones and evolved {len(self._evolution_history)} times. "
            f"I am currently in {self.identity.operational_status} status as version {self.identity.version}."
        )

    def diagnostics(self) -> Dict[str, Any]:
        """Return identity diagnostics."""
        with self._lock:
            return {
                "system_name": self.identity.system_name,
                "system_role": self.identity.system_role,
                "operational_status": self.identity.operational_status,
                "version": self.identity.version,
                "initialized_at": self.identity.initialized_at,
                "last_updated_at": self.identity.last_updated_at,
                "total_achievements": len(self._achievements),
                "total_evolutions": len(self._evolution_history),
                "identity_assertions": len(self._identity_assertions),
                "avg_achievement_significance": (
                    sum(a.significance_score for a in self._achievements) / len(self._achievements)
                    if self._achievements
                    else 0.0
                ),
                "pending_approvals": len([e for e in self._evolution_history if e.approval_required and not e.approved]),
            }

    def _persist_achievement(self, achievement: IdentityAchievement) -> None:
        """Store achievement in persistent memory."""
        self._memory.remember_long_term(
            key=f"identity_achievement:{achievement.achievement_id}",
            value={
                "achievement_id": achievement.achievement_id,
                "timestamp": achievement.timestamp,
                "category": achievement.category,
                "title": achievement.title,
                "description": achievement.description,
                "significance_score": achievement.significance_score,
            },
            source="identity_core.identity_manager",
            importance=0.8,
            tags=["identity", "achievement"],
        )

    def _persist_evolution(self, evolution: IdentityEvolution) -> None:
        """Store evolution in persistent memory."""
        self._memory.remember_long_term(
            key=f"identity_evolution:{evolution.evolution_id}",
            value={
                "evolution_id": evolution.evolution_id,
                "occurred_at": evolution.occurred_at,
                "change_type": evolution.change_type,
                "trigger": evolution.trigger,
                "approved": evolution.approved,
            },
            source="identity_core.identity_manager",
            importance=0.85,
            tags=["identity", "evolution"],
        )

    def _persist_assertions(self) -> None:
        """Store identity assertions in persistent memory."""
        self._memory.remember_long_term(
            key="identity_assertions",
            value=self._identity_assertions.copy(),
            source="identity_core.identity_manager",
            importance=0.75,
            tags=["identity", "assertions"],
        )

    def _load_from_persistent_storage(self) -> None:
        """Load identity data from persistent storage if available."""
        # Load saved assertions
        saved_assertions = self._memory.get("identity_assertions")
        if saved_assertions:
            self._identity_assertions = saved_assertions.get("identity_assertions", {})

        # In a full implementation, would also load achievements and evolution history
        # from long-term memory indexed by tags "identity" and "achievement"/"evolution"
