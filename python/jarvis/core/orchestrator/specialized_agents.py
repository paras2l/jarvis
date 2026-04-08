"""Specialized agent implementations for Jarvis orchestration.

Each agent is intentionally deterministic and side-effect-safe for local testing.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Dict, List, Protocol

from jarvis.core.orchestrator.task_router import AgentTask, AgentType


@dataclass(slots=True)
class AgentExecutionResult:
    """Result produced by one specialized agent."""

    task_id: str
    agent_name: AgentType
    success: bool
    summary: str
    artifacts: Dict[str, object] = field(default_factory=dict)


class SpecializedAgent(Protocol):
    """Common protocol implemented by all specialized agents."""

    name: AgentType

    def execute(self, task: AgentTask) -> AgentExecutionResult:
        """Execute one task and return a structured result."""


class BaseSpecializedAgent:
    """Base helper class with shared utility helpers."""

    name: AgentType

    def _now(self) -> str:
        return datetime.now(timezone.utc).isoformat()

    @staticmethod
    def _clean_text(text: str) -> str:
        return " ".join(text.strip().split())

    def _success(self, task: AgentTask, summary: str, artifacts: Dict[str, object]) -> AgentExecutionResult:
        return AgentExecutionResult(
            task_id=task.task_id,
            agent_name=self.name,
            success=True,
            summary=summary,
            artifacts=artifacts,
        )


class ResearchAgent(BaseSpecializedAgent):
    name: AgentType = "ResearchAgent"

    def execute(self, task: AgentTask) -> AgentExecutionResult:
        scope = self._clean_text(task.description)
        findings = [
            "Trend direction identified from recent references",
            "Top opportunities ranked by estimated impact",
            "Primary risk factors listed with mitigation suggestions",
        ]
        artifacts = {
            "scope": scope,
            "findings": findings,
            "source_count": 8,
            "generated_at": self._now(),
        }
        summary = f"Research completed for '{task.title}' with {len(findings)} key findings."
        return self._success(task, summary, artifacts)


class AutomationAgent(BaseSpecializedAgent):
    name: AgentType = "AutomationAgent"

    def execute(self, task: AgentTask) -> AgentExecutionResult:
        workflow = self._clean_text(task.description)
        steps = [
            "Map current workflow and trigger points",
            "Define automation actions and retries",
            "Attach monitoring and fallback path",
            "Validate with dry-run checklist",
        ]
        artifacts = {
            "workflow": workflow,
            "automation_steps": steps,
            "estimated_time_saved_hours": 5,
            "generated_at": self._now(),
        }
        summary = f"Automation plan generated for '{task.title}' with {len(steps)} actionable steps."
        return self._success(task, summary, artifacts)


class CreativeAgent(BaseSpecializedAgent):
    name: AgentType = "CreativeAgent"

    def execute(self, task: AgentTask) -> AgentExecutionResult:
        brief = self._clean_text(task.description)
        concepts = [
            "Hook-focused narrative direction",
            "Visual moodboard with color and typography cues",
            "Three campaign headline options",
            "Thumbnail or hero graphic concept",
        ]
        artifacts = {
            "brief": brief,
            "concepts": concepts,
            "tone": "energetic and clear",
            "generated_at": self._now(),
        }
        summary = f"Creative package drafted for '{task.title}' including narrative and visual direction."
        return self._success(task, summary, artifacts)


class DevelopmentAgent(BaseSpecializedAgent):
    name: AgentType = "DevelopmentAgent"

    def execute(self, task: AgentTask) -> AgentExecutionResult:
        scope = self._clean_text(task.description)
        delivery_plan = [
            "Reproduce issue or confirm implementation baseline",
            "Apply focused code changes in smallest safe units",
            "Run lint/tests for touched areas",
            "Document behavior changes and residual risks",
        ]
        artifacts = {
            "scope": scope,
            "delivery_plan": delivery_plan,
            "tests_required": ["unit", "integration"],
            "generated_at": self._now(),
        }
        summary = f"Development execution plan produced for '{task.title}' with validation checklist."
        return self._success(task, summary, artifacts)


class TradingAgent(BaseSpecializedAgent):
    name: AgentType = "TradingAgent"

    def execute(self, task: AgentTask) -> AgentExecutionResult:
        objective = self._clean_text(task.description)
        risk_controls = {
            "max_position_size_pct": 2,
            "stop_loss_pct": 1.2,
            "take_profit_pct": 2.8,
            "max_daily_drawdown_pct": 3,
        }
        watch_items = [
            "Check trend strength and volume confirmation",
            "Verify macro calendar before entry",
            "Ensure correlation limits across open positions",
        ]
        artifacts = {
            "objective": objective,
            "risk_controls": risk_controls,
            "watch_items": watch_items,
            "compliance_note": "Educational planning output only, not financial advice.",
            "generated_at": self._now(),
        }
        summary = f"Trading plan prepared for '{task.title}' with explicit risk controls."
        return self._success(task, summary, artifacts)


class AgentFactory:
    """Factory and registry for specialized agents."""

    def __init__(self) -> None:
        self._agents: Dict[AgentType, SpecializedAgent] = {
            "ResearchAgent": ResearchAgent(),
            "AutomationAgent": AutomationAgent(),
            "CreativeAgent": CreativeAgent(),
            "DevelopmentAgent": DevelopmentAgent(),
            "TradingAgent": TradingAgent(),
        }

    def get(self, name: AgentType) -> SpecializedAgent:
        return self._agents[name]

    def all_names(self) -> List[AgentType]:
        return list(self._agents.keys())


def _example_agents() -> None:
    factory = AgentFactory()
    sample_tasks = [
        AgentTask("a1", "Research AI trends", "Research and summarize top 2026 trends"),
        AgentTask("a2", "Automate backups", "Automate nightly backup workflow and reporting"),
        AgentTask("a3", "Create campaign", "Design story and visuals for product launch"),
        AgentTask("a4", "Build API", "Develop endpoint with tests and docs"),
        AgentTask("a5", "Plan trade", "Build low-risk swing trade plan"),
    ]

    name_map: Dict[str, AgentType] = {
        "a1": "ResearchAgent",
        "a2": "AutomationAgent",
        "a3": "CreativeAgent",
        "a4": "DevelopmentAgent",
        "a5": "TradingAgent",
    }

    for task in sample_tasks:
        agent_name = name_map[task.task_id]
        result = factory.get(agent_name).execute(task)
        print(f"{task.task_id} -> {result.agent_name}: {result.summary}")


if __name__ == "__main__":
    _example_agents()
