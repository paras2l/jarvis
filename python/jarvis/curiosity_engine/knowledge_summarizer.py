"""Summarize raw research findings into structured long-term knowledge."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from statistics import mean
from typing import Any, Dict, Iterable, List

from jarvis.curiosity_engine.question_generator import ResearchQuestion
from jarvis.curiosity_engine.research_agent import ResearchBatch, ResearchHit
from jarvis.memory.memory_system import MemorySystem


@dataclass(slots=True)
class SummaryRecord:
    summary_id: str
    question_id: str
    domain: str
    title: str
    summary_text: str
    key_points: List[str] = field(default_factory=list)
    citations: List[Dict[str, Any]] = field(default_factory=list)
    confidence: float = 0.0
    freshness_hint: str = ""
    tags: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class SummaryBatch:
    generated_at: str
    records: List[SummaryRecord] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)


class KnowledgeSummarizer:
    """Convert noisy research data into concise validated knowledge notes."""

    def __init__(self, memory: MemorySystem) -> None:
        self._memory = memory

    def summarize_one(self, question: ResearchQuestion, research: ResearchBatch) -> SummaryRecord:
        trusted_hits = [hit for hit in research.hits if hit.credibility >= 0.55]
        key_points = self._extract_points(trusted_hits, max_points=6)
        confidence = self._confidence(trusted_hits)

        title = f"Research update: {question.domain.replace('_', ' ').title()}"
        summary_text = self._compose_summary(question, trusted_hits, key_points, confidence)

        record = SummaryRecord(
            summary_id=f"sum-{datetime.now(timezone.utc).timestamp()}-{abs(hash(question.question_id)) % 100000}",
            question_id=question.question_id,
            domain=question.domain,
            title=title,
            summary_text=summary_text,
            key_points=key_points,
            citations=[self._citation(hit) for hit in trusted_hits[:8]],
            confidence=confidence,
            freshness_hint=self._freshness_hint(trusted_hits),
            tags=list(dict.fromkeys([question.domain, question.intent, *question.tags])),
            metadata={
                "question": question.question,
                "question_priority": question.priority,
                "source_count": len(trusted_hits),
                "blocked_sources": len(research.blocked_sources),
                "generated_at": datetime.now(timezone.utc).isoformat(),
            },
        )
        self._persist_record(record)
        return record

    def summarize_many(
        self,
        questions: Iterable[ResearchQuestion],
        batches: Iterable[ResearchBatch],
    ) -> SummaryBatch:
        question_map = {row.question_id: row for row in questions}
        out: List[SummaryRecord] = []
        for batch in batches:
            question = question_map.get(batch.question_id)
            if question is None:
                continue
            out.append(self.summarize_one(question, batch))

        summary_batch = SummaryBatch(
            generated_at=datetime.now(timezone.utc).isoformat(),
            records=out,
            metadata={
                "count": len(out),
                "domains": sorted({row.domain for row in out}),
                "avg_confidence": round(mean([row.confidence for row in out]), 4) if out else 0.0,
            },
        )
        self._persist_batch(summary_batch)
        return summary_batch

    @staticmethod
    def _extract_points(hits: List[ResearchHit], *, max_points: int) -> List[str]:
        points: List[str] = []
        seen: set[str] = set()
        for hit in sorted(hits, key=lambda row: row.credibility, reverse=True):
            raw = hit.snippet.replace("\n", " ").strip()
            if not raw:
                continue
            sentence = raw.split(".", 1)[0].strip()
            if len(sentence) < 20:
                continue
            clean = sentence[:220]
            key = clean.lower()
            if key in seen:
                continue
            seen.add(key)
            points.append(clean)
            if len(points) >= max(1, max_points):
                break
        return points

    @staticmethod
    def _confidence(hits: List[ResearchHit]) -> float:
        if not hits:
            return 0.18
        credibility = mean([item.credibility for item in hits])
        diversity = min(0.2, len({item.source for item in hits}) * 0.04)
        score = min(0.97, credibility * 0.78 + diversity + 0.08)
        return round(max(0.05, score), 4)

    @staticmethod
    def _freshness_hint(hits: List[ResearchHit]) -> str:
        with_dates = [item for item in hits if item.published_at]
        if not with_dates:
            return "unknown"
        latest = sorted(with_dates, key=lambda row: row.published_at, reverse=True)[0]
        return latest.published_at

    @staticmethod
    def _compose_summary(
        question: ResearchQuestion,
        hits: List[ResearchHit],
        points: List[str],
        confidence: float,
    ) -> str:
        intro = (
            f"Question: {question.question} "
            f"Sources reviewed: {len(hits)}. "
            f"Estimated confidence: {confidence:.2f}."
        )
        if not points:
            return intro + " No high-quality factual points were extracted."
        bullets = " ".join(f"[{idx + 1}] {point}." for idx, point in enumerate(points[:6]))
        return intro + " Key findings: " + bullets

    @staticmethod
    def _citation(hit: ResearchHit) -> Dict[str, Any]:
        return {
            "source": hit.source,
            "url": hit.url,
            "title": hit.title,
            "credibility": hit.credibility,
            "published_at": hit.published_at,
        }

    def _persist_record(self, record: SummaryRecord) -> None:
        payload = {
            "type": "curiosity_summary_record",
            "summary_id": record.summary_id,
            "question_id": record.question_id,
            "domain": record.domain,
            "title": record.title,
            "summary_text": record.summary_text,
            "key_points": list(record.key_points),
            "citations": list(record.citations),
            "confidence": record.confidence,
            "freshness_hint": record.freshness_hint,
            "tags": list(record.tags),
            "metadata": dict(record.metadata),
        }
        self._memory.remember_short_term(
            key=f"curiosity:summary:{record.summary_id}",
            value=payload,
            tags=["curiosity", "summary"],
        )
        self._memory.remember_semantic(
            doc_id=f"curiosity:summary:{record.summary_id}",
            text=f"{record.domain} {record.title} {record.summary_text[:800]}",
            metadata={"type": "curiosity_summary", "confidence": record.confidence},
        )

    def _persist_batch(self, batch: SummaryBatch) -> None:
        payload = {
            "type": "curiosity_summary_batch",
            "generated_at": batch.generated_at,
            "metadata": dict(batch.metadata),
            "summary_ids": [item.summary_id for item in batch.records],
        }
        self._memory.remember_long_term(
            key=f"curiosity:summary_batch:{batch.generated_at}",
            value=payload,
            source="curiosity_engine.knowledge_summarizer",
            importance=0.74,
            tags=["curiosity", "summary"],
        )
