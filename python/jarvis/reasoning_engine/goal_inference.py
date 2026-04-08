"""Goal inference engine for Jarvis reasoning.

Transforms user requests + context signals into explicit objectives that can be
used by strategy generation and planning.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
import re
from typing import Any, Dict, List, Tuple


@dataclass(slots=True)
class GoalHypothesis:
    """One candidate interpretation for the user's real objective."""

    label: str
    objective: str
    confidence: float
    objective_type: str
    horizon: str
    urgency: float
    rationale: List[str] = field(default_factory=list)
    entities: Dict[str, List[str]] = field(default_factory=dict)
    assumptions: List[str] = field(default_factory=list)


@dataclass(slots=True)
class GoalInferenceResult:
    """Structured output consumed by downstream reasoning modules."""

    inferred_goal: str
    objective_type: str
    horizon: str
    urgency: float
    confidence: float
    hypotheses: List[GoalHypothesis] = field(default_factory=list)
    entities: Dict[str, List[str]] = field(default_factory=dict)
    clarifying_questions: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)


class GoalInferenceEngine:
    """Infers the true objective behind user instructions and runtime context."""

    _TIME_WORDS = {
        "immediately": 0.95,
        "urgent": 0.95,
        "asap": 0.92,
        "now": 0.9,
        "today": 0.8,
        "tonight": 0.82,
        "tomorrow": 0.72,
        "later": 0.45,
        "eventually": 0.3,
        "someday": 0.2,
    }

    _DOMAIN_PATTERNS: List[Tuple[str, str, str]] = [
        (r"\b(video|youtube|script|voiceover|thumbnail|render)\b", "creative_production", "creative"),
        (r"\b(code|build|refactor|debug|project|deploy|test)\b", "software_delivery", "delivery"),
        (r"\b(market|stock|crypto|trade|analysis|setup)\b", "market_analysis", "analysis"),
        (r"\b(research|compare|study|investigate|summarize)\b", "knowledge_discovery", "analysis"),
        (r"\b(automate|workflow|pipeline|orchestrate|schedule)\b", "workflow_orchestration", "execution"),
        (r"\b(message|email|reply|send|notify)\b", "communication", "execution"),
        (r"\b(open|launch|close|click|type|search)\b", "device_control", "execution"),
    ]

    _ENTITY_PATTERNS: Dict[str, str] = {
        "applications": r"\b(vscode|chrome|edge|whatsapp|telegram|tradingview|mt5|notion)\b",
        "assets": r"\b([A-Z]{2,6}USDT|[A-Z]{2,6}/[A-Z]{2,6}|BTC|ETH|SOL|AAPL|TSLA)\b",
        "artifacts": r"\b(report|dashboard|summary|script|video|plan|checklist|brief)\b",
        "actions": r"\b(open|launch|build|research|analyze|create|send|automate|summarize)\b",
    }

    def infer(
        self,
        user_text: str,
        context: Any,
        *,
        queued_goals: List[Dict[str, Any]] | None = None,
        world_signals: Dict[str, Any] | None = None,
    ) -> GoalInferenceResult:
        """Infer objective intent from text + context + runtime signals."""
        clean = self._normalize(user_text)
        domain_hypotheses = self._build_domain_hypotheses(clean, context)
        context_hypotheses = self._build_context_hypotheses(clean, context)
        queue_hypotheses = self._build_queue_hypotheses(queued_goals or [], context)

        candidates = domain_hypotheses + context_hypotheses + queue_hypotheses
        if not candidates:
            candidates.append(self._fallback_hypothesis(clean, context))

        urgency = self._infer_urgency(clean, context, world_signals or {})
        for item in candidates:
            item.urgency = round(max(item.urgency, urgency * 0.85), 4)
            item.confidence = round(min(0.99, item.confidence + urgency * 0.05), 4)

        ranked = sorted(candidates, key=lambda row: (row.confidence, row.urgency), reverse=True)
        best = ranked[0]
        entities = self._extract_entities(clean)
        clarifiers = self._build_clarifiers(best, clean, entities)

        return GoalInferenceResult(
            inferred_goal=best.objective,
            objective_type=best.objective_type,
            horizon=best.horizon,
            urgency=best.urgency,
            confidence=best.confidence,
            hypotheses=ranked,
            entities=entities,
            clarifying_questions=clarifiers,
            metadata={
                "generated_at": datetime.now(timezone.utc).isoformat(),
                "candidate_count": len(ranked),
                "input_text": clean,
            },
        )

    def infer_from_signals(self, context: Any, world_signals: Dict[str, Any] | None = None) -> GoalInferenceResult:
        """Infer objective when no direct command text exists."""
        synthesized = self._synthesize_text_from_context(context, world_signals or {})
        return self.infer(synthesized, context, queued_goals=[], world_signals=world_signals)

    def summarize(self, result: GoalInferenceResult) -> Dict[str, Any]:
        """Compact summary for memory and diagnostics."""
        return {
            "goal": result.inferred_goal,
            "type": result.objective_type,
            "horizon": result.horizon,
            "urgency": result.urgency,
            "confidence": result.confidence,
            "hypotheses": [
                {
                    "label": row.label,
                    "objective": row.objective,
                    "confidence": row.confidence,
                }
                for row in result.hypotheses[:4]
            ],
        }

    def _build_domain_hypotheses(self, text: str, context: Any) -> List[GoalHypothesis]:
        out: List[GoalHypothesis] = []
        for pattern, label, objective_type in self._DOMAIN_PATTERNS:
            if not re.search(pattern, text, flags=re.IGNORECASE):
                continue
            horizon = self._infer_horizon(text, objective_type)
            objective = self._build_objective_text(label, text)
            out.append(
                GoalHypothesis(
                    label=label,
                    objective=objective,
                    confidence=self._base_confidence_for(label),
                    objective_type=objective_type,
                    horizon=horizon,
                    urgency=0.55,
                    rationale=[f"domain_match:{label}", f"pattern:{pattern}"],
                    entities=self._extract_entities(text),
                    assumptions=[f"Objective requires {label.replace('_', ' ')} capabilities."],
                )
            )

        app = str(getattr(context, "current_application", "")).lower()
        if "trading" in app and not any(row.label == "market_analysis" for row in out):
            out.append(
                GoalHypothesis(
                    label="market_analysis",
                    objective="Generate a market analysis brief and identify actionable signals.",
                    confidence=0.71,
                    objective_type="analysis",
                    horizon="short_term",
                    urgency=0.66,
                    rationale=["foreground_app:trading"],
                )
            )
        return out

    def _build_context_hypotheses(self, text: str, context: Any) -> List[GoalHypothesis]:
        out: List[GoalHypothesis] = []
        activity = str(getattr(context, "user_activity", "unknown")).lower()
        if activity in {"development", "coding"}:
            out.append(
                GoalHypothesis(
                    label="software_delivery",
                    objective="Deliver implementation progress for the active software objective.",
                    confidence=0.62,
                    objective_type="delivery",
                    horizon="short_term",
                    urgency=0.58,
                    rationale=["activity:development"],
                )
            )
        if activity in {"research", "analysis"}:
            out.append(
                GoalHypothesis(
                    label="knowledge_discovery",
                    objective="Synthesize research findings and extract practical next actions.",
                    confidence=0.6,
                    objective_type="analysis",
                    horizon="short_term",
                    urgency=0.52,
                    rationale=["activity:research"],
                )
            )
        if text and "" == text.strip():
            out.append(self._fallback_hypothesis(text, context))
        return out

    def _build_queue_hypotheses(self, queued_goals: List[Dict[str, Any]], context: Any) -> List[GoalHypothesis]:
        out: List[GoalHypothesis] = []
        if not queued_goals:
            return out
        next_goal = queued_goals[0]
        goal_text = self._normalize(str(next_goal.get("text", "")))
        if not goal_text:
            return out

        out.append(
            GoalHypothesis(
                label="queued_goal_execution",
                objective=f"Advance queued objective: {goal_text}",
                confidence=0.69,
                objective_type="execution",
                horizon="short_term",
                urgency=0.61,
                rationale=["queued_goal_present"],
                assumptions=["Queued goals represent explicit user priorities."],
            )
        )

        if len(queued_goals) > 1:
            out.append(
                GoalHypothesis(
                    label="queue_optimization",
                    objective="Optimize the order of queued goals to maximize value under constraints.",
                    confidence=0.52,
                    objective_type="planning",
                    horizon="mid_term",
                    urgency=0.45,
                    rationale=["multiple_queued_goals"],
                )
            )
        return out

    def _fallback_hypothesis(self, text: str, context: Any) -> GoalHypothesis:
        objective = text if text else "Provide general assistance aligned to current context."
        return GoalHypothesis(
            label="general_assistance",
            objective=f"Support the user with the objective: {objective}",
            confidence=0.48,
            objective_type="execution",
            horizon="short_term",
            urgency=0.4,
            rationale=["fallback_inference"],
        )

    def _infer_urgency(self, text: str, context: Any, world_signals: Dict[str, Any]) -> float:
        score = 0.35
        lower = text.lower()
        for token, weight in self._TIME_WORDS.items():
            if token in lower:
                score = max(score, weight)

        tod = str(getattr(context, "time_of_day", "")).lower()
        if tod in {"morning", "afternoon"}:
            score += 0.03

        if world_signals.get("high_stakes_domain"):
            score += 0.08
        if world_signals.get("deadline_detected"):
            score += 0.15
        if world_signals.get("system_health") in {"degraded", "critical"}:
            score += 0.05

        return round(min(0.98, max(0.1, score)), 4)

    def _infer_horizon(self, text: str, objective_type: str) -> str:
        lower = text.lower()
        if any(token in lower for token in ["today", "now", "immediately", "asap", "quick"]):
            return "immediate"
        if any(token in lower for token in ["this week", "soon", "later", "tonight"]):
            return "short_term"
        if any(token in lower for token in ["roadmap", "quarter", "long term", "future"]):
            return "long_term"
        if objective_type in {"planning", "analysis"}:
            return "short_term"
        return "immediate"

    def _build_objective_text(self, label: str, raw_text: str) -> str:
        clean = raw_text.strip()
        if label == "software_delivery":
            return f"Translate request into implementable software tasks and deliver validated progress: {clean}"
        if label == "creative_production":
            return f"Produce creative assets and narrative outputs aligned with the request: {clean}"
        if label == "market_analysis":
            return f"Analyze current market context and produce a risk-aware insight brief for: {clean}"
        if label == "workflow_orchestration":
            return f"Design and execute an automation workflow for: {clean}"
        if label == "communication":
            return f"Prepare and execute communication outcome requested by user: {clean}"
        return f"Execute the user objective effectively: {clean}"

    def _extract_entities(self, text: str) -> Dict[str, List[str]]:
        out: Dict[str, List[str]] = {}
        for key, pattern in self._ENTITY_PATTERNS.items():
            matches = re.findall(pattern, text, flags=re.IGNORECASE)
            if not matches:
                continue
            normalized = sorted({str(item).strip() for item in matches if str(item).strip()})
            if normalized:
                out[key] = normalized
        return out

    def _build_clarifiers(self, best: GoalHypothesis, text: str, entities: Dict[str, List[str]]) -> List[str]:
        questions: List[str] = []
        if best.confidence < 0.6:
            questions.append("What is the single highest-priority outcome you want first?")
        if "artifacts" not in entities and best.objective_type in {"delivery", "analysis", "creative"}:
            questions.append("What output format do you want (report, checklist, code patch, or summary)?")
        if best.horizon in {"short_term", "long_term"} and "immediate" not in text.lower():
            questions.append("Do you want a quick draft now or a deeper multi-step execution?")
        return questions[:3]

    @staticmethod
    def _base_confidence_for(label: str) -> float:
        table = {
            "software_delivery": 0.74,
            "creative_production": 0.72,
            "market_analysis": 0.75,
            "knowledge_discovery": 0.68,
            "workflow_orchestration": 0.7,
            "communication": 0.65,
            "device_control": 0.63,
        }
        return table.get(label, 0.58)

    @staticmethod
    def _normalize(text: str) -> str:
        return " ".join(str(text).strip().split())

    @staticmethod
    def _synthesize_text_from_context(context: Any, world_signals: Dict[str, Any]) -> str:
        app = str(getattr(context, "current_application", "unknown"))
        activity = str(getattr(context, "user_activity", "unknown"))
        urgency = "high" if world_signals.get("deadline_detected") else "normal"
        return f"Context-driven objective for app={app} activity={activity} urgency={urgency}"
