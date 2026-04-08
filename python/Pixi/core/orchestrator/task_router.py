"""Task routing logic for Pixi Agent Orchestrator.

This module decides which specialized agent should execute each incoming task.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, Iterable, List, Literal, Tuple

AgentType = Literal[
    "ResearchAgent",
    "AutomationAgent",
    "CreativeAgent",
    "DevelopmentAgent",
    "TradingAgent",
]


@dataclass(slots=True)
class AgentTask:
    """Executable task representation used by the orchestrator."""

    task_id: str
    title: str
    description: str
    metadata: Dict[str, object] = field(default_factory=dict)


@dataclass(slots=True)
class RouteDecision:
    """Routing result that records selected agent and confidence."""

    task_id: str
    selected_agent: AgentType
    confidence: float
    reason: str


class TaskRouter:
    """Rule-based router mapping task signals to specialized agents."""

    _KEYWORDS: Dict[AgentType, Tuple[str, ...]] = {
        "ResearchAgent": (
            "research",
            "investigate",
            "analyze",
            "summary",
            "market study",
            "benchmark",
            "explore",
        ),
        "AutomationAgent": (
            "automate",
            "workflow",
            "pipeline",
            "schedule",
            "integration",
            "monitor",
            "ops",
        ),
        "CreativeAgent": (
            "creative",
            "design",
            "script",
            "story",
            "thumbnail",
            "brand",
            "content",
            "video",
        ),
        "DevelopmentAgent": (
            "develop",
            "build",
            "refactor",
            "code",
            "bug",
            "api",
            "test",
            "deploy",
        ),
        "TradingAgent": (
            "trade",
            "position",
            "entry",
            "exit",
            "risk",
            "portfolio",
            "market",
            "signal",
        ),
    }

    _ROLE_HINTS: Dict[str, AgentType] = {
        "researchagent": "ResearchAgent",
        "automationagent": "AutomationAgent",
        "creativeagent": "CreativeAgent",
        "developmentagent": "DevelopmentAgent",
        "tradingagent": "TradingAgent",
    }

    def route(self, task: AgentTask) -> RouteDecision:
        """Choose the best agent for one task."""
        role = str(task.metadata.get("agent_role", "")).strip().lower()
        if role in self._ROLE_HINTS:
            chosen = self._ROLE_HINTS[role]
            return RouteDecision(
                task_id=task.task_id,
                selected_agent=chosen,
                confidence=0.98,
                reason=f"Explicit role hint: {role}",
            )

        text = self._normalized_text(task)
        scores = self._score_candidates(text)
        chosen, score = self._pick_best(scores)

        if score == 0.0:
            # Safe deterministic fallback favors implementation throughput.
            chosen = "DevelopmentAgent"
            return RouteDecision(
                task_id=task.task_id,
                selected_agent=chosen,
                confidence=0.35,
                reason="No matching keywords; fallback to DevelopmentAgent",
            )

        reason = self._reason_from_scores(scores, chosen)
        return RouteDecision(
            task_id=task.task_id,
            selected_agent=chosen,
            confidence=min(0.99, 0.45 + score / 10.0),
            reason=reason,
        )

    def route_many(self, tasks: Iterable[AgentTask]) -> List[RouteDecision]:
        """Route many tasks deterministically in input order."""
        return [self.route(task) for task in tasks]

    @staticmethod
    def _normalized_text(task: AgentTask) -> str:
        title = task.title.lower().strip()
        description = task.description.lower().strip()
        tags = " ".join(str(v).lower() for v in task.metadata.values())
        return f"{title} {description} {tags}".strip()

    def _score_candidates(self, text: str) -> Dict[AgentType, float]:
        scores: Dict[AgentType, float] = {
            "ResearchAgent": 0.0,
            "AutomationAgent": 0.0,
            "CreativeAgent": 0.0,
            "DevelopmentAgent": 0.0,
            "TradingAgent": 0.0,
        }

        for agent, keywords in self._KEYWORDS.items():
            for keyword in keywords:
                if keyword in text:
                    # Weighted scoring by keyword length to reduce accidental hits.
                    scores[agent] += 1.0 + min(0.6, len(keyword) / 20.0)

        # Metadata priorities can nudge decision for ambiguous text.
        if "priority=high" in text or "critical" in text:
            scores["DevelopmentAgent"] += 0.4
            scores["AutomationAgent"] += 0.3

        if "portfolio" in text and "report" in text:
            scores["TradingAgent"] += 1.0

        return scores

    @staticmethod
    def _pick_best(scores: Dict[AgentType, float]) -> Tuple[AgentType, float]:
        best_agent: AgentType = "DevelopmentAgent"
        best_score = -1.0

        # Stable deterministic tiebreak by explicit order.
        order: List[AgentType] = [
            "ResearchAgent",
            "AutomationAgent",
            "CreativeAgent",
            "DevelopmentAgent",
            "TradingAgent",
        ]
        for agent in order:
            score = scores.get(agent, 0.0)
            if score > best_score:
                best_agent = agent
                best_score = score

        return best_agent, max(0.0, best_score)

    @staticmethod
    def _reason_from_scores(scores: Dict[AgentType, float], chosen: AgentType) -> str:
        ordered = sorted(scores.items(), key=lambda item: item[1], reverse=True)
        top = ordered[0]
        second = ordered[1] if len(ordered) > 1 else (chosen, 0.0)
        return (
            f"Highest keyword score for {chosen} ({top[1]:.2f}); "
            f"next best {second[0]} ({second[1]:.2f})"
        )


def _example_router() -> None:
    router = TaskRouter()
    sample_tasks = [
        AgentTask("t1", "Research competitors", "Investigate 5 competitors and summarize their offers"),
        AgentTask("t2", "Create logo concept", "Design a creative concept for a launch campaign"),
        AgentTask("t3", "Automate reports", "Automate weekly report workflow with scheduler"),
        AgentTask("t4", "Fix bug", "Debug API timeout issue and add tests"),
        AgentTask("t5", "Trade setup", "Prepare low-risk portfolio trade plan with entry and exit"),
    ]
    for item in router.route_many(sample_tasks):
        print(f"{item.task_id} -> {item.selected_agent} ({item.confidence:.2f}) | {item.reason}")


if __name__ == "__main__":
    _example_router()

