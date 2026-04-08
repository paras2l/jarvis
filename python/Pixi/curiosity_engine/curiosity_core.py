"""Curiosity Core scheduler for autonomous Pixi research cycles.

Pipeline:
1. Detect knowledge gaps.
2. Generate research questions.
3. Gather external information.
4. Summarize findings.
5. Update long-term memory and world model.

Safety controls:
- bounded cycle frequency
- per-cycle caps on questions and network fetches
- source verification before persistence
- loop prevention using recent cycle fingerprints
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from threading import RLock
from typing import Any, Dict, Iterable, List, Mapping, Optional

from Pixi.core.contracts import ContextSnapshot
from Pixi.core.planner.planner_engine import PlannerEngine
from Pixi.curiosity_engine.knowledge_gap_detector import KnowledgeGapDetector, KnowledgeGapReport
from Pixi.curiosity_engine.knowledge_summarizer import KnowledgeSummarizer, SummaryBatch
from Pixi.curiosity_engine.learning_memory_updater import LearningMemoryUpdater, UpdateBatch
from Pixi.curiosity_engine.question_generator import QuestionGenerationReport, QuestionGenerator
from Pixi.curiosity_engine.research_agent import ResearchAgent, ResearchBatch
from Pixi.memory.memory_system import MemorySystem
from Pixi.reasoning_engine.reasoning_core import ReasoningCore
from Pixi.system_bus.bus_core import SystemBus
from Pixi.world_model.world_state import WorldStateModel


@dataclass(slots=True)
class CuriosityPolicy:
    """Guardrails for autonomous curiosity cycles."""

    min_minutes_between_cycles: int = 30
    max_cycles_per_day: int = 24
    max_questions_per_cycle: int = 12
    max_questions_per_gap: int = 2
    max_hits_per_question: int = 10
    max_research_questions_per_cycle: int = 8
    min_summary_confidence: float = 0.55
    max_consecutive_idle_cycles: int = 5
    max_repeated_fingerprint: int = 2


@dataclass(slots=True)
class CuriosityCycleResult:
    cycle_id: str
    started_at: str
    completed_at: str
    triggered: bool
    reason: str
    gap_report: KnowledgeGapReport | None = None
    question_report: QuestionGenerationReport | None = None
    research_batches: List[ResearchBatch] = field(default_factory=list)
    summary_batch: SummaryBatch | None = None
    update_batch: UpdateBatch | None = None
    notes: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)


class CuriosityCore:
    """Central autonomous research scheduler for curiosity-driven learning."""

    def __init__(
        self,
        memory: MemorySystem,
        world_model: WorldStateModel,
        reasoning: ReasoningCore,
        planner: PlannerEngine,
        *,
        system_bus: SystemBus | None = None,
        policy: CuriosityPolicy | None = None,
        detector: KnowledgeGapDetector | None = None,
        question_generator: QuestionGenerator | None = None,
        research_agent: ResearchAgent | None = None,
        summarizer: KnowledgeSummarizer | None = None,
        updater: LearningMemoryUpdater | None = None,
    ) -> None:
        self._memory = memory
        self._world_model = world_model
        self._reasoning = reasoning
        self._planner = planner
        self._bus = system_bus
        self.policy = policy or CuriosityPolicy()

        self.detector = detector or KnowledgeGapDetector(memory=memory, world_model=world_model)
        self.question_generator = question_generator or QuestionGenerator(memory=memory)
        self.research_agent = research_agent or ResearchAgent(memory=memory)
        self.summarizer = summarizer or KnowledgeSummarizer(memory=memory)
        self.updater = updater or LearningMemoryUpdater(memory=memory, world_model=world_model)

        self._lock = RLock()
        self._cycle_counter = 0
        self._cycles_today = 0
        self._day_anchor = datetime.now(timezone.utc).date()
        self._last_cycle_at: datetime | None = None
        self._paused = False
        self._recent_fingerprints: Dict[str, int] = {}
        self._idle_streak = 0
        self._history: List[CuriosityCycleResult] = []

    def run_cycle(
        self,
        *,
        context: ContextSnapshot,
        force: bool = False,
        focus_domains: Iterable[str] | None = None,
    ) -> CuriosityCycleResult:
        started = datetime.now(timezone.utc)
        cycle_id = f"curiosity-{self._cycle_counter + 1}-{int(started.timestamp())}"

        triggered, reason = self._can_run(now=started, force=force)
        if not triggered:
            result = CuriosityCycleResult(
                cycle_id=cycle_id,
                started_at=started.isoformat(),
                completed_at=datetime.now(timezone.utc).isoformat(),
                triggered=False,
                reason=reason,
                notes=["cycle_skipped"],
                metadata={"force": force},
            )
            self._record(result)
            self._publish("curiosity.cycle.skipped", {"cycle_id": cycle_id, "reason": reason})
            return result

        self._cycle_counter += 1
        self._mark_cycle_started(started)
        self._publish("curiosity.cycle.started", {"cycle_id": cycle_id, "force": force})

        notes: List[str] = []
        gap_report = self.detector.detect(
            focus_domains=focus_domains,
            limit=max(4, self.policy.max_questions_per_cycle),
        )
        if not gap_report.gaps:
            self._idle_streak += 1
            notes.append("no_gaps_detected")
            result = CuriosityCycleResult(
                cycle_id=cycle_id,
                started_at=started.isoformat(),
                completed_at=datetime.now(timezone.utc).isoformat(),
                triggered=True,
                reason="no_gaps",
                gap_report=gap_report,
                notes=notes,
                metadata={"idle_streak": self._idle_streak},
            )
            self._record(result)
            self._publish("curiosity.cycle.completed", {"cycle_id": cycle_id, "reason": "no_gaps", "gap_count": 0})
            return result

        question_report = self.question_generator.generate(
            gap_report.gaps,
            max_questions=self.policy.max_questions_per_cycle,
            per_gap=self.policy.max_questions_per_gap,
        )

        fingerprint = self._fingerprint(question_report)
        repeated = self._recent_fingerprints.get(fingerprint, 0)
        if repeated >= self.policy.max_repeated_fingerprint:
            self._idle_streak += 1
            notes.append("loop_guard_triggered")
            result = CuriosityCycleResult(
                cycle_id=cycle_id,
                started_at=started.isoformat(),
                completed_at=datetime.now(timezone.utc).isoformat(),
                triggered=True,
                reason="loop_guard",
                gap_report=gap_report,
                question_report=question_report,
                notes=notes,
                metadata={"fingerprint": fingerprint, "repeated": repeated},
            )
            self._record(result)
            self._publish("curiosity.cycle.blocked", {"cycle_id": cycle_id, "reason": "loop_guard", "fingerprint": fingerprint})
            return result

        self._recent_fingerprints[fingerprint] = repeated + 1

        selected_questions = question_report.questions[: self.policy.max_research_questions_per_cycle]
        research_batches = self.research_agent.gather_many(
            selected_questions,
            max_questions=self.policy.max_research_questions_per_cycle,
            max_hits_per_question=self.policy.max_hits_per_question,
        )

        summary_batch = self.summarizer.summarize_many(selected_questions, research_batches)
        update_batch = self.updater.apply(
            summary_batch,
            min_confidence=self.policy.min_summary_confidence,
            world_refresh_context=context,
        )

        stored_count = sum(1 for row in update_batch.records if row.stored)
        if stored_count == 0:
            self._idle_streak += 1
            notes.append("no_verified_updates_stored")
            reason_out = "no_verified_updates"
        else:
            self._idle_streak = 0
            reason_out = "ok"

        self._emit_integrations(context, gap_report, question_report, update_batch)

        result = CuriosityCycleResult(
            cycle_id=cycle_id,
            started_at=started.isoformat(),
            completed_at=datetime.now(timezone.utc).isoformat(),
            triggered=True,
            reason=reason_out,
            gap_report=gap_report,
            question_report=question_report,
            research_batches=research_batches,
            summary_batch=summary_batch,
            update_batch=update_batch,
            notes=notes,
            metadata={
                "fingerprint": fingerprint,
                "stored_count": stored_count,
                "question_count": len(selected_questions),
                "idle_streak": self._idle_streak,
            },
        )
        self._record(result)
        self._publish(
            "curiosity.cycle.completed",
            {
                "cycle_id": cycle_id,
                "reason": reason_out,
                "gap_count": len(gap_report.gaps),
                "question_count": len(selected_questions),
                "stored_count": stored_count,
            },
        )
        return result

    def maybe_run(self, *, context: ContextSnapshot, focus_domains: Iterable[str] | None = None) -> CuriosityCycleResult:
        return self.run_cycle(context=context, force=False, focus_domains=focus_domains)

    def pause(self) -> None:
        self._paused = True
        self._publish("curiosity.paused", {"paused": True})

    def resume(self) -> None:
        self._paused = False
        self._publish("curiosity.resumed", {"paused": False})

    def diagnostics(self) -> Dict[str, Any]:
        latest = self._history[-1] if self._history else None
        return {
            "paused": self._paused,
            "cycle_counter": self._cycle_counter,
            "cycles_today": self._cycles_today,
            "last_cycle_at": None if self._last_cycle_at is None else self._last_cycle_at.isoformat(),
            "idle_streak": self._idle_streak,
            "recent_fingerprint_count": len(self._recent_fingerprints),
            "latest": None
            if latest is None
            else {
                "cycle_id": latest.cycle_id,
                "triggered": latest.triggered,
                "reason": latest.reason,
                "notes": list(latest.notes),
                "metadata": dict(latest.metadata),
            },
            "policy": {
                "min_minutes_between_cycles": self.policy.min_minutes_between_cycles,
                "max_cycles_per_day": self.policy.max_cycles_per_day,
                "max_questions_per_cycle": self.policy.max_questions_per_cycle,
                "max_questions_per_gap": self.policy.max_questions_per_gap,
                "max_hits_per_question": self.policy.max_hits_per_question,
                "max_research_questions_per_cycle": self.policy.max_research_questions_per_cycle,
                "min_summary_confidence": self.policy.min_summary_confidence,
                "max_consecutive_idle_cycles": self.policy.max_consecutive_idle_cycles,
                "max_repeated_fingerprint": self.policy.max_repeated_fingerprint,
            },
        }

    def handle_bus_message(self, message: Dict[str, Any]) -> Dict[str, Any]:
        topic = str(message.get("topic", "")).lower()
        payload = dict(message.get("payload", {}))

        if topic in {"curiosity.run", "curiosity.cycle"}:
            context = payload.get("context")
            if context is None:
                return {"status": "error", "reason": "missing_context"}
            result = self.run_cycle(
                context=context,
                force=bool(payload.get("force", False)),
                focus_domains=list(payload.get("focus_domains", [])),
            )
            return {
                "cycle_id": result.cycle_id,
                "triggered": result.triggered,
                "reason": result.reason,
                "stored": 0 if result.update_batch is None else sum(1 for row in result.update_batch.records if row.stored),
            }

        if topic in {"curiosity.pause"}:
            self.pause()
            return {"status": "ok", "paused": True}

        if topic in {"curiosity.resume"}:
            self.resume()
            return {"status": "ok", "paused": False}

        if topic in {"curiosity.diagnostics"}:
            return self.diagnostics()

        return {"status": "ignored", "topic": topic}

    def _emit_integrations(
        self,
        context: ContextSnapshot,
        gaps: KnowledgeGapReport,
        questions: QuestionGenerationReport,
        updates: UpdateBatch,
    ) -> None:
        self._memory.remember_short_term(
            key="curiosity:last_cycle_integration",
            value={
                "gap_count": len(gaps.gaps),
                "question_count": len(questions.questions),
                "stored_count": sum(1 for row in updates.records if row.stored),
                "world_health": self._world_model.current().system_health,
            },
            tags=["curiosity", "integration"],
        )

        planning_goal = self._suggest_planning_goal(gaps)
        self._bus_send(
            source="curiosity_engine",
            topic="planning.curiosity_hint",
            payload={
                "planning_goal": planning_goal,
                "gap_count": len(gaps.gaps),
                "top_domains": sorted({row.domain for row in gaps.top(4)}),
            },
            target="planning_system",
            message_type="notification",
        )

        self._bus_send(
            source="curiosity_engine",
            topic="reasoning.curiosity_context",
            payload={
                "context_app": context.current_application,
                "context_activity": context.user_activity,
                "stored_updates": sum(1 for row in updates.records if row.stored),
                "top_gaps": [row.title for row in gaps.top(3)],
            },
            target="reasoning_engine",
            message_type="notification",
        )

    def _suggest_planning_goal(self, gaps: KnowledgeGapReport) -> str:
        top = gaps.top(1)
        if not top:
            return "Review recent curiosity updates and refine active plans."
        lead = top[0]
        return f"Integrate new knowledge on {lead.domain.replace('_', ' ')} to reduce '{lead.title.lower()}' risk."

    def _can_run(self, *, now: datetime, force: bool) -> tuple[bool, str]:
        if self._paused and not force:
            return False, "paused"

        with self._lock:
            if now.date() != self._day_anchor:
                self._day_anchor = now.date()
                self._cycles_today = 0

            if not force:
                if self._cycles_today >= self.policy.max_cycles_per_day:
                    return False, "daily_limit"
                if self._last_cycle_at is not None:
                    elapsed = now - self._last_cycle_at
                    if elapsed < timedelta(minutes=self.policy.min_minutes_between_cycles):
                        return False, "frequency_limit"
                if self._idle_streak >= self.policy.max_consecutive_idle_cycles:
                    return False, "idle_streak_limit"

        return True, "scheduled"

    def _mark_cycle_started(self, now: datetime) -> None:
        with self._lock:
            self._last_cycle_at = now
            self._cycles_today += 1

    @staticmethod
    def _fingerprint(report: QuestionGenerationReport) -> str:
        keys = sorted(item.question.strip().lower() for item in report.questions[:8])
        return "|".join(keys)

    def _record(self, result: CuriosityCycleResult) -> None:
        self._history.append(result)
        if len(self._history) > 300:
            self._history = self._history[-300:]

        payload = {
            "type": "curiosity_cycle",
            "cycle_id": result.cycle_id,
            "started_at": result.started_at,
            "completed_at": result.completed_at,
            "triggered": result.triggered,
            "reason": result.reason,
            "notes": list(result.notes),
            "metadata": dict(result.metadata),
            "counts": {
                "gaps": 0 if result.gap_report is None else len(result.gap_report.gaps),
                "questions": 0 if result.question_report is None else len(result.question_report.questions),
                "research_batches": len(result.research_batches),
                "summaries": 0 if result.summary_batch is None else len(result.summary_batch.records),
                "updates": 0 if result.update_batch is None else len(result.update_batch.records),
            },
        }
        self._memory.remember_short_term(
            key="curiosity:last_cycle",
            value=payload,
            tags=["curiosity", "cycle"],
        )
        self._memory.remember_long_term(
            key=f"curiosity:cycle:{result.cycle_id}",
            value=payload,
            source="curiosity_engine.curiosity_core",
            importance=0.82,
            tags=["curiosity", "cycle"],
        )

    def _publish(self, event_type: str, payload: Dict[str, Any], *, severity: str = "info") -> None:
        if self._bus is None:
            return
        self._bus.publish_event(
            event_type=event_type,
            source="curiosity_engine",
            payload=payload,
            topic=event_type,
            severity=severity,
            tags=["curiosity", "system_bus"],
        )

    def _bus_send(
        self,
        *,
        source: str,
        topic: str,
        payload: Dict[str, Any],
        target: str | None,
        message_type: str,
    ) -> None:
        if self._bus is None:
            return
        self._bus.send(
            source=source,
            topic=topic,
            payload=payload,
            target=target,
            message_type=message_type,
            tags=["curiosity", "integration"],
        )

