"""Natural language command parser for the Pixi Unified Command Interface."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
import json
import re
from typing import Any, Dict, List

from Pixi.uci.intent_classifier import IntentClassification, UnifiedIntentClassifier


@dataclass(slots=True)
class CommandAction:
    action_id: str
    raw_text: str
    verb: str
    target: str
    intent: str
    confidence: float
    device_hint: str
    requires_confirmation: bool
    parameters: Dict[str, Any] = field(default_factory=dict)
    tags: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "action_id": self.action_id,
            "raw_text": self.raw_text,
            "verb": self.verb,
            "target": self.target,
            "intent": self.intent,
            "confidence": self.confidence,
            "device_hint": self.device_hint,
            "requires_confirmation": self.requires_confirmation,
            "parameters": dict(self.parameters),
            "tags": list(self.tags),
            "metadata": dict(self.metadata),
        }


@dataclass(slots=True)
class ParsedCommand:
    command_id: str
    original_text: str
    normalized_text: str
    primary_intent: str
    confidence: float
    actions: List[CommandAction] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    def to_dict(self) -> Dict[str, Any]:
        return {
            "command_id": self.command_id,
            "original_text": self.original_text,
            "normalized_text": self.normalized_text,
            "primary_intent": self.primary_intent,
            "confidence": self.confidence,
            "created_at": self.created_at,
            "actions": [action.to_dict() for action in self.actions],
            "metadata": dict(self.metadata),
        }

    def to_json(self) -> str:
        return json.dumps(self.to_dict(), ensure_ascii=True, indent=2)


class UnifiedCommandParser:
    """Convert natural language instructions into structured command objects."""

    _CONNECTOR_PATTERN = re.compile(
        r"\s+(?:and then|then|followed by|after that|next|also)\s+|[;,]",
        re.IGNORECASE,
    )
    _CHAIN_VERB_PATTERN = re.compile(
        r"\band\s+(?=(open|launch|start|search|find|send|message|email|close|quit|type|write|create|generate|set|turn|fetch|browse|download|upload|sync|run|play|pause|click|tap|api|call)\b)",
        re.IGNORECASE,
    )

    _VERB_MAP: Dict[str, str] = {
        "open": "open_application",
        "launch": "open_application",
        "start": "open_application",
        "close": "close_application",
        "quit": "close_application",
        "search": "web_search",
        "find": "web_search",
        "browse": "web_browse",
        "send": "send_message",
        "message": "send_message",
        "email": "send_message",
        "mail": "send_message",
        "type": "type_text",
        "write": "type_text",
        "create": "create_content",
        "generate": "create_content",
        "summarize": "summarize_content",
        "automate": "automation",
        "schedule": "automation",
        "sync": "automation",
        "fetch": "api_request",
        "call": "api_request",
        "api": "api_request",
        "click": "ui_click",
        "tap": "ui_click",
        "set": "system_setting",
        "turn": "system_setting",
        "play": "media_control",
        "pause": "media_control",
        "resume": "media_control",
    }

    def __init__(self, classifier: UnifiedIntentClassifier | None = None) -> None:
        self._classifier = classifier or UnifiedIntentClassifier()
        self._counter = 0

    def parse(self, text: str) -> ParsedCommand:
        normalized = self._normalize(text)
        segments = self._split_segments(normalized)
        actions = [self._parse_action(segment) for segment in segments if segment]
        primary_intent = self._select_primary_intent(actions, normalized)
        confidence = self._select_confidence(actions, primary_intent)

        return ParsedCommand(
            command_id=self._next_id(),
            original_text=text,
            normalized_text=normalized,
            primary_intent=primary_intent,
            confidence=confidence,
            actions=actions,
            metadata={
                "segment_count": len(actions),
                "has_compound_actions": len(actions) > 1,
            },
        )

    def parse_many(self, texts: List[str]) -> List[ParsedCommand]:
        return [self.parse(text) for text in texts]

    def preview(self, text: str) -> str:
        return self.parse(text).to_json()

    def _parse_action(self, text: str) -> CommandAction:
        classification: IntentClassification = self._classifier.classify(text)
        verb = self._extract_verb(text)
        target = self._extract_target(text, verb)
        parameters = self._extract_parameters(text, verb, target)

        return CommandAction(
            action_id=self._next_id(prefix="act"),
            raw_text=text,
            verb=verb,
            target=target,
            intent=classification.intent,
            confidence=classification.confidence,
            device_hint=classification.device_kind,
            requires_confirmation=classification.requires_confirmation,
            parameters=parameters,
            tags=list(classification.tags),
            metadata={"reasons": classification.reasons},
        )

    def _split_segments(self, text: str) -> List[str]:
        text = self._CHAIN_VERB_PATTERN.sub(" | ", text)
        parts = [segment.strip() for segment in self._CONNECTOR_PATTERN.split(text) if segment.strip()]
        if not parts:
            return [text]
        return parts

    def _extract_verb(self, text: str) -> str:
        first = text.split(maxsplit=1)[0].lower() if text.strip() else ""
        return self._VERB_MAP.get(first, first or "command")

    def _extract_target(self, text: str, verb: str) -> str:
        lowered = text.lower().strip()
        if verb == "open_application":
            return self._strip_leading_words(lowered, {"open", "launch", "start"})
        if verb == "close_application":
            return self._strip_leading_words(lowered, {"close", "quit"})
        if verb == "web_search":
            return self._strip_leading_words(lowered, {"search", "find", "browse", "google"})
        if verb == "send_message":
            return self._strip_leading_words(lowered, {"send", "message", "email", "mail"})
        if verb == "type_text":
            return self._strip_leading_words(lowered, {"type", "write", "enter"})
        if verb == "create_content":
            return self._strip_leading_words(lowered, {"create", "generate", "draft"})
        if verb == "api_request":
            return self._strip_leading_words(lowered, {"fetch", "call", "api", "request"})
        if verb == "ui_click":
            return self._strip_leading_words(lowered, {"click", "tap"})
        if verb == "system_setting":
            return self._strip_leading_words(lowered, {"set", "turn"})
        return lowered

    def _extract_parameters(self, text: str, verb: str, target: str) -> Dict[str, Any]:
        params: Dict[str, Any] = {}
        lower = text.lower()

        if verb == "web_search":
            params["query"] = self._strip_leading_words(lower, {"search", "find", "browse", "google"})
        elif verb == "open_application":
            params["app"] = target
        elif verb == "send_message":
            params["message"] = self._strip_leading_words(lower, {"send", "message", "email", "mail"})
        elif verb == "type_text":
            params["text"] = self._strip_leading_words(lower, {"type", "write", "enter"})
        elif verb == "create_content":
            params["topic"] = target
        elif verb == "api_request":
            params["endpoint_or_subject"] = target
        elif verb == "system_setting":
            params["setting"] = target

        if "http://" in lower or "https://" in lower:
            match = re.search(r"https?://\S+", text, flags=re.IGNORECASE)
            if match:
                params["url"] = match.group(0)

        if "%" in lower:
            match = re.search(r"(\d{1,3})%", lower)
            if match:
                params["percentage"] = int(match.group(1))

        return params

    def _select_primary_intent(self, actions: List[CommandAction], normalized: str) -> str:
        if not actions:
            return self._classifier.classify(normalized).intent
        weights: Dict[str, float] = {}
        for action in actions:
            weights[action.intent] = weights.get(action.intent, 0.0) + action.confidence
        return max(weights.items(), key=lambda item: (item[1], item[0]))[0]

    @staticmethod
    def _select_confidence(actions: List[CommandAction], primary_intent: str) -> float:
        if not actions:
            return 0.0
        scores = [action.confidence for action in actions if action.intent == primary_intent]
        if not scores:
            scores = [action.confidence for action in actions]
        return round(sum(scores) / len(scores), 3)

    @staticmethod
    def _normalize(text: str) -> str:
        return " ".join(text.strip().split())

    @staticmethod
    def _strip_leading_words(text: str, verbs: set[str]) -> str:
        cleaned = text.strip()
        for verb in verbs:
            if cleaned.startswith(f"{verb} "):
                return cleaned[len(verb) + 1 :].strip()
        return cleaned

    def _next_id(self, prefix: str = "cmd") -> str:
        self._counter += 1
        return f"{prefix}-{self._counter}"


def _example_parser() -> None:
    parser = UnifiedCommandParser()
    sample = 'open chrome and search AI news'
    parsed = parser.parse(sample)
    print(parsed.to_json())


if __name__ == "__main__":
    _example_parser()
