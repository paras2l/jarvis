"""Vector memory for Jarvis semantic search.

This module uses Chroma when available and falls back to an in-process vector
index when Chroma is not installed.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from hashlib import sha256
import math
from pathlib import Path
import re
from typing import Any, Dict, Iterable, List, Sequence


@dataclass(slots=True)
class VectorRecord:
    """One semantic memory entry."""

    doc_id: str
    text: str
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class VectorSearchResult:
    """One semantic search result."""

    doc_id: str
    text: str
    score: float
    metadata: Dict[str, Any] = field(default_factory=dict)


class SimpleEmbeddingModel:
    """Deterministic lightweight embedding fallback.

    Produces normalized vectors using hashed token bins.
    """

    def __init__(self, dimensions: int = 128) -> None:
        self._dimensions = max(16, dimensions)

    @property
    def dimensions(self) -> int:
        return self._dimensions

    def embed(self, text: str) -> List[float]:
        tokens = self._tokenize(text)
        if not tokens:
            return [0.0] * self._dimensions

        vec = [0.0] * self._dimensions
        for token in tokens:
            index = self._token_index(token)
            vec[index] += 1.0

        return self._normalize(vec)

    def embed_many(self, texts: Sequence[str]) -> List[List[float]]:
        return [self.embed(text) for text in texts]

    @staticmethod
    def _tokenize(text: str) -> List[str]:
        return re.findall(r"[a-zA-Z0-9_\-]{2,}", text.lower())

    def _token_index(self, token: str) -> int:
        digest = sha256(token.encode("utf-8")).hexdigest()
        return int(digest[:8], 16) % self._dimensions

    @staticmethod
    def _normalize(values: List[float]) -> List[float]:
        norm = math.sqrt(sum(item * item for item in values))
        if norm == 0:
            return values
        return [item / norm for item in values]


class InMemoryVectorIndex:
    """Simple vector index for local fallback semantic search."""

    def __init__(self, embedding_model: SimpleEmbeddingModel | None = None) -> None:
        self._embedder = embedding_model or SimpleEmbeddingModel()
        self._records: Dict[str, VectorRecord] = {}
        self._vectors: Dict[str, List[float]] = {}

    def upsert(self, records: Iterable[VectorRecord]) -> int:
        rows = list(records)
        if not rows:
            return 0

        texts = [row.text for row in rows]
        embeddings = self._embedder.embed_many(texts)
        for row, vector in zip(rows, embeddings):
            self._records[row.doc_id] = row
            self._vectors[row.doc_id] = vector
        return len(rows)

    def delete(self, doc_id: str) -> bool:
        if doc_id not in self._records:
            return False
        self._records.pop(doc_id, None)
        self._vectors.pop(doc_id, None)
        return True

    def fetch(self, doc_id: str) -> VectorRecord | None:
        return self._records.get(doc_id)

    def search(self, query: str, top_k: int = 5, where: Dict[str, Any] | None = None) -> List[VectorSearchResult]:
        if not query.strip() or top_k <= 0:
            return []

        target = self._embedder.embed(query)
        ranked: List[tuple[float, VectorRecord]] = []

        for doc_id, record in self._records.items():
            if where and not self._metadata_match(record.metadata, where):
                continue
            vector = self._vectors.get(doc_id)
            if vector is None:
                continue
            score = self._cosine(target, vector)
            ranked.append((score, record))

        ranked.sort(key=lambda row: row[0], reverse=True)
        out: List[VectorSearchResult] = []
        for score, record in ranked[:top_k]:
            out.append(
                VectorSearchResult(
                    doc_id=record.doc_id,
                    text=record.text,
                    score=round(float(score), 6),
                    metadata=dict(record.metadata),
                )
            )
        return out

    def count(self) -> int:
        return len(self._records)

    @staticmethod
    def _cosine(left: List[float], right: List[float]) -> float:
        return sum(a * b for a, b in zip(left, right))

    @staticmethod
    def _metadata_match(metadata: Dict[str, Any], where: Dict[str, Any]) -> bool:
        for key, value in where.items():
            if metadata.get(key) != value:
                return False
        return True


class VectorMemory:
    """High-level vector memory with Chroma backend or fallback index."""

    def __init__(
        self,
        collection_name: str = "jarvis_memory",
        persist_directory: str = "python/.jarvis_chroma",
        embedding_dimensions: int = 128,
    ) -> None:
        self._collection_name = collection_name
        self._persist_directory = persist_directory
        self._embedder = SimpleEmbeddingModel(dimensions=embedding_dimensions)

        self._backend = "in_memory"
        self._index = InMemoryVectorIndex(self._embedder)
        self._chroma_client = None
        self._chroma_collection = None

        self._try_init_chroma()

    @property
    def backend(self) -> str:
        return self._backend

    def add_text(self, doc_id: str, text: str, metadata: Dict[str, Any] | None = None) -> None:
        record = VectorRecord(doc_id=doc_id, text=text, metadata=dict(metadata or {}))
        self.add_many([record])

    def add_many(self, records: Iterable[VectorRecord]) -> int:
        rows = list(records)
        if not rows:
            return 0

        if self._backend == "chroma":
            self._add_many_chroma(rows)
            return len(rows)

        return self._index.upsert(rows)

    def get(self, doc_id: str) -> VectorRecord | None:
        if self._backend == "chroma":
            return self._get_chroma(doc_id)
        return self._index.fetch(doc_id)

    def delete(self, doc_id: str) -> bool:
        if self._backend == "chroma":
            return self._delete_chroma(doc_id)
        return self._index.delete(doc_id)

    def semantic_search(
        self,
        query: str,
        top_k: int = 5,
        where: Dict[str, Any] | None = None,
    ) -> List[VectorSearchResult]:
        if self._backend == "chroma":
            return self._search_chroma(query=query, top_k=top_k, where=where)
        return self._index.search(query=query, top_k=top_k, where=where)

    def count(self) -> int:
        if self._backend == "chroma" and self._chroma_collection is not None:
            try:
                return int(self._chroma_collection.count())
            except Exception:
                return self._index.count()
        return self._index.count()

    def _try_init_chroma(self) -> None:
        try:
            import chromadb  # type: ignore
            from chromadb.config import Settings  # type: ignore
        except Exception:
            self._backend = "in_memory"
            return

        try:
            persist_path = Path(self._persist_directory)
            persist_path.mkdir(parents=True, exist_ok=True)
            settings = Settings(anonymized_telemetry=False, allow_reset=False)
            client = chromadb.PersistentClient(path=str(persist_path), settings=settings)
            collection = client.get_or_create_collection(name=self._collection_name)
            self._chroma_client = client
            self._chroma_collection = collection
            self._backend = "chroma"
        except Exception:
            self._backend = "in_memory"

    def _add_many_chroma(self, records: List[VectorRecord]) -> None:
        if self._chroma_collection is None:
            self._index.upsert(records)
            return

        ids = [row.doc_id for row in records]
        docs = [row.text for row in records]
        metas = [self._safe_metadata(row.metadata) for row in records]

        vectors = self._embedder.embed_many(docs)
        self._chroma_collection.upsert(
            ids=ids,
            documents=docs,
            metadatas=metas,
            embeddings=vectors,
        )

        # Mirror in fallback cache for resilience and predictable local behavior.
        self._index.upsert(records)

    def _get_chroma(self, doc_id: str) -> VectorRecord | None:
        if self._chroma_collection is None:
            return self._index.fetch(doc_id)

        try:
            out = self._chroma_collection.get(ids=[doc_id], include=["documents", "metadatas"])
        except Exception:
            return self._index.fetch(doc_id)

        ids = out.get("ids") or []
        if not ids:
            return None

        documents = out.get("documents") or [[]]
        metadatas = out.get("metadatas") or [[]]
        text = (documents[0][0] if documents and documents[0] else "")
        metadata = (metadatas[0][0] if metadatas and metadatas[0] else {})
        return VectorRecord(doc_id=doc_id, text=str(text), metadata=dict(metadata))

    def _delete_chroma(self, doc_id: str) -> bool:
        removed = self._index.delete(doc_id)
        if self._chroma_collection is None:
            return removed

        try:
            self._chroma_collection.delete(ids=[doc_id])
            return True
        except Exception:
            return removed

    def _search_chroma(
        self,
        query: str,
        top_k: int,
        where: Dict[str, Any] | None,
    ) -> List[VectorSearchResult]:
        if self._chroma_collection is None:
            return self._index.search(query=query, top_k=top_k, where=where)

        if not query.strip() or top_k <= 0:
            return []

        vector = self._embedder.embed(query)
        try:
            result = self._chroma_collection.query(
                query_embeddings=[vector],
                n_results=top_k,
                where=self._safe_metadata(where or {}) if where else None,
                include=["documents", "metadatas", "distances"],
            )
        except Exception:
            return self._index.search(query=query, top_k=top_k, where=where)

        ids = result.get("ids", [[]])[0]
        docs = result.get("documents", [[]])[0]
        metas = result.get("metadatas", [[]])[0]
        distances = result.get("distances", [[]])[0]

        out: List[VectorSearchResult] = []
        for doc_id, doc, meta, distance in zip(ids, docs, metas, distances):
            score = 1.0 / (1.0 + float(distance))
            out.append(
                VectorSearchResult(
                    doc_id=str(doc_id),
                    text=str(doc),
                    score=round(score, 6),
                    metadata=dict(meta or {}),
                )
            )
        return out

    @staticmethod
    def _safe_metadata(metadata: Dict[str, Any]) -> Dict[str, Any]:
        """Normalize metadata to Chroma-safe primitive map."""
        out: Dict[str, Any] = {}
        for key, value in metadata.items():
            if isinstance(value, (str, int, float, bool)):
                out[str(key)] = value
            else:
                out[str(key)] = str(value)
        return out


class SemanticKnowledgeBase:
    """Convenience wrapper combining write/read patterns for Jarvis knowledge."""

    def __init__(self, vector_memory: VectorMemory | None = None) -> None:
        self._vector = vector_memory or VectorMemory()

    def store_knowledge(
        self,
        topic: str,
        content: str,
        source: str = "jarvis",
        tags: Iterable[str] | None = None,
    ) -> str:
        normalized_topic = topic.strip().lower().replace(" ", "_")
        doc_id = f"kb:{normalized_topic}:{abs(hash(content)) % 10_000_000}"
        metadata = {
            "topic": topic,
            "source": source,
            "tags": ",".join(list(tags or [])),
        }
        self._vector.add_text(doc_id=doc_id, text=content, metadata=metadata)
        return doc_id

    def retrieve_knowledge(self, query: str, limit: int = 5) -> List[VectorSearchResult]:
        return self._vector.semantic_search(query=query, top_k=limit)

    def backend(self) -> str:
        return self._vector.backend


def _example_vector_memory() -> None:
    vector_memory = VectorMemory(collection_name="jarvis_memory_example")

    vector_memory.add_text(
        doc_id="doc-1",
        text="Jarvis planner converts high-level goals into executable task graphs.",
        metadata={"module": "planner", "kind": "architecture"},
    )
    vector_memory.add_text(
        doc_id="doc-2",
        text="Agent orchestrator routes tasks to Research, Creative, Automation, Development, and Trading agents.",
        metadata={"module": "orchestrator", "kind": "architecture"},
    )
    vector_memory.add_text(
        doc_id="doc-3",
        text="Vector memory enables semantic search over prior knowledge and project notes.",
        metadata={"module": "memory", "kind": "capability"},
    )

    print("Vector Memory Example")
    print(f"Backend: {vector_memory.backend}")
    print("Search: 'how are tasks routed to agents'")
    for item in vector_memory.semantic_search("how are tasks routed to agents", top_k=3):
        print(f"- {item.doc_id} score={item.score} text={item.text}")

    kb = SemanticKnowledgeBase(vector_memory)
    kb.store_knowledge(
        topic="memory system",
        content="Short-term memory stores active session context with TTL and recency indexing.",
        source="docs",
        tags=["memory", "short-term"],
    )

    print("\nKnowledge Base Search: 'session context ttl'")
    for item in kb.retrieve_knowledge("session context ttl", limit=3):
        print(f"- {item.doc_id} ({item.score})")


if __name__ == "__main__":
    _example_vector_memory()
