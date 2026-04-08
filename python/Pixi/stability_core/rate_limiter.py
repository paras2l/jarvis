"""Rate limiter for APIs, browser actions, and task execution."""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass, field
from datetime import datetime, timezone
import time
from typing import Any, Deque, Dict, Optional


@dataclass(slots=True)
class RatePolicy:
    """Per-channel token bucket style policy."""

    key: str
    max_calls: int
    period_seconds: float
    burst_limit: int = 0


@dataclass(slots=True)
class RateDecision:
    """Result of rate limit check."""

    allowed: bool
    key: str
    wait_seconds: float
    reason: str
    remaining: int


@dataclass(slots=True)
class _Window:
    timestamps: Deque[float] = field(default_factory=deque)


@dataclass(slots=True)
class RateLimiter:
    """Simple multi-channel sliding-window rate limiter."""

    policies: Dict[str, RatePolicy] = field(default_factory=dict)
    windows: Dict[str, _Window] = field(default_factory=dict)

    def register_policy(self, policy: RatePolicy) -> None:
        self.policies[policy.key] = policy
        self.windows.setdefault(policy.key, _Window())

    def allow(self, key: str, now: Optional[float] = None) -> RateDecision:
        """Check and reserve one operation slot for the specified key."""

        if key not in self.policies:
            # Unconfigured channels are treated permissively.
            return RateDecision(
                allowed=True,
                key=key,
                wait_seconds=0.0,
                reason="no_policy",
                remaining=999999,
            )

        policy = self.policies[key]
        window = self.windows.setdefault(key, _Window())
        current = now if now is not None else time.time()

        self._evict_old(window, current, policy.period_seconds)
        allowed_calls = policy.max_calls + max(0, policy.burst_limit)

        if len(window.timestamps) >= allowed_calls:
            oldest = window.timestamps[0]
            wait_for = max(0.0, policy.period_seconds - (current - oldest))
            return RateDecision(
                allowed=False,
                key=key,
                wait_seconds=round(wait_for, 3),
                reason="rate_exceeded",
                remaining=0,
            )

        window.timestamps.append(current)
        remaining = max(0, allowed_calls - len(window.timestamps))
        return RateDecision(
            allowed=True,
            key=key,
            wait_seconds=0.0,
            reason="allowed",
            remaining=remaining,
        )

    def refund(self, key: str, count: int = 1) -> None:
        """Rollback consumed slots when operation was skipped."""

        if key not in self.windows:
            return
        for _ in range(max(0, count)):
            if not self.windows[key].timestamps:
                break
            self.windows[key].timestamps.pop()

    def apply_global_multiplier(self, multiplier: float) -> None:
        """Lower or increase throughput by scaling policy limits."""

        safe = max(0.05, min(3.0, multiplier))
        for key, policy in self.policies.items():
            scaled = max(1, int(policy.max_calls * safe))
            self.policies[key] = RatePolicy(
                key=policy.key,
                max_calls=scaled,
                period_seconds=policy.period_seconds,
                burst_limit=policy.burst_limit,
            )

    def diagnostics(self) -> Dict[str, Any]:
        now = time.time()
        details: Dict[str, Any] = {}
        for key, policy in self.policies.items():
            window = self.windows.setdefault(key, _Window())
            self._evict_old(window, now, policy.period_seconds)
            details[key] = {
                "max_calls": policy.max_calls,
                "period_seconds": policy.period_seconds,
                "burst_limit": policy.burst_limit,
                "in_window": len(window.timestamps),
                "remaining": max(0, policy.max_calls + policy.burst_limit - len(window.timestamps)),
            }

        return {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "channels": details,
        }

    def _evict_old(self, window: _Window, current: float, period_seconds: float) -> None:
        boundary = current - period_seconds
        while window.timestamps and window.timestamps[0] <= boundary:
            window.timestamps.popleft()
