"""Autonomous research agent for the Curiosity Engine.

Collects external information from multiple sources with safety controls:
- strict source verification
- bounded per-cycle requests
- timeout-protected network calls
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
import json
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from typing import Any, Dict, Iterable, List, Mapping

from Pixi.curiosity_engine.question_generator import ResearchQuestion
from Pixi.memory.memory_system import MemorySystem


@dataclass(slots=True)
class ResearchHit:
    hit_id: str
    question_id: str
    source: str
    url: str
    title: str
    snippet: str
    credibility: float
    published_at: str = ""
    tags: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class ResearchBatch:
    generated_at: str
    question_id: str
    question: str
    hits: List[ResearchHit] = field(default_factory=list)
    blocked_sources: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class SourceVerifier:
    """Domain allowlist and credibility policy."""

    min_credibility: float = 0.52
    trusted_domains: List[str] = field(
        default_factory=lambda: [
            "wikipedia.org",
            "arxiv.org",
            "nature.com",
            "science.org",
            "mit.edu",
            "stanford.edu",
            "openai.com",
            "ieee.org",
            "acm.org",
            "reuters.com",
            "bloomberg.com",
            "ft.com",
            "imf.org",
            "worldbank.org",
            "sec.gov",
            "nasa.gov",
            "who.int",
        ]
    )

    def is_allowed_url(self, url: str) -> bool:
        lowered = url.lower()
        return any(domain in lowered for domain in self.trusted_domains)

    def score_url(self, url: str) -> float:
        lowered = url.lower()
        score = 0.42
        for domain in self.trusted_domains:
            if domain in lowered:
                score = max(score, 0.74)
                break
        if lowered.startswith("https://"):
            score += 0.06
        if any(marker in lowered for marker in ["/research", "/paper", "/article", "/news"]):
            score += 0.04
        return min(0.98, score)

    def accept(self, url: str) -> bool:
        return self.is_allowed_url(url) and self.score_url(url) >= self.min_credibility


class ResearchAgent:
    """Runs bounded autonomous web research for generated questions."""

    def __init__(self, memory: MemorySystem, verifier: SourceVerifier | None = None) -> None:
        self._memory = memory
        self._verifier = verifier or SourceVerifier()

    def gather(
        self,
        question: ResearchQuestion,
        *,
        max_hits: int = 12,
        timeout_seconds: float = 8.0,
    ) -> ResearchBatch:
        blocked: List[str] = []
        hits: List[ResearchHit] = []

        providers = [
            self._from_duckduckgo,
            self._from_wikipedia,
            self._from_arxiv,
            self._from_hackernews_search,
        ]

        for provider in providers:
            try:
                rows = provider(question, timeout_seconds=timeout_seconds)
            except Exception as exc:  # noqa: BLE001
                blocked.append(f"provider_error:{provider.__name__}:{exc}")
                continue

            for row in rows:
                if self._verifier.accept(row.url):
                    hits.append(row)
                else:
                    blocked.append(row.url)

            if len(hits) >= max_hits:
                break

        hits = self._deduplicate(hits)[: max(1, int(max_hits))]
        batch = ResearchBatch(
            generated_at=datetime.now(timezone.utc).isoformat(),
            question_id=question.question_id,
            question=question.question,
            hits=hits,
            blocked_sources=blocked[:50],
            metadata={
                "domain": question.domain,
                "intent": question.intent,
                "requested_hits": max_hits,
                "returned_hits": len(hits),
                "blocked_count": len(blocked),
            },
        )
        self._persist(batch)
        return batch

    def gather_many(
        self,
        questions: Iterable[ResearchQuestion],
        *,
        max_questions: int = 8,
        max_hits_per_question: int = 10,
        timeout_seconds: float = 8.0,
    ) -> List[ResearchBatch]:
        out: List[ResearchBatch] = []
        for question in list(questions)[: max(1, int(max_questions))]:
            out.append(
                self.gather(
                    question,
                    max_hits=max_hits_per_question,
                    timeout_seconds=timeout_seconds,
                )
            )
        return out

    def _from_duckduckgo(self, question: ResearchQuestion, *, timeout_seconds: float) -> List[ResearchHit]:
        query = urllib.parse.quote(question.question)
        url = f"https://api.duckduckgo.com/?q={query}&format=json&no_html=1&skip_disambig=1"
        payload = self._get_json(url, timeout_seconds)

        rows: List[ResearchHit] = []
        abstract_url = str(payload.get("AbstractURL", "")).strip()
        abstract = str(payload.get("AbstractText", "")).strip()
        heading = str(payload.get("Heading", "")).strip()
        if abstract_url and abstract:
            rows.append(
                self._mk_hit(
                    question_id=question.question_id,
                    source="duckduckgo",
                    url=abstract_url,
                    title=heading or "DuckDuckGo Abstract",
                    snippet=abstract,
                )
            )

        for item in payload.get("RelatedTopics", [])[:8]:
            if not isinstance(item, Mapping):
                continue
            if "Topics" in item:
                for nested in item.get("Topics", [])[:4]:
                    row = self._topic_item_to_hit(question.question_id, nested)
                    if row is not None:
                        rows.append(row)
            else:
                row = self._topic_item_to_hit(question.question_id, item)
                if row is not None:
                    rows.append(row)

        return rows

    def _from_wikipedia(self, question: ResearchQuestion, *, timeout_seconds: float) -> List[ResearchHit]:
        query = urllib.parse.quote(question.question[:180])
        search_url = f"https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch={query}&format=json"
        payload = self._get_json(search_url, timeout_seconds)
        hits: List[ResearchHit] = []

        for item in payload.get("query", {}).get("search", [])[:6]:
            title = str(item.get("title", "")).strip()
            if not title:
                continue
            url_title = urllib.parse.quote(title.replace(" ", "_"))
            page_url = f"https://en.wikipedia.org/wiki/{url_title}"
            snippet = str(item.get("snippet", "")).replace("<span class=\"searchmatch\">", "").replace("</span>", "")
            hits.append(
                self._mk_hit(
                    question_id=question.question_id,
                    source="wikipedia",
                    url=page_url,
                    title=title,
                    snippet=snippet,
                )
            )

        return hits

    def _from_arxiv(self, question: ResearchQuestion, *, timeout_seconds: float) -> List[ResearchHit]:
        query = urllib.parse.quote(question.question[:160])
        url = f"https://export.arxiv.org/api/query?search_query=all:{query}&start=0&max_results=6"
        text = self._get_text(url, timeout_seconds)
        root = ET.fromstring(text)

        ns = {"atom": "http://www.w3.org/2005/Atom"}
        hits: List[ResearchHit] = []
        for entry in root.findall("atom:entry", ns)[:6]:
            title = (entry.findtext("atom:title", default="", namespaces=ns) or "").strip()
            summary = (entry.findtext("atom:summary", default="", namespaces=ns) or "").strip()
            link = ""
            for node in entry.findall("atom:link", ns):
                href = node.attrib.get("href", "")
                if href.startswith("http"):
                    link = href
                    break
            if not link:
                continue
            published = (entry.findtext("atom:published", default="", namespaces=ns) or "").strip()
            hit = self._mk_hit(
                question_id=question.question_id,
                source="arxiv",
                url=link,
                title=title or "arXiv Paper",
                snippet=summary,
                published_at=published,
            )
            hit.credibility = max(hit.credibility, 0.88)
            hits.append(hit)

        return hits

    def _from_hackernews_search(self, question: ResearchQuestion, *, timeout_seconds: float) -> List[ResearchHit]:
        query = urllib.parse.quote(question.question[:140])
        url = f"https://hn.algolia.com/api/v1/search?query={query}&tags=story"
        payload = self._get_json(url, timeout_seconds)
        rows: List[ResearchHit] = []

        for item in payload.get("hits", [])[:6]:
            page_url = str(item.get("url", "")).strip()
            if not page_url:
                continue
            title = str(item.get("title", "")).strip() or "HN Story"
            snippet = str(item.get("story_text", "")).strip()[:260]
            rows.append(
                self._mk_hit(
                    question_id=question.question_id,
                    source="hn_search",
                    url=page_url,
                    title=title,
                    snippet=snippet or f"Discussion result for: {question.question}",
                )
            )

        return rows

    @staticmethod
    def _topic_item_to_hit(question_id: str, item: Mapping[str, Any]) -> ResearchHit | None:
        url = str(item.get("FirstURL", "")).strip()
        text = str(item.get("Text", "")).strip()
        if not url or not text:
            return None
        return ResearchHit(
            hit_id=f"hit-{datetime.now(timezone.utc).timestamp()}-{abs(hash(url)) % 100000}",
            question_id=question_id,
            source="duckduckgo_related",
            url=url,
            title=text.split(" - ", 1)[0][:160],
            snippet=text[:320],
            credibility=0.58,
            tags=["duckduckgo", "related"],
        )

    def _mk_hit(
        self,
        *,
        question_id: str,
        source: str,
        url: str,
        title: str,
        snippet: str,
        published_at: str = "",
    ) -> ResearchHit:
        credibility = self._verifier.score_url(url)
        return ResearchHit(
            hit_id=f"hit-{datetime.now(timezone.utc).timestamp()}-{abs(hash(url + title)) % 100000}",
            question_id=question_id,
            source=source,
            url=url,
            title=title[:220],
            snippet=snippet[:900],
            credibility=round(credibility, 4),
            published_at=published_at,
            tags=[source],
            metadata={"collected_at": datetime.now(timezone.utc).isoformat()},
        )

    @staticmethod
    def _deduplicate(rows: List[ResearchHit]) -> List[ResearchHit]:
        merged: Dict[str, ResearchHit] = {}
        for row in rows:
            key = row.url.strip().lower()
            existing = merged.get(key)
            if existing is None:
                merged[key] = row
                continue
            existing.credibility = max(existing.credibility, row.credibility)
            if len(row.snippet) > len(existing.snippet):
                existing.snippet = row.snippet
            existing.tags = sorted(set(existing.tags + row.tags))
        return list(merged.values())

    def _persist(self, batch: ResearchBatch) -> None:
        payload = {
            "type": "curiosity_research_batch",
            "generated_at": batch.generated_at,
            "question_id": batch.question_id,
            "question": batch.question,
            "metadata": dict(batch.metadata),
            "hits": [
                {
                    "hit_id": row.hit_id,
                    "source": row.source,
                    "url": row.url,
                    "title": row.title,
                    "credibility": row.credibility,
                    "published_at": row.published_at,
                }
                for row in batch.hits
            ],
            "blocked_sources": list(batch.blocked_sources),
        }
        self._memory.remember_short_term(
            key=f"curiosity:research:{batch.question_id}",
            value=payload,
            tags=["curiosity", "research"],
        )
        self._memory.remember_long_term(
            key=f"curiosity:research_batch:{batch.generated_at}:{batch.question_id}",
            value=payload,
            source="curiosity_engine.research_agent",
            importance=0.75,
            tags=["curiosity", "research"],
        )

    @staticmethod
    def _get_json(url: str, timeout_seconds: float) -> Dict[str, Any]:
        req = urllib.request.Request(url, headers={"User-Agent": "PixiCuriosity/1.0"})
        with urllib.request.urlopen(req, timeout=timeout_seconds) as response:
            text = response.read().decode("utf-8", errors="ignore")
        return dict(json.loads(text))

    @staticmethod
    def _get_text(url: str, timeout_seconds: float) -> str:
        req = urllib.request.Request(url, headers={"User-Agent": "PixiCuriosity/1.0"})
        with urllib.request.urlopen(req, timeout=timeout_seconds) as response:
            return response.read().decode("utf-8", errors="ignore")

