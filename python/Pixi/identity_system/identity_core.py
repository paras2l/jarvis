"""Identity core for Pixi.

Central identity controller that loads personality configuration, enforces
cross-layer consistency, and persists identity state across sessions.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
import json
from pathlib import Path
from typing import Any, Dict, Mapping, Optional

from Pixi.identity_system.behavior_controller import BehaviorController
from Pixi.identity_system.decision_philosophy import DecisionPhilosophy
from Pixi.identity_system.interaction_style import InteractionStyleController
from Pixi.identity_system.personality_profile import PersonalityProfile
from Pixi.memory.memory_system import MemorySystem


@dataclass(slots=True)
class IdentityState:
    """Serializable runtime state proving continuity across sessions."""

    active_profile: str = "Pixi_default"
    profile_version: str = "1.0.0"
    philosophy_version: str = "1.0.0"
    revision: int = 1
    last_loaded_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    last_applied_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


@dataclass(slots=True)
class IdentityCore:
    """Main identity orchestrator for global personality influence."""

    config_path: Path
    memory_system: Optional[MemorySystem] = None
    profile: PersonalityProfile = field(default_factory=PersonalityProfile)
    philosophy: DecisionPhilosophy = field(default_factory=DecisionPhilosophy)
    interaction_style: InteractionStyleController = field(default_factory=InteractionStyleController)
    state: IdentityState = field(default_factory=IdentityState)

    @classmethod
    def from_config_path(
        cls,
        config_path: str | Path,
        memory_system: Optional[MemorySystem] = None,
    ) -> "IdentityCore":
        """Create and initialize identity core from JSON config path."""

        core = cls(config_path=Path(config_path), memory_system=memory_system)
        core.load_configuration()
        core.restore_state()
        return core

    def load_configuration(self) -> None:
        """Load personality, philosophy, and interaction style from config file."""

        if not self.config_path.exists():
            self._persist_default_config()

        raw = json.loads(self.config_path.read_text(encoding="utf-8"))
        self.profile = PersonalityProfile.from_mapping(raw.get("personality_profile", {}))
        self.philosophy = DecisionPhilosophy.from_mapping(raw.get("decision_philosophy", {}))
        self.interaction_style = InteractionStyleController.from_mapping(
            raw.get("interaction_style", {})
        )

        self.state.active_profile = self.profile.profile_name
        self.state.profile_version = self.profile.version
        self.state.philosophy_version = self.philosophy.version
        self.state.last_loaded_at = datetime.now(timezone.utc).isoformat()

    def behavior_controller(self) -> BehaviorController:
        return BehaviorController(profile=self.profile, philosophy=self.philosophy)

    def apply_identity_across_layers(
        self,
        reasoning_payload: Mapping[str, Any],
        goal_payload: Mapping[str, Any],
        planning_payload: Mapping[str, Any],
        action_payload: Mapping[str, Any],
        interaction_payload: Mapping[str, Any],
        context: Optional[Mapping[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Apply identity influence across required architecture layers."""

        context = context or {}
        controller = self.behavior_controller()
        influenced = controller.apply_across_stack(
            reasoning_payload=reasoning_payload,
            goal_payload=goal_payload,
            planning_payload=planning_payload,
            action_payload=action_payload,
            interaction_payload=interaction_payload,
            context=context,
        )

        influenced["interaction"] = self.interaction_style.apply_to_interaction_policy(
            influenced["interaction"]
        )
        influenced["decision_philosophy"] = self.philosophy.as_dict()
        influenced["identity_state"] = self.state_as_dict()

        self.state.last_applied_at = datetime.now(timezone.utc).isoformat()
        self.state.revision += 1
        self.persist_state()

        return influenced

    def get_reasoning_instructions(self, context: Optional[Mapping[str, Any]] = None) -> Dict[str, Any]:
        """Return identity-derived instructions for reasoning engine."""

        context = context or {}
        controller = self.behavior_controller()
        payload = controller.apply_to_reasoning(reasoning_input={}, context=context)
        payload["identity_signature"] = controller.identity_signature(context)
        return payload

    def get_interaction_prompt_prefix(self, context: Optional[Mapping[str, Any]] = None) -> str:
        """Return formatted interaction prefix for interaction layer prompts."""

        return self.interaction_style.prompt_prefix(context=context)

    def persist_state(self) -> None:
        """Persist identity state to memory and local disk for continuity."""

        state_blob = self.state_as_dict()
        self._persist_local_state(state_blob)

        if self.memory_system is None:
            return

        self.memory_system.remember_short_term(
            key="identity:active_state",
            value=state_blob,
            tags=["identity", "session"],
        )
        self.memory_system.remember_long_term(
            key=f"identity:state:{self.state.active_profile}",
            value=state_blob,
            source="identity_core.persist_state",
            importance=0.85,
            tags=["identity", "continuity"],
        )

    def restore_state(self) -> None:
        """Restore identity state from local state file or memory system."""

        recovered = self._restore_local_state()

        if recovered is None and self.memory_system is not None:
            recovered = self.memory_system.get("identity:active_state")

        if recovered:
            self.state = IdentityState(
                active_profile=str(recovered.get("active_profile", self.profile.profile_name)),
                profile_version=str(recovered.get("profile_version", self.profile.version)),
                philosophy_version=str(recovered.get("philosophy_version", self.philosophy.version)),
                revision=int(recovered.get("revision", 1)),
                last_loaded_at=str(recovered.get("last_loaded_at", datetime.now(timezone.utc).isoformat())),
                last_applied_at=str(recovered.get("last_applied_at", datetime.now(timezone.utc).isoformat())),
            )

    def state_as_dict(self) -> Dict[str, Any]:
        return {
            "active_profile": self.state.active_profile,
            "profile_version": self.state.profile_version,
            "philosophy_version": self.state.philosophy_version,
            "revision": self.state.revision,
            "last_loaded_at": self.state.last_loaded_at,
            "last_applied_at": self.state.last_applied_at,
            "profile": self.profile.as_dict(),
            "philosophy": self.philosophy.as_dict(),
            "interaction_style": self.interaction_style.as_dict(),
        }

    def _persist_default_config(self) -> None:
        payload = {
            "personality_profile": self.profile.as_dict(),
            "decision_philosophy": self.philosophy.as_dict(),
            "interaction_style": self.interaction_style.as_dict(),
        }
        self.config_path.parent.mkdir(parents=True, exist_ok=True)
        self.config_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    def _state_file_path(self) -> Path:
        return self.config_path.with_name("identity_state.json")

    def _persist_local_state(self, payload: Mapping[str, Any]) -> None:
        self._state_file_path().write_text(json.dumps(dict(payload), indent=2), encoding="utf-8")

    def _restore_local_state(self) -> Optional[Dict[str, Any]]:
        state_path = self._state_file_path()
        if not state_path.exists():
            return None
        try:
            return json.loads(state_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return None

