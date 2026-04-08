"""Loop monitor for Jarvis Guardian Layer.

Detects potentially infinite loops in reasoning cycles, planning loops, and
recursive agent spawn chains. Produces guards that other components can enforce
before committing additional compute.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from threading import RLock
from typing import Any, Dict, List
import hashlib
import uuid

from jarvis.memory.memory_system import MemorySystem


@dataclass(slots=True)
class LoopSignal:
    signal_id: str
    timestamp: str
    loop_type: str
    source_module: str
    severity: str
    fingerprint: str
    summary: str
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class LoopGuardDecision:
    allow: bool
    reason: str
    cooldown_seconds: int
    max_depth_allowed: int


class LoopMonitor:
    """Monitors repeated states and recursion expansion."""

    def __init__(
        self,
        memory: MemorySystem,
        *,
        max_state_history: int = 3000,
        repetition_threshold: int = 6,
        max_agent_spawn_depth: int = 2,
        guard_cooldown_seconds: int = 45,
    ) -> None:
        self._memory = memory
        self._lock = RLock()

        self._max_state_history = max(500, max_state_history)
        self._repetition_threshold = max(2, repetition_threshold)
        self._max_agent_spawn_depth = max(1, max_agent_spawn_depth)
        self._guard_cooldown_seconds = max(10, guard_cooldown_seconds)

        self._state_history: List[Dict[str, Any]] = []
        self._signals: List[LoopSignal] = []
        self._blocked_fingerprints: Dict[str, str] = {}

    def record_reasoning_state(
        self,
        *,
        cycle_id: str,
        objective: str,
        trace: List[str],
        depth: int,
    ) -> List[LoopSignal]:
        fingerprint = self._fingerprint("reasoning", objective, trace[-5:])
        return self._record_and_evaluate(
            loop_type="reasoning",
            source_module="reasoning_engine",
            fingerprint=fingerprint,
            metadata={
                "cycle_id": cycle_id,
                "depth": depth,
                "trace_tail": trace[-5:],
                "objective": objective[:300],
            },
        )

    def record_planning_state(
        self,
        *,
        goal_id: str,
        plan_signature: str,
        iteration: int,
    ) -> List[LoopSignal]:
        fingerprint = self._fingerprint("planning", goal_id, plan_signature)
        return self._record_and_evaluate(
            loop_type="planning",
            source_module="planning_system",
            fingerprint=fingerprint,
            metadata={
                "goal_id": goal_id,
                "plan_signature": plan_signature,
                "iteration": iteration,
            },
        )

    def record_agent_spawn_chain(
        self,
        *,
        run_id: str,
        parent_agent_id: str,
        child_agent_id: str,
        depth: int,
    ) -> List[LoopSignal]:
        fingerprint = self._fingerprint("spawn", run_id, parent_agent_id, child_agent_id)
        signals = self._record_and_evaluate(
            loop_type="agent_spawn",
            source_module="agent_swarm_lab",
            fingerprint=fingerprint,
            metadata={
                "run_id": run_id,
                "parent_agent_id": parent_agent_id,
                "child_agent_id": child_agent_id,
                "depth": depth,
            },
        )

        if depth > self._max_agent_spawn_depth:
            signals.append(
                self._emit_signal(
                    loop_type="agent_spawn",
                    source_module="agent_swarm_lab",
                    severity="critical",
                    fingerprint=fingerprint,
                    summary=f"Spawn depth {depth} exceeded max {self._max_agent_spawn_depth}",
                    metadata={"run_id": run_id, "depth": depth},
                )
            )
        return signals

    def should_allow_execution(
        self,
        *,
        loop_type: str,
        fingerprint_hint: str,
        current_depth: int,
    ) -> LoopGuardDecision:
        with self._lock:
            blocked_until = self._blocked_fingerprints.get(fingerprint_hint)
            if blocked_until:
                until_dt = self._to_dt(blocked_until)
                now = datetime.now(timezone.utc)
                if now < until_dt:
                    remaining = max(1, int((until_dt - now).total_seconds()))
                    return LoopGuardDecision(
                        allow=False,
                        reason="fingerprint_temporarily_blocked",
                        cooldown_seconds=remaining,
                        max_depth_allowed=self._max_agent_spawn_depth,
                    )

            if loop_type == "agent_spawn" and current_depth > self._max_agent_spawn_depth:
                return LoopGuardDecision(
                    allow=False,
                    reason="spawn_depth_limit",
                    cooldown_seconds=self._guard_cooldown_seconds,
                    max_depth_allowed=self._max_agent_spawn_depth,
                )

            return LoopGuardDecision(
                allow=True,
                reason="ok",
                cooldown_seconds=0,
                max_depth_allowed=self._max_agent_spawn_depth,
            )

    def recent_signals(self, limit: int = 25) -> List[LoopSignal]:
        with self._lock:
            return list(self._signals[-max(1, limit):])

    def diagnostics(self) -> Dict[str, Any]:
        with self._lock:
            counts: Dict[str, int] = {}
            for item in self._signals[-400:]:
                counts[item.loop_type] = counts.get(item.loop_type, 0) + 1

            return {
                "signals_total": len(self._signals),
                "blocked_fingerprints": len(self._blocked_fingerprints),
                "state_history": len(self._state_history),
                "counts_by_loop_type": counts,
                "limits": {
                    "repetition_threshold": self._repetition_threshold,
                    "max_agent_spawn_depth": self._max_agent_spawn_depth,
                    "guard_cooldown_seconds": self._guard_cooldown_seconds,
                },
            }

    def _record_and_evaluate(
        self,
        *,
        loop_type: str,
        source_module: str,
        fingerprint: str,
        metadata: Dict[str, Any],
    ) -> List[LoopSignal]:
        now = datetime.now(timezone.utc)
        state = {
            "timestamp": now.isoformat(),
            "loop_type": loop_type,
            "source_module": source_module,
            "fingerprint": fingerprint,
            "metadata": metadata,
        }

        with self._lock:
            self._state_history.append(state)
            if len(self._state_history) > self._max_state_history:
                self._state_history = self._state_history[-self._max_state_history:]

            recent_window_start = now - timedelta(seconds=120)
            repeats = [
                item
                for item in self._state_history
                if item["fingerprint"] == fingerprint and self._to_dt(item["timestamp"]) >= recent_window_start
            ]

            signals: List[LoopSignal] = []
            if len(repeats) >= self._repetition_threshold:
                severity = "critical" if len(repeats) >= (self._repetition_threshold * 2) else "error"
                signal = self._emit_signal(
                    loop_type=loop_type,
                    source_module=source_module,
                    severity=severity,
                    fingerprint=fingerprint,
                    summary=(
                        f"Repeated {loop_type} state detected "
                        f"({len(repeats)} times in 120s)"
                    ),
                    metadata={**metadata, "repeat_count": len(repeats)},
                )
                signals.append(signal)
                self._blocked_fingerprints[fingerprint] = (
                    now + timedelta(seconds=self._guard_cooldown_seconds)
                ).isoformat()

            return signals

    def _emit_signal(
        self,
        *,
        loop_type: str,
        source_module: str,
        severity: str,
        fingerprint: str,
        summary: str,
        metadata: Dict[str, Any],
    ) -> LoopSignal:
        signal = LoopSignal(
            signal_id=f"loop-{uuid.uuid4().hex[:12]}",
            timestamp=datetime.now(timezone.utc).isoformat(),
            loop_type=loop_type,
            source_module=source_module,
            severity=severity,
            fingerprint=fingerprint,
            summary=summary,
            metadata=metadata,
        )
        self._signals.append(signal)
        if len(self._signals) > 1200:
            self._signals = self._signals[-1200:]

        self._memory.remember_short_term(
            key=f"guardian:loop:last:{loop_type}",
            value={
                "signal_id": signal.signal_id,
                "loop_type": signal.loop_type,
                "severity": signal.severity,
                "summary": signal.summary,
            },
            tags=["guardian", "loop"],
        )
        self._memory.remember_long_term(
            key=f"guardian:loop:{signal.signal_id}",
            value={
                "timestamp": signal.timestamp,
                "loop_type": signal.loop_type,
                "source_module": signal.source_module,
                "severity": signal.severity,
                "fingerprint": signal.fingerprint,
                "summary": signal.summary,
                "metadata": signal.metadata,
            },
            source="guardian.loop_monitor",
            importance=0.9 if signal.severity == "critical" else 0.75,
            tags=["guardian", "loop", signal.loop_type],
        )
        return signal

    @staticmethod
    def _fingerprint(*parts: Any) -> str:
        raw = "|".join(str(part) for part in parts)
        return hashlib.sha1(raw.encode("utf-8")).hexdigest()[:20]

    @staticmethod
    def _to_dt(ts: str) -> datetime:
        return datetime.fromisoformat(ts.replace("Z", "+00:00"))
