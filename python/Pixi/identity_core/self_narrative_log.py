"""Self Narrative Log for Pixi AI system.

Maintains a chronological timeline of system activities, achievements, and
milestones to provide continuity across sessions and enable self-reflection.

Records:
- Major accomplishments
- Problem-solving sessions
- Learning moments
- User interactions of note
- System state transitions
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List

from Pixi.memory.memory_system import MemorySystem


@dataclass(slots=True)
class NarrativeEntry:
    """A single entry in the self-narrative log."""

    entry_id: str
    timestamp: str
    entry_type: str  # accomplishment, learning, problem_solved, interaction, state_change
    title: str
    description: str
    agents_involved: List[str] = field(default_factory=list)
    systems_involved: List[str] = field(default_factory=list)
    outcome: str = ""
    impact_assessment: str = ""  # positive, neutral, negative
    confidence_in_memory: float = 0.95
    related_entries: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class SessionNarrative:
    """Summary of a session or time period."""

    session_id: str
    started_at: str
    ended_at: str
    session_type: str = "regular"  # regular, special, milestone
    major_events: List[str] = field(default_factory=list)
    problems_encountered: List[str] = field(default_factory=list)
    problems_solved: List[str] = field(default_factory=list)
    key_learnings: List[str] = field(default_factory=list)
    users_interacted: List[str] = field(default_factory=list)
    overall_sentiment: str = "positive"  # positive, neutral, negative
    session_summary: str = ""
    notable_achievements: List[str] = field(default_factory=list)


class SelfNarrativeLog:
    """Maintain a chronological narrative of system activities."""

    def __init__(self, memory: MemorySystem) -> None:
        self._memory = memory
        self._entries: Dict[str, NarrativeEntry] = {}
        self._sessions: Dict[str, SessionNarrative] = {}
        self._entry_sequence: List[str] = []  # Ordered list of entry IDs
        self._current_session: SessionNarrative | None = None

    def create_entry(
        self,
        entry_type: str,
        title: str,
        description: str,
        agents_involved: List[str] | None = None,
        systems_involved: List[str] | None = None,
        impact: str = "neutral",
    ) -> NarrativeEntry:
        """Create a new narrative entry."""
        entry_id = f"entry_{len(self._entries):06d}"
        now = datetime.now(timezone.utc).isoformat()

        entry = NarrativeEntry(
            entry_id=entry_id,
            timestamp=now,
            entry_type=entry_type,
            title=title,
            description=description,
            agents_involved=agents_involved or [],
            systems_involved=systems_involved or [],
            impact_assessment=impact,
        )

        self._entries[entry_id] = entry
        self._entry_sequence.append(entry_id)
        self._persist_entry(entry)

        # Add to current session if active
        if self._current_session:
            self._current_session.major_events.append(title)

        return entry

    def start_session(self, session_type: str = "regular") -> SessionNarrative:
        """Start a new session."""
        session_id = f"session_{len(self._sessions):04d}"
        now = datetime.now(timezone.utc).isoformat()

        session = SessionNarrative(
            session_id=session_id,
            started_at=now,
            ended_at="",
            session_type=session_type,
        )

        self._sessions[session_id] = session
        self._current_session = session
        return session

    def end_session(self, summary: str = "", sentiment: str = "positive") -> SessionNarrative | None:
        """End the current session."""
        if not self._current_session:
            return None

        session = self._current_session
        session.ended_at = datetime.now(timezone.utc).isoformat()
        session.session_summary = summary
        session.overall_sentiment = sentiment

        self._persist_session(session)
        self._current_session = None

        return session

    def record_accomplishment(
        self,
        title: str,
        description: str,
        significance: float = 0.7,
    ) -> NarrativeEntry:
        """Record a system accomplishment."""
        entry = self.create_entry(
            entry_type="accomplishment",
            title=title,
            description=description,
            impact="positive",
        )
        entry.confidence_in_memory = min(1.0, max(0.0, significance))
        return entry

    def record_problem_solving(
        self,
        problem_statement: str,
        solution: str,
        agents_involved: List[str] | None = None,
        success_level: float = 1.0,
    ) -> NarrativeEntry:
        """Record a problem-solving session."""
        entry = self.create_entry(
            entry_type="problem_solved",
            title=f"Problem: {problem_statement[:50]}...",
            description=f"Solution: {solution}",
            agents_involved=agents_involved,
            impact="positive" if success_level > 0.7 else "neutral",
        )

        if self._current_session:
            self._current_session.problems_solved.append(problem_statement)

        return entry

    def record_learning(
        self,
        learned_concept: str,
        context: str,
        applicability: str = "general",
    ) -> NarrativeEntry:
        """Record a learning moment."""
        entry = self.create_entry(
            entry_type="learning",
            title=f"Learned: {learned_concept}",
            description=f"In context of {context}, applicable to {applicability}",
        )

        if self._current_session:
            self._current_session.key_learnings.append(learned_concept)

        return entry

    def get_narrative_arc(self, limit: int = 20) -> List[str]:
        """Get recent narrative entries as a story arc."""
        recent_ids = self._entry_sequence[-limit:]
        narratives = []

        for entry_id in recent_ids:
            entry = self._entries[entry_id]
            narrative_line = f"[{entry.entry_type}] {entry.title}: {entry.description[:60]}..."
            narratives.append(narrative_line)

        return narratives

    def get_self_narrative(self) -> str:
        """Generate a narrative of the system's journey and growth."""
        if not self._entries:
            return "No narrative history yet."

        # Collect major events
        accomplishments = [
            e.title for e in self._entries.values()
            if e.entry_type == "accomplishment"
        ]
        learnings = [
            e.title for e in self._entries.values()
            if e.entry_type == "learning"
        ]
        problems_solved = [
            e.title for e in self._entries.values()
            if e.entry_type == "problem_solved"
        ]

        narrative = f"""
I have grown and evolved through my experiences:

Notable Accomplishments ({len(accomplishments)}):
{chr(10).join(f"  - {a}" for a in accomplishments[-5:])}

Key Learnings ({len(learnings)}):
{chr(10).join(f"  - {l}" for l in learnings[-5:])}

Problems Solved ({len(problems_solved)}):
{chr(10).join(f"  - {p}" for p in problems_solved[-5:])}

Total Entries in Narrative: {len(self._entries)}
Sessions Completed: {sum(1 for s in self._sessions.values() if s.ended_at)}
        """.strip()

        return narrative

    def search_narrative(self, keyword: str) -> List[NarrativeEntry]:
        """Search narrative for entries matching a keyword."""
        matching = []
        keyword_lower = keyword.lower()

        for entry in self._entries.values():
            if (keyword_lower in entry.title.lower() or
                keyword_lower in entry.description.lower() or
                keyword_lower in entry.entry_type.lower()):
                matching.append(entry)

        return matching

    def get_sessions(self, limit: int = 10) -> List[SessionNarrative]:
        """Get recent completed sessions."""
        completed = [s for s in self._sessions.values() if s.ended_at]
        return sorted(completed, key=lambda s: s.started_at, reverse=True)[:limit]

    def diagnostics(self) -> Dict[str, Any]:
        """Return narrative diagnostics."""
        by_type = {}
        for entry in self._entries.values():
            by_type[entry.entry_type] = by_type.get(entry.entry_type, 0) + 1

        completed_sessions = sum(1 for s in self._sessions.values() if s.ended_at)

        positive_impact = sum(
            1 for e in self._entries.values()
            if e.impact_assessment == "positive"
        )
        negative_impact = sum(
            1 for e in self._entries.values()
            if e.impact_assessment == "negative"
        )

        return {
            "total_entries": len(self._entries),
            "entries_by_type": by_type,
            "total_sessions": len(self._sessions),
            "completed_sessions": completed_sessions,
            "current_session_active": self._current_session is not None,
            "positive_impact_entries": positive_impact,
            "negative_impact_entries": negative_impact,
            "avg_memory_confidence": (
                sum(e.confidence_in_memory for e in self._entries.values()) / len(self._entries)
                if self._entries
                else 0.0
            ),
        }

    def _persist_entry(self, entry: NarrativeEntry) -> None:
        """Store narrative entry in persistent memory."""
        self._memory.remember_long_term(
            key=f"narrative_entry:{entry.entry_id}",
            value={
                "entry_id": entry.entry_id,
                "timestamp": entry.timestamp,
                "entry_type": entry.entry_type,
                "title": entry.title,
                "description": entry.description[:200],  # Truncate for storage
                "impact_assessment": entry.impact_assessment,
            },
            source="identity_core.self_narrative_log",
            importance=0.8,
            tags=["narrative", "log", "entry"],
        )

        # Also add to semantic memory for search
        doc_text = f"{entry.title}. {entry.description}"
        self._memory.remember_semantic(
            doc_id=f"narrative:{entry.entry_id}",
            text=doc_text,
            metadata={
                "entry_type": entry.entry_type,
                "timestamp": entry.timestamp,
                "impact": entry.impact_assessment,
            },
        )

    def _persist_session(self, session: SessionNarrative) -> None:
        """Store session in persistent memory."""
        self._memory.remember_long_term(
            key=f"session_narrative:{session.session_id}",
            value={
                "session_id": session.session_id,
                "started_at": session.started_at,
                "ended_at": session.ended_at,
                "session_type": session.session_type,
                "major_events": len(session.major_events),
                "overall_sentiment": session.overall_sentiment,
            },
            source="identity_core.self_narrative_log",
            importance=0.8,
            tags=["narrative", "session"],
        )

