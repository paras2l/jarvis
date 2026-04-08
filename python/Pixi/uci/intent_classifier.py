"""Intent classifier for the Pixi Unified Command Interface."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Tuple


@dataclass(slots=True)
class IntentClassification:
    intent: str
    confidence: float
    device_kind: str
    requires_confirmation: bool
    tags: List[str] = field(default_factory=list)
    reasons: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)


class UnifiedIntentClassifier:
    """Rule-based classifier for natural language command intents."""

    _INTENT_KEYWORDS: Dict[str, Tuple[str, ...]] = {
        "system_control": (
            "open",
            "launch",
            "close",
            "quit",
            "lock",
            "sleep",
            "restart",
            "shutdown",
            "volume",
            "clipboard",
        ),
        "web_search": (
            "search",
            "find",
            "browse",
            "google",
            "news",
            "web",
            "website",
            "browser",
        ),
        "messaging": (
            "message",
            "send",
            "email",
            "mail",
            "text",
            "reply",
            "whatsapp",
            "slack",
            "teams",
        ),
        "automation": (
            "automate",
            "workflow",
            "schedule",
            "sync",
            "download",
            "upload",
            "extract",
            "transform",
            "api",
        ),
        "api_call": (
            "api",
            "endpoint",
            "fetch",
            "request",
            "webhook",
            "integration",
        ),
        "content_creation": (
            "write",
            "create",
            "draft",
            "generate",
            "summarize",
            "script",
            "document",
        ),
        "multi_action": (
            "and then",
            "then",
            "after that",
            "followed by",
        ),
    }

    _DEVICE_HINTS: Dict[str, str] = {
        "system_control": "desktop",
        "web_search": "web",
        "messaging": "mobile",
        "automation": "desktop",
        "api_call": "api",
        "content_creation": "desktop",
        "multi_action": "desktop",
    }

    def classify(self, text: str, *, device_hint: str | None = None) -> IntentClassification:
        normalized = self._normalize(text)
        scores = self._score(normalized)
        intent, score = self._pick(scores)

        if device_hint and device_hint in {"desktop", "mobile", "web", "api"}:
            scores[intent] += 0.1

        requires_confirmation = intent in {"system_control", "messaging", "automation", "api_call"}
        confidence = round(min(0.99, 0.35 + score / 8.0), 3)
        if intent == "multi_action":
            confidence = max(confidence, 0.72)

        reasons = self._reasons(scores, intent)
        tags = [intent]
        if requires_confirmation:
            tags.append("confirmation")
        if "search" in normalized:
            tags.append("search")
        if "api" in normalized:
            tags.append("api")

        return IntentClassification(
            intent=intent,
            confidence=confidence,
            device_kind=device_hint or self._DEVICE_HINTS.get(intent, "desktop"),
            requires_confirmation=requires_confirmation,
            tags=tags,
            reasons=reasons,
            metadata={"scores": scores},
        )

    def classify_many(self, texts: List[str], *, device_hint: str | None = None) -> List[IntentClassification]:
        return [self.classify(text, device_hint=device_hint) for text in texts]

    def explain(self, text: str) -> str:
        row = self.classify(text)
        return f"intent={row.intent} confidence={row.confidence:.2f} device={row.device_kind} reasons={'; '.join(row.reasons[:3])}"

    @staticmethod
    def _normalize(value: str) -> str:
        return " ".join(value.lower().strip().split())

    def _score(self, text: str) -> Dict[str, float]:
        scores: Dict[str, float] = {intent: 0.0 for intent in self._INTENT_KEYWORDS}
        for intent, keywords in self._INTENT_KEYWORDS.items():
            for keyword in keywords:
                if keyword in text:
                    scores[intent] += 1.0 + min(0.5, len(keyword) / 20.0)

        if any(marker in text for marker in (" and ", " then ", " followed by ", " after that ")):
            scores["multi_action"] += 1.2
        if any(token in text for token in ("chrome", "browser", "website")):
            scores["web_search"] += 0.5
        if any(token in text for token in ("desktop", "computer", "window", "app")):
            scores["system_control"] += 0.4
        if any(token in text for token in ("mobile", "phone", "android", "ios", "sms")):
            scores["messaging"] += 0.5
        return scores

    @staticmethod
    def _pick(scores: Dict[str, float]) -> Tuple[str, float]:
        best_intent = "system_control"
        best_score = -1.0
        for intent in ("multi_action", "system_control", "web_search", "messaging", "automation", "api_call", "content_creation"):
            score = scores.get(intent, 0.0)
            if score > best_score:
                best_intent = intent
                best_score = score
        return best_intent, max(0.0, best_score)

    @staticmethod
    def _reasons(scores: Dict[str, float], intent: str) -> List[str]:
        ordered = sorted(scores.items(), key=lambda item: item[1], reverse=True)
        top = ordered[0] if ordered else (intent, 0.0)
        second = ordered[1] if len(ordered) > 1 else (intent, 0.0)
        return [
            f"highest score: {top[0]}={top[1]:.2f}",
            f"runner-up: {second[0]}={second[1]:.2f}",
        ]


def _example_classifier() -> None:
    classifier = UnifiedIntentClassifier()
    samples = [
        "open chrome and search AI news",
        "send a message to the team about the launch",
        "automate the weekly report upload",
    ]
    for sample in samples:
        print(classifier.explain(sample))


if __name__ == "__main__":
    _example_classifier()
