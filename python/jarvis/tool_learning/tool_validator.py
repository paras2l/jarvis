"""Validate generated Jarvis tools before activation."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
import ast
import time
from typing import Any, Dict, List, Mapping

from jarvis.memory.memory_system import MemorySystem
from jarvis.tool_learning.tool_generator import GeneratedToolArtifact
from jarvis.tool_learning.tool_registry import ToolRegistry


@dataclass(slots=True)
class ToolValidationReport:
    """Validation result for one generated tool."""

    tool_name: str
    source_path: str
    syntax_ok: bool
    security_ok: bool
    performance_ok: bool
    activation_allowed: bool
    checks: Dict[str, Any] = field(default_factory=dict)
    issues: List[str] = field(default_factory=list)
    metrics: Dict[str, Any] = field(default_factory=dict)
    validated_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class ToolValidator:
    """Performs syntax, security, and runtime validation."""

    _BANNED_IMPORTS = {"os", "sys", "subprocess", "socket", "shutil", "pathlib"}
    _BANNED_CALLS = {"eval", "exec", "compile", "open", "input", "__import__"}

    def __init__(self, memory: MemorySystem, tool_registry: ToolRegistry) -> None:
        self._memory = memory
        self._tool_registry = tool_registry

    def validate(self, artifact: GeneratedToolArtifact, *, sample_payload: Mapping[str, Any] | None = None, max_runtime_ms: float = 25.0) -> ToolValidationReport:
        sample = dict(sample_payload or self._default_sample_payload(artifact))
        issues: List[str] = []
        checks: Dict[str, Any] = {}

        syntax_ok = self._check_syntax(artifact.source_code, artifact.source_path, issues, checks)
        security_ok = self._check_security(artifact.source_code, issues, checks)
        performance_ok = False
        runtime_output: Dict[str, Any] | None = None

        if syntax_ok and security_ok:
            runtime_output, runtime_ms = self._dry_run(artifact, sample)
            checks["runtime_ms"] = runtime_ms
            checks["runtime_output_keys"] = sorted(list(runtime_output.keys())) if isinstance(runtime_output, dict) else []
            performance_ok = runtime_ms <= max_runtime_ms
            if not performance_ok:
                issues.append(f"runtime exceeded threshold: {runtime_ms:.2f}ms > {max_runtime_ms:.2f}ms")
        else:
            checks["runtime_ms"] = None
            checks["runtime_output_keys"] = []

        activation_allowed = syntax_ok and security_ok and performance_ok
        report = ToolValidationReport(
            tool_name=artifact.tool_name,
            source_path=artifact.source_path,
            syntax_ok=syntax_ok,
            security_ok=security_ok,
            performance_ok=performance_ok,
            activation_allowed=activation_allowed,
            checks=checks,
            issues=issues,
            metrics={
                "sample_payload_keys": sorted(list(sample.keys())),
                "runtime_output": runtime_output,
            },
        )
        self._persist(report)
        return report

    def validate_handler(self, tool_name: str, payload: Mapping[str, Any]) -> ToolValidationReport:
        handler = self._tool_registry.get_handler(tool_name)
        if handler is None:
            return ToolValidationReport(
                tool_name=tool_name,
                source_path="",
                syntax_ok=False,
                security_ok=False,
                performance_ok=False,
                activation_allowed=False,
                issues=["tool handler unavailable"],
                checks={"handler_present": False},
                metrics={},
            )

        started = time.perf_counter()
        try:
            output = handler(dict(payload))
            runtime_ms = (time.perf_counter() - started) * 1000.0
            tool = self._tool_registry.get_tool(tool_name)
            return ToolValidationReport(
                tool_name=tool_name,
                source_path=tool.source_path if tool else "",
                syntax_ok=True,
                security_ok=True,
                performance_ok=runtime_ms <= 25.0,
                activation_allowed=runtime_ms <= 25.0,
                checks={"handler_present": True, "runtime_ms": runtime_ms},
                issues=[] if runtime_ms <= 25.0 else [f"handler runtime {runtime_ms:.2f}ms exceeded threshold"],
                metrics={"output": output},
            )
        except Exception as exc:  # noqa: BLE001
            tool = self._tool_registry.get_tool(tool_name)
            return ToolValidationReport(
                tool_name=tool_name,
                source_path=tool.source_path if tool else "",
                syntax_ok=True,
                security_ok=True,
                performance_ok=False,
                activation_allowed=False,
                checks={"handler_present": True},
                issues=[f"handler raised {type(exc).__name__}: {exc}"],
                metrics={},
            )

    def _check_syntax(self, source: str, source_path: str, issues: List[str], checks: Dict[str, Any]) -> bool:
        try:
            tree = ast.parse(source, filename=source_path)
        except SyntaxError as exc:
            issues.append(f"syntax error: {exc.msg} at line {exc.lineno}")
            checks["has_execute"] = False
            checks["syntax_nodes"] = 0
            return False

        has_execute = any(isinstance(node, ast.FunctionDef) and node.name == "execute" for node in tree.body)
        if not has_execute:
            issues.append("missing execute(payload) entrypoint")

        checks["has_execute"] = has_execute
        checks["syntax_nodes"] = sum(1 for _ in ast.walk(tree))
        return has_execute

    def _check_security(self, source: str, issues: List[str], checks: Dict[str, Any]) -> bool:
        try:
            tree = ast.parse(source)
        except SyntaxError:
            return False

        banned_hits: List[str] = []
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    base = alias.name.split(".")[0]
                    if base in self._BANNED_IMPORTS:
                        banned_hits.append(f"import:{alias.name}")
            elif isinstance(node, ast.ImportFrom):
                module = (node.module or "").split(".")[0]
                if module in self._BANNED_IMPORTS:
                    banned_hits.append(f"from:{node.module}")
            elif isinstance(node, ast.Call):
                target = self._call_name(node.func)
                if target and any(target == banned or target.endswith(f".{banned}") for banned in self._BANNED_CALLS):
                    banned_hits.append(f"call:{target}")

        checks["banned_hits"] = banned_hits
        if banned_hits:
            issues.extend([f"security issue: {hit}" for hit in banned_hits])
        return not banned_hits

    def _dry_run(self, artifact: GeneratedToolArtifact, sample_payload: Mapping[str, Any]) -> tuple[Dict[str, Any], float]:
        callable_obj = artifact.in_memory_callable
        if callable_obj is None:
            namespace: Dict[str, Any] = {}
            code = compile(artifact.source_code, artifact.source_path, "exec")
            exec(code, namespace, namespace)
            callable_obj = namespace.get(artifact.entrypoint)

        if not callable(callable_obj):
            raise ValueError("generated tool has no callable execute entrypoint")

        started = time.perf_counter()
        output = callable_obj(dict(sample_payload))
        runtime_ms = (time.perf_counter() - started) * 1000.0
        if not isinstance(output, dict):
            output = {"status": "non_dict_output", "value": output}
        return output, runtime_ms

    @staticmethod
    def _default_sample_payload(artifact: GeneratedToolArtifact) -> Dict[str, Any]:
        return {
            "task": f"validate {artifact.tool_name}",
            "goal": artifact.description or artifact.tool_name,
            "context": {"source_path": artifact.source_path},
        }

    @staticmethod
    def _call_name(node: ast.AST) -> str | None:
        if isinstance(node, ast.Name):
            return node.id
        if isinstance(node, ast.Attribute):
            left = ToolValidator._call_name(node.value)
            if left:
                return f"{left}.{node.attr}"
        return None

    def _persist(self, report: ToolValidationReport) -> None:
        payload = {
            "type": "tool_validation",
            "tool_name": report.tool_name,
            "source_path": report.source_path,
            "syntax_ok": report.syntax_ok,
            "security_ok": report.security_ok,
            "performance_ok": report.performance_ok,
            "activation_allowed": report.activation_allowed,
            "issues": list(report.issues),
            "checks": dict(report.checks),
            "metrics": dict(report.metrics),
            "validated_at": report.validated_at,
        }
        self._memory.remember_short_term(
            key=f"tool_learning:validation:{report.tool_name}",
            value=payload,
            tags=["tool_learning", "validation"],
        )
        self._memory.remember_long_term(
            key=f"tool_learning:validation:{report.tool_name}:{report.validated_at}",
            value=payload,
            source="jarvis.tool_learning.tool_validator",
            importance=0.8,
            tags=["tool_learning", "validation"],
        )
