"""Research question generation for the Curiosity Engine."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List

from jarvis.curiosity_engine.knowledge_gap_detector import KnowledgeGap
from jarvis.memory.memory_system import MemorySystem


@dataclass(slots=True)
class ResearchQuestion:
    question_id: str
    question: str
    domain: str
    gap_id: str
    intent: str
    priority: int
    breadth: str = "medium"
    expected_sources: List[str] = field(default_factory=list)
    tags: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class QuestionGenerationReport:
    generated_at: str
    questions: List[ResearchQuestion] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)


class QuestionGenerator:
    """Generate concrete, answerable research questions from knowledge gaps."""

    def __init__(self, memory: MemorySystem) -> None:
        self._memory = memory

    def generate(
        self,
        gaps: Iterable[KnowledgeGap],
        *,
        max_questions: int = 24,
        per_gap: int = 2,
    ) -> QuestionGenerationReport:
        now = datetime.now(timezone.utc).isoformat()
        out: List[ResearchQuestion] = []

        for gap in list(gaps):
            out.extend(self._questions_for_gap(gap, per_gap=per_gap))

        out = self._deduplicate(out)
        out = sorted(out, key=lambda row: row.priority, reverse=True)[: max(1, int(max_questions))]

        report = QuestionGenerationReport(
            generated_at=now,
            questions=out,
            metadata={
                "source_gap_count": len(list(gaps)) if not isinstance(gaps, list) else len(gaps),
                "question_count": len(out),
                "max_questions": max_questions,
                "per_gap": per_gap,
            },
        )
        self._persist(report)
        return report

    def _questions_for_gap(self, gap: KnowledgeGap, *, per_gap: int) -> List[ResearchQuestion]:
        templates = self._templates_for_domain(gap.domain)
        generic = self._generic_templates()
        candidates = templates + generic

        questions: List[ResearchQuestion] = []
        for template in candidates[: max(1, per_gap * 3)]:
            text = template.format(domain=gap.domain, title=gap.title, description=gap.description)
            if not self._is_high_quality(text):
                continue
            questions.append(
                self._mk_question(
                    gap=gap,
                    text=text,
                    intent=self._intent_for_text(text),
                    priority=self._priority_for_gap(gap),
                )
            )
            if len(questions) >= per_gap:
                break

        if not questions:
            fallback = f"What are the most important current developments in {gap.domain.replace('_', ' ')} relevant to {gap.title.lower()}?"
            questions.append(
                self._mk_question(
                    gap=gap,
                    text=fallback,
                    intent="trend_analysis",
                    priority=self._priority_for_gap(gap),
                )
            )
        return questions

    @staticmethod
    def _templates_for_domain(domain: str) -> List[str]:
        mapping: Dict[str, List[str]] = {
            "market_intelligence": [
                "What are emerging companies and trends in {domain} this quarter?",
                "Which recent policy or macroeconomic changes are affecting {domain}?",
                "What leading indicators currently predict directional changes in {domain}?",
            ],
            "risk_intelligence": [
                "What newly identified risk vectors are most relevant to {title}?",
                "Which mitigation strategies are currently recommended by trusted sources for {domain}?",
                "How have major failures in {domain} been prevented in the last 12 months?",
            ],
            "planning_resilience": [
                "What workflow patterns improve reliability under uncertainty for {domain}?",
                "Which modern planning frameworks reduce rework in {domain}?",
                "What are high-leverage checkpoints to prevent planning failures in {domain}?",
            ],
            "reasoning_support": [
                "What updated reference knowledge reduces uncertainty for {title}?",
                "Which competing interpretations exist for {description}?",
                "What high-confidence facts should anchor reasoning in {domain}?",
            ],
            "execution_optimization": [
                "What are the fastest validated execution strategies for {domain}?",
                "Which automation tools currently provide the best ROI in {domain}?",
                "What bottlenecks are most common when executing tasks like {title}?",
            ],
            "capability_intelligence": [
                "Which capabilities are becoming essential for robust autonomy in {domain}?",
                "What capability gaps are repeatedly reported by similar AI systems?",
                "What new tool categories best close current capability gaps in {domain}?",
            ],
            "world_model": [
                "Which external signals should update world-model confidence for {title}?",
                "What evidence sources best reduce uncertainty in current world-state assumptions?",
                "What recent events invalidate prior assumptions related to {domain}?",
            ],
        }
        return mapping.get(domain, [])

    @staticmethod
    def _generic_templates() -> List[str]:
        return [
            "What are the latest high-confidence updates related to {title}?",
            "Which primary sources provide verifiable data for {domain}?",
            "What consensus and disagreements currently exist around {description}?",
            "Which developments in the last 30 days materially changed {domain}?",
            "What should be monitored weekly to keep {domain} up to date?",
        ]

    @staticmethod
    def _intent_for_text(text: str) -> str:
        lowered = text.lower()
        if "trend" in lowered or "latest" in lowered or "developments" in lowered:
            return "trend_analysis"
        if "risk" in lowered or "mitigation" in lowered:
            return "risk_assessment"
        if "strategy" in lowered or "framework" in lowered:
            return "strategy_research"
        if "consensus" in lowered or "disagreements" in lowered:
            return "evidence_comparison"
        return "general_research"

    @staticmethod
    def _priority_for_gap(gap: KnowledgeGap) -> int:
        score = gap.score
        if score >= 0.85:
            return 95
        if score >= 0.72:
            return 82
        if score >= 0.6:
            return 68
        return 55

    @staticmethod
    def _is_high_quality(question: str) -> bool:
        text = question.strip()
        if len(text) < 24:
            return False
        if not text.endswith("?"):
            return False
        return True

    def _persist(self, report: QuestionGenerationReport) -> None:
        payload = {
            "type": "curiosity_question_report",
            "generated_at": report.generated_at,
            "metadata": dict(report.metadata),
            "questions": [
                {
                    "question_id": row.question_id,
                    "question": row.question,
                    "domain": row.domain,
                    "gap_id": row.gap_id,
                    "intent": row.intent,
                    "priority": row.priority,
                    "sources": list(row.expected_sources),
                }
                for row in report.questions
            ],
        }
        self._memory.remember_short_term(
            key="curiosity:last_question_report",
            value=payload,
            tags=["curiosity", "questions"],
        )
        self._memory.remember_long_term(
            key=f"curiosity:question_report:{report.generated_at}",
            value=payload,
            source="curiosity_engine.question_generator",
            importance=0.73,
            tags=["curiosity", "questions"],
        )

    def _mk_question(self, *, gap: KnowledgeGap, text: str, intent: str, priority: int) -> ResearchQuestion:
        expected_sources = self._sources_for_intent(intent)
        return ResearchQuestion(
            question_id=f"q-{datetime.now(timezone.utc).timestamp()}-{abs(hash(text)) % 100000}",
            question=text,
            domain=gap.domain,
            gap_id=gap.gap_id,
            intent=intent,
            priority=priority,
            breadth="wide" if gap.novelty >= 0.75 else "medium",
            expected_sources=expected_sources,
            tags=list(dict.fromkeys([gap.domain, intent, *gap.tags])),
            metadata={
                "generated_at": datetime.now(timezone.utc).isoformat(),
                "gap_title": gap.title,
                "gap_score": gap.score,
            },
        )

    @staticmethod
    def _sources_for_intent(intent: str) -> List[str]:
        if intent == "trend_analysis":
            return ["news", "market_reports", "primary_data"]
        if intent == "risk_assessment":
            return ["policy", "regulatory", "incident_reports"]
        if intent == "strategy_research":
            return ["papers", "whitepapers", "case_studies"]
        if intent == "evidence_comparison":
            return ["multi_source", "peer_reviewed", "official_docs"]
        return ["web_search", "official_docs"]

    @staticmethod
    def _deduplicate(rows: List[ResearchQuestion]) -> List[ResearchQuestion]:
        seen: set[str] = set()
        out: List[ResearchQuestion] = []
        for row in rows:
            key = row.question.strip().lower()
            if key in seen:
                continue
            seen.add(key)
            out.append(row)
        return out
