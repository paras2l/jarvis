"""Entity extraction from text, documents, and system observations.

Detects and extracts entities of various kinds (people, tools, processes,
locations, concepts) using domain-specific patterns and heuristics.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional
import re
import uuid

from jarvis.knowledge_system.knowledge_graph import Entity


@dataclass(slots=True)
class ExtractedEntity:
    """Result of entity extraction."""

    label: str
    kind: str
    confidence: float
    context: str  # Surrounding text for additional context
    properties: Dict[str, Any]
    source: str = "text_extraction"


class EntityExtractor:
    """Extracts entities from various sources."""

    def __init__(self) -> None:
        self._entity_cache: Dict[str, Entity] = {}
        self._patterns = self._build_patterns()

    def extract_from_text(self, text: str, source: str = "document") -> List[ExtractedEntity]:
        """Extract entities from plain text."""
        if not text or not isinstance(text, str):
            return []

        extracted: List[ExtractedEntity] = []
        text_lower = text.lower()

        # Extract person mentions (capitalized words or explicit patterns)
        for person_match in re.finditer(r"\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b", text):
            label = person_match.group(1)
            if len(label.split()) <= 3 and label not in {"The", "This", "That", "These", "Those"}:
                context = text[max(0, person_match.start() - 30) : min(len(text), person_match.end() + 30)]
                extracted.append(
                    ExtractedEntity(
                        label=label,
                        kind="person",
                        confidence=0.6 if len(label.split()) == 1 else 0.8,
                        context=context,
                        properties={"mention_count": text.count(label)},
                        source=source,
                    )
                )

        # Extract tools/technologies
        tool_keywords = ["tool", "framework", "library", "system", "platform", "software", "api", "service"]
        for keyword in tool_keywords:
            for match in re.finditer(rf"(\w+(?:\s+\w+)*?)\s+{keyword}", text_lower):
                label = text[match.start() : match.end() - len(keyword)].strip()
                if label and len(label) < 50:
                    context = text[max(0, match.start() - 30) : min(len(text), match.end() + 30)]
                    extracted.append(
                        ExtractedEntity(
                            label=label,
                            kind="tool",
                            confidence=0.75,
                            context=context,
                            properties={"keyword": keyword},
                            source=source,
                        )
                    )

        # Extract processes/actions
        action_patterns = [r"(?:to|for)\s+(\w+(?:\s+\w+){0,2})", r"(\w+ing)\s+(?:process|task|workflow)"]
        for pattern in action_patterns:
            for match in re.finditer(pattern, text_lower):
                label = match.group(1)
                if label and len(label) < 40:
                    context = text[max(0, match.start() - 30) : min(len(text), match.end() + 30)]
                    extracted.append(
                        ExtractedEntity(
                            label=label,
                            kind="process",
                            confidence=0.7,
                            context=context,
                            properties={},
                            source=source,
                        )
                    )

        # Extract locations
        location_keywords = ["in", "at", "near", "from", "to"]
        for keyword in location_keywords:
            for match in re.finditer(rf"{keyword}\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)", text):
                label = match.group(1)
                if label not in {"The", "This", "That"}:
                    context = text[max(0, match.start() - 30) : min(len(text), match.end() + 30)]
                    extracted.append(
                        ExtractedEntity(
                            label=label,
                            kind="location",
                            confidence=0.65,
                            context=context,
                            properties={"preposition": keyword},
                            source=source,
                        )
                    )

        # Extract concepts (quoted or emphasized terms)
        for match in re.finditer(r'["\']([^"\']{3,50})["\']', text):
            context = text[max(0, match.start() - 30) : min(len(text), match.end() + 30)]
            extracted.append(
                ExtractedEntity(
                    label=match.group(1),
                    kind="concept",
                    confidence=0.75,
                    context=context,
                    properties={},
                    source=source,
                )
            )

        # Deduplicate by label
        seen: Dict[str, ExtractedEntity] = {}
        for entity in extracted:
            key = (entity.label.lower(), entity.kind)
            if key not in seen or entity.confidence > seen[key].confidence:
                seen[key] = entity

        return list(seen.values())

    def extract_from_observations(self, observations: Dict[str, Any]) -> List[ExtractedEntity]:
        """Extract entities from system observations."""
        extracted: List[ExtractedEntity] = []

        # Extract from active windows/apps
        if "active_window" in observations:
            extracted.append(
                ExtractedEntity(
                    label=observations["active_window"],
                    kind="tool",
                    confidence=0.95,
                    context="Active window observation",
                    properties={"observation_type": "active_window"},
                    source="observation",
                )
            )

        # Extract from user activity
        if "user_activity" in observations:
            activity = observations["user_activity"]
            extracted.append(
                ExtractedEntity(
                    label=activity,
                    kind="process",
                    confidence=0.85,
                    context="User activity observation",
                    properties={"observation_type": "user_activity"},
                    source="observation",
                )
            )

        # Extract from device state
        if "active_devices" in observations:
            for device in observations["active_devices"]:
                extracted.append(
                    ExtractedEntity(
                        label=device,
                        kind="tool",
                        confidence=0.9,
                        context="Device observation",
                        properties={"observation_type": "device"},
                        source="observation",
                    )
                )

        # Extract from time signals
        if "time_of_day" in observations:
            extracted.append(
                ExtractedEntity(
                    label=observations["time_of_day"],
                    kind="concept",
                    confidence=0.95,
                    context="Time observation",
                    properties={"observation_type": "time"},
                    source="observation",
                )
            )

        return extracted

    def convert_to_entity(self, extracted: ExtractedEntity) -> Entity:
        """Convert ExtractedEntity to graph Entity."""
        entity_id = f"{self._sanitize(extracted.label)}_{uuid.uuid4().hex[:6]}"
        cache_key = f"{extracted.label}:{extracted.kind}"

        if cache_key in self._entity_cache:
            return self._entity_cache[cache_key]

        entity = Entity(
            entity_id=entity_id,
            label=extracted.label,
            kind=extracted.kind,
            properties=extracted.properties,
            confidence=extracted.confidence,
            source=extracted.source,
            tags=[extracted.kind],
        )
        self._entity_cache[cache_key] = entity
        return entity

    def _sanitize(self, text: str) -> str:
        """Sanitize text for use as an ID component."""
        return re.sub(r"[^a-z0-9]+", "_", text.lower()).strip("_")[:32]

    def _build_patterns(self) -> Dict[str, str]:
        """Build regex patterns for entity extraction."""
        return {
            "email": r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}",
            "url": r"https?://[^\s]+",
            "time": r"\b\d{1,2}:\d{2}(?::\d{2})?\s*(?:am|pm|AM|PM)?\b",
            "date": r"\b\d{1,2}[-/]\d{1,2}[-/]\d{2,4}\b",
            "number": r"\b\d+\.?\d*\b",
        }
