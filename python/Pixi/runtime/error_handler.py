"""Runtime error handler for Pixi core loop.

Centralizes error logging and retry behavior so runtime components can fail
safely without crashing the whole process.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import logging
from logging.handlers import RotatingFileHandler
from pathlib import Path
import traceback
from typing import Any, Callable, Dict, List, TypeVar

T = TypeVar("T")


@dataclass(slots=True)
class ErrorRecord:
    """Structured record for one captured runtime error."""

    timestamp: str
    component: str
    operation: str
    error_type: str
    message: str
    traceback_text: str
    context: Dict[str, Any]


@dataclass(slots=True)
class RetryDecision:
    """Result from retry policy evaluation."""

    should_retry: bool
    next_delay_seconds: float
    reason: str


class RetryPolicy:
    """Simple bounded retry policy with exponential backoff."""

    def __init__(self, max_retries: int = 3, base_delay_seconds: float = 0.2, max_delay_seconds: float = 3.0) -> None:
        self.max_retries = max(0, max_retries)
        self.base_delay_seconds = max(0.0, base_delay_seconds)
        self.max_delay_seconds = max(0.0, max_delay_seconds)

    def decide(self, attempt_number: int, error: Exception | None = None) -> RetryDecision:
        if attempt_number >= self.max_retries:
            return RetryDecision(False, 0.0, "retry_limit_reached")

        delay = self.base_delay_seconds * (2 ** attempt_number)
        delay = min(self.max_delay_seconds, delay)

        # Some errors should not be retried.
        if isinstance(error, (ValueError, TypeError)):
            return RetryDecision(False, 0.0, "non_retriable_error")

        return RetryDecision(True, delay, "transient_or_unknown_error")


class RuntimeErrorHandler:
    """Handles runtime errors and retry orchestration."""

    def __init__(
        self,
        log_path: str = "python/.Pixi_runtime/runtime_errors.log",
        retry_policy: RetryPolicy | None = None,
    ) -> None:
        self._log_path = Path(log_path)
        self._log_path.parent.mkdir(parents=True, exist_ok=True)
        self._retry_policy = retry_policy or RetryPolicy()
        self._history: List[ErrorRecord] = []
        self._history_limit = 1000
        self._logger = self._build_logger()

    def capture(
        self,
        *,
        component: str,
        operation: str,
        error: Exception,
        context: Dict[str, Any] | None = None,
    ) -> ErrorRecord:
        """Capture, log, and return a structured error record."""
        record = ErrorRecord(
            timestamp=datetime.now(timezone.utc).isoformat(),
            component=component,
            operation=operation,
            error_type=type(error).__name__,
            message=str(error),
            traceback_text=traceback.format_exc(),
            context=dict(context or {}),
        )

        self._append_history(record)
        self._logger.error(
            "[%s] %s.%s failed: %s | context=%s\n%s",
            record.timestamp,
            record.component,
            record.operation,
            record.message,
            record.context,
            record.traceback_text,
        )
        return record

    def execute_with_retry(
        self,
        *,
        component: str,
        operation: str,
        func: Callable[[], T],
        on_retry: Callable[[int, RetryDecision], None] | None = None,
    ) -> T:
        """Execute callable with centralized retry and error capture."""
        attempt = 0
        while True:
            try:
                return func()
            except Exception as exc:  # noqa: BLE001
                self.capture(component=component, operation=operation, error=exc, context={"attempt": attempt})
                decision = self._retry_policy.decide(attempt_number=attempt, error=exc)
                if not decision.should_retry:
                    raise
                if on_retry:
                    on_retry(attempt, decision)
                attempt += 1

    def safe_call(
        self,
        *,
        component: str,
        operation: str,
        func: Callable[[], T],
        default: T,
    ) -> T:
        """Execute callable and return default value on failure."""
        try:
            return func()
        except Exception as exc:  # noqa: BLE001
            self.capture(component=component, operation=operation, error=exc)
            return default

    def recent_errors(self, limit: int = 20) -> List[ErrorRecord]:
        if limit <= 0:
            return []
        return list(reversed(self._history[-limit:]))

    def stats(self) -> Dict[str, Any]:
        return {
            "logged_errors": len(self._history),
            "log_file": str(self._log_path),
            "retry_policy": {
                "max_retries": self._retry_policy.max_retries,
                "base_delay_seconds": self._retry_policy.base_delay_seconds,
                "max_delay_seconds": self._retry_policy.max_delay_seconds,
            },
        }

    def _append_history(self, record: ErrorRecord) -> None:
        self._history.append(record)
        while len(self._history) > self._history_limit:
            self._history.pop(0)

    def _build_logger(self) -> logging.Logger:
        logger = logging.getLogger("Pixi.runtime.error_handler")
        logger.setLevel(logging.INFO)
        logger.propagate = False

        # Avoid duplicate handlers if runtime is re-created in same process.
        if logger.handlers:
            return logger

        handler = RotatingFileHandler(
            filename=str(self._log_path),
            maxBytes=1_000_000,
            backupCount=3,
            encoding="utf-8",
        )
        handler.setLevel(logging.INFO)
        handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
        logger.addHandler(handler)
        return logger


def _example_error_handler() -> None:
    handler = RuntimeErrorHandler()

    state = {"counter": 0}

    def flaky() -> str:
        state["counter"] += 1
        if state["counter"] < 2:
            raise RuntimeError("temporary failure")
        return "success-after-retry"

    print("Error Handler Example")
    output = handler.execute_with_retry(component="demo", operation="flaky_call", func=flaky)
    print("Output:", output)
    print("Stats:", handler.stats())


if __name__ == "__main__":
    _example_error_handler()

