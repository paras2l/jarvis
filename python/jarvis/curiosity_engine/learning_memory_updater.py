"""Memory and world-model updater for Curiosity Engine learning outputs."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from statistics import mean
from typing import Any, Dict, Iterable, List, Mapping

from jarvis.curiosity_engine.knowledge_summarizer import SummaryBatch, SummaryRecord
from jarvis.memory.memory_system import MemorySystem
from jarvis.world_model.world_state import WorldStateModel


@dataclass(slots=True)
class UpdateRecord:
    update_id: str
    summary_id: str
    stored: bool
    confidence: float
    world_model_updated: bool
    key: str
    notes: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class UpdateBatch:
    generated_at: str
    records: List[UpdateRecord] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)


class LearningMemoryUpdater:
    """Persist verified knowledge and refresh world-model signals."""

    def __init__(self, memory: MemorySystem, world_model: WorldStateModel) -> None:
        self._memory = memory
        self._world_model = world_model

    def apply(
        self,
        summaries: SummaryBatch | Iterable[SummaryRecord],
        *,
        min_confidence: float = 0.52,
        world_refresh_context: Any | None = None,
    ) -> UpdateBatch:
        rows = list(summaries.records) if isinstance(summaries, SummaryBatch) else list(summaries)
        out: List[UpdateRecord] = []

        for summary in rows:
            out.append(self._apply_one(summary, min_confidence=min_confidence))

        world_updated = any(item.world_model_updated for item in out)
        if world_updated and world_refresh_context is not None:
            try:
                self._world_model.refresh(world_refresh_context)
            except Exception:
                pass

        batch = UpdateBatch(
            generated_at=datetime.now(timezone.utc).isoformat(),
            records=out,
            metadata={
                "count": len(out),
                "stored": sum(1 for item in out if item.stored),
                "world_updated": world_updated,
                "avg_confidence": round(mean([item.confidence for item in out]), 4) if out else 0.0,
                "min_confidence": min_confidence,
            },
        )
        self._persist_batch(batch)
        return batch

    def _apply_one(self, summary: SummaryRecord, *, min_confidence: float) -> UpdateRecord:
        key = f"curiosity:knowledge:{summary.domain}:{summary.summary_id}"
        notes: List[str] = []

        if summary.confidence < min_confidence:
            notes.append("below_confidence_threshold")
            self._memory.remember_short_term(
                key=f"curiosity:quarantine:{summary.summary_id}",
                value={
                    "summary_id": summary.summary_id,
                    "domain": summary.domain,
                    "confidence": summary.confidence,
                    "reason": "below_confidence_threshold",
                },
                tags=["curiosity", "quarantine"],
            )
            return UpdateRecord(
                update_id=f"upd-{datetime.now(timezone.utc).timestamp()}-{abs(hash(summary.summary_id)) % 100000}",
                summary_id=summary.summary_id,
                stored=False,
                confidence=summary.confidence,
                world_model_updated=False,
                key=key,
                notes=notes,
                metadata={"domain": summary.domain},
            )

        payload = self._payload_for_summary(summary)
        self._memory.remember_long_term(
            key=key,
            value=payload,
            source="curiosity_engine.learning_memory_updater",
            importance=min(0.95, max(0.55, summary.confidence)),
            tags=["curiosity", "knowledge", summary.domain],
        )
        self._memory.remember_semantic(
            doc_id=f"curiosity:knowledge:{summary.summary_id}",
            text=f"{summary.domain} {summary.title} {summary.summary_text[:1200]}",
            metadata={
                "type": "curiosity_knowledge",
                "domain": summary.domain,
                "confidence": summary.confidence,
                "summary_id": summary.summary_id,
            },
        )
        self._memory.remember_short_term(
            key=f"curiosity:last_domain_update:{summary.domain}",
            value={
                "summary_id": summary.summary_id,
                "domain": summary.domain,
                "confidence": summary.confidence,
                "title": summary.title,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            },
            tags=["curiosity", "knowledge", summary.domain],
        )

        world_model_updated = True
        notes.append("stored_in_long_term")
        notes.append("semantic_memory_updated")

        return UpdateRecord(
            update_id=f"upd-{datetime.now(timezone.utc).timestamp()}-{abs(hash(summary.summary_id + summary.domain)) % 100000}",
            summary_id=summary.summary_id,
            stored=True,
            confidence=summary.confidence,
            world_model_updated=world_model_updated,
            key=key,
            notes=notes,
            metadata={
                "domain": summary.domain,
                "citation_count": len(summary.citations),
                "freshness_hint": summary.freshness_hint,
            },
        )

    @staticmethod
    def _payload_for_summary(summary: SummaryRecord) -> Dict[str, Any]:
        return {
            "summary_id": summary.summary_id,
            "question_id": summary.question_id,
            "domain": summary.domain,
            "title": summary.title,
            "summary_text": summary.summary_text,
            "key_points": list(summary.key_points),
            "citations": list(summary.citations),
            "confidence": summary.confidence,
            "freshness_hint": summary.freshness_hint,
            "tags": list(summary.tags),
            "metadata": dict(summary.metadata),
            "stored_at": datetime.now(timezone.utc).isoformat(),
        }

    def _persist_batch(self, batch: UpdateBatch) -> None:
        payload = {
            "type": "curiosity_update_batch",
            "generated_at": batch.generated_at,
            "metadata": dict(batch.metadata),
            "records": [
                {
                    "update_id": row.update_id,
                    "summary_id": row.summary_id,
                    "stored": row.stored,
                    "confidence": row.confidence,
                    "world_model_updated": row.world_model_updated,
                    "key": row.key,
                    "notes": list(row.notes),
                    "metadata": dict(row.metadata),
                }
                for row in batch.records
            ],
        }
        self._memory.remember_short_term(
            key="curiosity:last_update_batch",
            value=payload,
            tags=["curiosity", "update"],
        )
        self._memory.remember_long_term(
            key=f"curiosity:update_batch:{batch.generated_at}",
            value=payload,
            source="curiosity_engine.learning_memory_updater",
            importance=0.8,
            tags=["curiosity", "update"],
        )
