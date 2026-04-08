"""Agent health manager for advanced Pixi orchestration.

Monitors agent stability, tracks failures, and triggers restart/quarantine actions
for resilient multi-agent runtime behavior.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from threading import RLock
from typing import Any, Callable, Dict, List

from Pixi.core_advanced.agent_manager import AgentManager, AgentProfile


@dataclass(slots=True)
class AgentHealthState:
    agent_id: str
    status: str
    score: float
    last_check_at: str
    consecutive_failures: int = 0
    total_failures: int = 0
    total_restarts: int = 0
    quarantined_until: str = ""
    notes: List[str] = field(default_factory=list)

    def is_quarantined(self, now: datetime) -> bool:
        if not self.quarantined_until:
            return False
        try:
            until = datetime.fromisoformat(self.quarantined_until)
        except ValueError:
            return False
        return now < until


@dataclass(slots=True)
class HealthAction:
    agent_id: str
    action: str
    reason: str
    timestamp: str


class AgentHealthManager:
    """Health supervision layer for a large fleet of agents."""

    def __init__(
        self,
        agent_manager: AgentManager,
        restart_callback: Callable[[AgentProfile], bool] | None = None,
    ) -> None:
        self._agent_manager = agent_manager
        self._restart_callback = restart_callback
        self._lock = RLock()
        self._states: Dict[str, AgentHealthState] = {}
        self._actions: List[HealthAction] = []
        self._action_limit = 5000

        self._failure_threshold_for_restart = 2
        self._failure_threshold_for_quarantine = 5
        self._quarantine_minutes = 5

    def register_agent(self, agent: AgentProfile) -> None:
        with self._lock:
            self._states[agent.agent_id] = AgentHealthState(
                agent_id=agent.agent_id,
                status="healthy",
                score=1.0,
                last_check_at=datetime.now(timezone.utc).isoformat(),
            )

    def ensure_all_registered(self) -> int:
        """Sync health state map with current agent manager entries."""
        added = 0
        for agent in self._agent_manager.list_agents():
            with self._lock:
                if agent.agent_id not in self._states:
                    self._states[agent.agent_id] = AgentHealthState(
                        agent_id=agent.agent_id,
                        status="healthy",
                        score=1.0,
                        last_check_at=datetime.now(timezone.utc).isoformat(),
                    )
                    added += 1
        return added

    def report_success(self, agent_id: str) -> bool:
        with self._lock:
            state = self._states.get(agent_id)
            if state is None:
                return False
            state.consecutive_failures = 0
            state.score = min(1.0, state.score + 0.05)
            state.status = "healthy"
            state.last_check_at = datetime.now(timezone.utc).isoformat()
            return True

    def report_failure(self, agent_id: str, reason: str) -> bool:
        with self._lock:
            state = self._states.get(agent_id)
            if state is None:
                return False

            state.consecutive_failures += 1
            state.total_failures += 1
            state.score = max(0.0, state.score - 0.2)
            state.last_check_at = datetime.now(timezone.utc).isoformat()
            state.notes.append(reason)

        self._apply_failure_policy(agent_id, reason)
        return True

    def evaluate(self) -> List[HealthAction]:
        """Run periodic evaluation and return generated actions."""
        self.ensure_all_registered()
        actions: List[HealthAction] = []
        now = datetime.now(timezone.utc)

        for agent in self._agent_manager.list_agents():
            state = self.get_state(agent.agent_id)
            if state is None:
                continue

            if state.is_quarantined(now):
                self._agent_manager.pause_agent(agent.agent_id, reason="health_quarantine")
                continue

            if agent.status == "unavailable":
                action = self._restart_agent(agent, reason="heartbeat_unavailable")
                if action:
                    actions.append(action)
                continue

            if state.consecutive_failures >= self._failure_threshold_for_restart:
                action = self._restart_agent(agent, reason="consecutive_failures")
                if action:
                    actions.append(action)

        return actions

    def get_state(self, agent_id: str) -> AgentHealthState | None:
        with self._lock:
            state = self._states.get(agent_id)
            if state is None:
                return None
            return state

    def all_states(self) -> List[AgentHealthState]:
        with self._lock:
            rows = list(self._states.values())
        rows.sort(key=lambda item: item.agent_id)
        return rows

    def recent_actions(self, limit: int = 100) -> List[HealthAction]:
        if limit <= 0:
            return []
        with self._lock:
            return list(reversed(self._actions[-limit:]))

    def health_summary(self) -> Dict[str, Any]:
        rows = self.all_states()
        return {
            "agents": len(rows),
            "healthy": sum(1 for row in rows if row.status == "healthy"),
            "degraded": sum(1 for row in rows if row.status == "degraded"),
            "quarantined": sum(1 for row in rows if row.status == "quarantined"),
            "avg_score": (sum(row.score for row in rows) / len(rows)) if rows else 0.0,
            "failure_rate": self.failure_rate(),
            "actions_recorded": len(self._actions),
        }

    def failure_rate(self) -> float:
        rows = self.all_states()
        failures = sum(item.total_failures for item in rows)
        restarts = sum(item.total_restarts for item in rows)
        base = max(1, failures + restarts)
        return round(failures / base, 4)

    def quarantined_agents(self) -> List[AgentHealthState]:
        now = datetime.now(timezone.utc)
        out: List[AgentHealthState] = []
        for state in self.all_states():
            if state.is_quarantined(now):
                out.append(state)
        return out

    def clear_quarantine(self, agent_id: str) -> bool:
        state = self.get_state(agent_id)
        if state is None:
            return False
        with self._lock:
            state.quarantined_until = ""
            state.status = "healthy"
            state.consecutive_failures = 0
            state.last_check_at = datetime.now(timezone.utc).isoformat()
        self._agent_manager.resume_agent(agent_id)
        self._record_action(agent_id, "quarantine_cleared", "manual_clear")
        return True

    def auto_recover_quarantined(self) -> int:
        """Resume agents whose quarantine window has elapsed."""
        recovered = 0
        now = datetime.now(timezone.utc)
        for state in self.all_states():
            if not state.quarantined_until:
                continue
            if state.is_quarantined(now):
                continue
            if self.clear_quarantine(state.agent_id):
                recovered += 1
        return recovered

    def mark_agent_unavailable(self, agent_id: str, reason: str) -> bool:
        state = self.get_state(agent_id)
        if state is None:
            return False
        with self._lock:
            state.status = "degraded"
            state.notes.append(f"unavailable:{reason}")
            state.last_check_at = datetime.now(timezone.utc).isoformat()
        self._record_action(agent_id, "marked_unavailable", reason)
        return True

    def export_state(self) -> Dict[str, Any]:
        rows = self.all_states()
        return {
            "summary": self.health_summary(),
            "states": [
                {
                    "agent_id": item.agent_id,
                    "status": item.status,
                    "score": item.score,
                    "consecutive_failures": item.consecutive_failures,
                    "total_failures": item.total_failures,
                    "total_restarts": item.total_restarts,
                    "quarantined_until": item.quarantined_until,
                }
                for item in rows
            ],
            "actions": [
                {
                    "agent_id": item.agent_id,
                    "action": item.action,
                    "reason": item.reason,
                    "timestamp": item.timestamp,
                }
                for item in self.recent_actions(limit=200)
            ],
        }

    def clear_old_notes(self, max_notes_per_agent: int = 20) -> int:
        trimmed = 0
        with self._lock:
            for state in self._states.values():
                if len(state.notes) > max_notes_per_agent:
                    overflow = len(state.notes) - max_notes_per_agent
                    state.notes = state.notes[-max_notes_per_agent:]
                    trimmed += overflow
        return trimmed

    def _apply_failure_policy(self, agent_id: str, reason: str) -> None:
        state = self.get_state(agent_id)
        if state is None:
            return

        if state.consecutive_failures >= self._failure_threshold_for_quarantine:
            until = datetime.now(timezone.utc) + timedelta(minutes=self._quarantine_minutes)
            with self._lock:
                state.status = "quarantined"
                state.quarantined_until = until.isoformat()
            self._agent_manager.pause_agent(agent_id, reason="health_quarantine")
            self._record_action(agent_id, "quarantine", reason)
            return

        if state.consecutive_failures >= self._failure_threshold_for_restart:
            with self._lock:
                state.status = "degraded"
            self._record_action(agent_id, "restart_requested", reason)

    def _restart_agent(self, agent: AgentProfile, reason: str) -> HealthAction | None:
        state = self.get_state(agent.agent_id)
        if state is None:
            return None

        restarted = False
        if self._restart_callback is not None:
            try:
                restarted = bool(self._restart_callback(agent))
            except Exception:  # noqa: BLE001
                restarted = False

        if not restarted:
            # Fallback soft restart: resume agent and reset counters.
            self._agent_manager.resume_agent(agent.agent_id)
            restarted = True

        if restarted:
            with self._lock:
                state.total_restarts += 1
                state.consecutive_failures = 0
                state.status = "healthy"
                state.score = min(1.0, state.score + 0.15)
                state.last_check_at = datetime.now(timezone.utc).isoformat()
                state.quarantined_until = ""

            action = self._record_action(agent.agent_id, "restart", reason)
            return action

        action = self._record_action(agent.agent_id, "restart_failed", reason)
        return action

    def _record_action(self, agent_id: str, action: str, reason: str) -> HealthAction:
        item = HealthAction(
            agent_id=agent_id,
            action=action,
            reason=reason,
            timestamp=datetime.now(timezone.utc).isoformat(),
        )
        with self._lock:
            self._actions.append(item)
            while len(self._actions) > self._action_limit:
                self._actions.pop(0)
        return item


def _example_health_manager() -> None:
    from Pixi.core_advanced.agent_manager import AgentManager

    manager = AgentManager()
    agent = manager.register_agent("research-1", ["research"], max_parallel_tasks=2)

    health = AgentHealthManager(manager)
    health.register_agent(agent)

    health.report_failure(agent.agent_id, "provider timeout")
    health.report_failure(agent.agent_id, "provider timeout")
    health.report_failure(agent.agent_id, "provider timeout")

    actions = health.evaluate()
    print("Actions:", actions)
    print("Summary:", health.health_summary())


if __name__ == "__main__":
    _example_health_manager()

