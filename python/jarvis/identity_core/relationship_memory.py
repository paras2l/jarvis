"""Relationship Memory for Jarvis AI system.

Stores long-term contextual information about users including preferences,
ongoing projects, goals, interaction history, and relationship quality.

Maintains:
- User preferences and habits
- Project and goal tracking
- Communication history summaries
- Relationship warmth and trust
- User interests and expertise areas
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from jarvis.memory.memory_system import MemorySystem


@dataclass(slots=True)
class UserProfile:
    """Long-term profile of a user."""

    user_id: str
    created_at: str
    last_interaction_at: str
    display_name: str
    expertise_areas: List[str] = field(default_factory=list)
    interests: List[str] = field(default_factory=list)
    communication_preferences: Dict[str, Any] = field(default_factory=dict)
    information_needs: Dict[str, str] = field(default_factory=dict)
    total_interactions: int = 0
    trust_score: float = 0.5  # 0.0 to 1.0
    relationship_warmth: float = 0.5  # feeling of closeness
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class UserGoal:
    """A goal the user is working toward."""

    goal_id: str
    created_at: str
    title: str
    description: str
    status: str = "active"  # active, abandoned, completed
    progress: float = 0.0  # 0.0 to 1.0
    related_projects: List[str] = field(default_factory=list)
    deadline: Optional[str] = None
    priority: str = "normal"  # low, normal, high, critical
    last_mentioned_at: str = ""


@dataclass(slots=True)
class UserProject:
    """An ongoing project or task the user is working on."""

    project_id: str
    created_at: str
    title: str
    description: str
    status: str = "active"  # planning, active, paused, completed
    start_date: Optional[str] = None
    estimated_completion: Optional[str] = None
    related_goals: List[str] = field(default_factory=list)
    context_notes: str = ""
    ai_contributions: List[str] = field(default_factory=list)


@dataclass(slots=True)
class InteractionSummary:
    """Summary of interactions with a user over a time period."""

    period_id: str
    user_id: str
    period_start: str
    period_end: str
    interaction_count: int
    topics_discussed: List[str] = field(default_factory=list)
    problems_solved: int = 0
    questions_asked: int = 0
    user_satisfaction_avg: float = 0.5
    sentiment_trend: str = "neutral"  # positive, neutral, negative
    key_learnings: List[str] = field(default_factory=list)


class RelationshipMemory:
    """Manage long-term relationship and contextual information about users."""

    def __init__(self, memory: MemorySystem) -> None:
        self._memory = memory
        self._user_profiles: Dict[str, UserProfile] = {}
        self._user_goals: Dict[str, UserGoal] = {}
        self._user_projects: Dict[str, UserProject] = {}
        self._interaction_summaries: Dict[str, InteractionSummary] = {}

    def get_or_create_user(self, user_id: str, display_name: str = "User") -> UserProfile:
        """Get existing user profile or create new one."""
        if user_id in self._user_profiles:
            profile = self._user_profiles[user_id]
            profile.last_interaction_at = datetime.now(timezone.utc).isoformat()
            profile.total_interactions += 1
            return profile

        now = datetime.now(timezone.utc).isoformat()
        profile = UserProfile(
            user_id=user_id,
            created_at=now,
            last_interaction_at=now,
            display_name=display_name,
        )

        self._user_profiles[user_id] = profile
        self._persist_user_profile(profile)
        return profile

    def update_user_preferences(self, user_id: str, preferences: Dict[str, Any]) -> None:
        """Update user preferences and communication style preferences."""
        profile = self.get_or_create_user(user_id)

        if "communication_style" in preferences:
            profile.communication_preferences = preferences["communication_style"]
        if "information_depth" in preferences:
            profile.information_needs["depth"] = preferences["information_depth"]
        if "explanation_style" in preferences:
            profile.information_needs["style"] = preferences["explanation_style"]

        self._memory.remember_long_term(
            key=f"user_preferences:{user_id}",
            value=preferences,
            source="identity_core.relationship_memory",
            importance=0.75,
            tags=["user", "preferences"],
        )

    def record_expertise(self, user_id: str, area: str, proficiency_level: float = 0.7) -> None:
        """Record an area of expertise for the user."""
        profile = self.get_or_create_user(user_id)
        if area not in profile.expertise_areas:
            profile.expertise_areas.append(area)

    def record_interest(self, user_id: str, interest: str) -> None:
        """Record an interest of the user."""
        profile = self.get_or_create_user(user_id)
        if interest not in profile.interests:
            profile.interests.append(interest)

    def create_user_goal(
        self,
        user_id: str,
        title: str,
        description: str,
        priority: str = "normal",
    ) -> UserGoal:
        """Create a goal for the user."""
        goal_id = f"goal_{len(self._user_goals):05d}"
        now = datetime.now(timezone.utc).isoformat()

        goal = UserGoal(
            goal_id=goal_id,
            created_at=now,
            title=title,
            description=description,
            priority=priority,
            last_mentioned_at=now,
        )

        self._user_goals[goal_id] = goal
        self._memory.remember_long_term(
            key=f"user_goal:{goal_id}",
            value={
                "user_id": user_id,
                "title": title,
                "status": goal.status,
                "priority": priority,
                "created_at": now,
            },
            source="identity_core.relationship_memory",
            importance=0.8,
            tags=["user", "goal"],
        )

        return goal

    def create_user_project(
        self,
        user_id: str,
        title: str,
        description: str,
    ) -> UserProject:
        """Create a project for the user."""
        project_id = f"project_{len(self._user_projects):05d}"
        now = datetime.now(timezone.utc).isoformat()

        project = UserProject(
            project_id=project_id,
            created_at=now,
            title=title,
            description=description,
        )

        self._user_projects[project_id] = project
        self._memory.remember_long_term(
            key=f"user_project:{project_id}",
            value={
                "user_id": user_id,
                "title": title,
                "status": project.status,
                "created_at": now,
            },
            source="identity_core.relationship_memory",
            importance=0.8,
            tags=["user", "project"],
        )

        return project

    def update_goal_progress(self, goal_id: str, progress: float) -> bool:
        """Update progress on a goal."""
        if goal_id not in self._user_goals:
            return False

        goal = self._user_goals[goal_id]
        goal.progress = max(0.0, min(1.0, progress))

        if goal.progress >= 1.0:
            goal.status = "completed"

        return True

    def get_user_goals(self, user_id: str, status: str = "active") -> List[UserGoal]:
        """Get goals for a user."""
        return [
            g for g in self._user_goals.values()
            if g.status == status or status == "all"
        ]

    def get_user_projects(self, user_id: str, status: str = "active") -> List[UserProject]:
        """Get projects for a user."""
        return [
            p for p in self._user_projects.values()
            if p.status == status or status == "all"
        ]

    def update_trust_score(self, user_id: str, delta: float) -> float:
        """Adjust trust score for a user."""
        profile = self.get_or_create_user(user_id)
        profile.trust_score = max(0.0, min(1.0, profile.trust_score + delta))
        return profile.trust_score

    def update_relationship_warmth(self, user_id: str, delta: float) -> float:
        """Adjust relationship warmth for a user."""
        profile = self.get_or_create_user(user_id)
        profile.relationship_warmth = max(0.0, min(1.0, profile.relationship_warmth + delta))
        return profile.relationship_warmth

    def get_relationship_context(self, user_id: str) -> Dict[str, Any]:
        """Get relationship context for a user."""
        profile = self.get_or_create_user(user_id)

        active_goals = self.get_user_goals(user_id, "active")
        active_projects = self.get_user_projects(user_id, "active")

        return {
            "user_name": profile.display_name,
            "relationship_warmth": profile.relationship_warmth,
            "trust_score": profile.trust_score,
            "total_interactions": profile.total_interactions,
            "expertise_areas": profile.expertise_areas,
            "interests": profile.interests,
            "active_goals": len(active_goals),
            "active_projects": len(active_projects),
            "communication_preferences": profile.communication_preferences,
            "last_interaction": profile.last_interaction_at,
        }

    def record_interaction_summary(
        self,
        user_id: str,
        topics: List[str],
        problems_solved: int = 0,
        satisfaction: float = 0.5,
    ) -> InteractionSummary:
        """Record a summary of interactions."""
        summary_id = f"summary_{len(self._interaction_summaries):05d}"
        now = datetime.now(timezone.utc).isoformat()

        summary = InteractionSummary(
            period_id=summary_id,
            user_id=user_id,
            period_start=now,
            period_end=now,
            interaction_count=1,
            topics_discussed=topics,
            problems_solved=problems_solved,
            user_satisfaction_avg=satisfaction,
        )

        self._interaction_summaries[summary_id] = summary
        return summary

    def diagnostics(self) -> Dict[str, Any]:
        """Return relationship memory diagnostics."""
        return {
            "total_users_known": len(self._user_profiles),
            "total_user_goals_tracked": len(self._user_goals),
            "total_user_projects_tracked": len(self._user_projects),
            "interaction_summaries": len(self._interaction_summaries),
            "avg_trust_score": (
                sum(p.trust_score for p in self._user_profiles.values()) / len(self._user_profiles)
                if self._user_profiles
                else 0.0
            ),
            "avg_relationship_warmth": (
                sum(p.relationship_warmth for p in self._user_profiles.values()) / len(self._user_profiles)
                if self._user_profiles
                else 0.0
            ),
        }

    def _persist_user_profile(self, profile: UserProfile) -> None:
        """Store user profile in persistent memory."""
        self._memory.remember_long_term(
            key=f"user_profile:{profile.user_id}",
            value={
                "user_id": profile.user_id,
                "display_name": profile.display_name,
                "expertise_areas": profile.expertise_areas,
                "interests": profile.interests,
                "trust_score": profile.trust_score,
                "relationship_warmth": profile.relationship_warmth,
                "total_interactions": profile.total_interactions,
            },
            source="identity_core.relationship_memory",
            importance=0.85,
            tags=["user", "profile", "relationship"],
        )
