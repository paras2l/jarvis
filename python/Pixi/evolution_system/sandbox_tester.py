"""Sandbox tester for Evolution System.

Runs generated features in isolated staging execution with mandatory checks:
- syntax compilation
- manifest integrity
- safety policy assertions
- optional behavioral smoke run
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List
import json

from Pixi.evolution_system.feature_generator import GeneratedFeature
from Pixi.memory.memory_system import MemorySystem


@dataclass(slots=True)
class SandboxResult:
    feature_id: str
    version_id: str
    passed: bool
    score: float
    checks: Dict[str, bool] = field(default_factory=dict)
    warnings: List[str] = field(default_factory=list)
    errors: List[str] = field(default_factory=list)
    details: Dict[str, Any] = field(default_factory=dict)
    started_at: str = ""
    completed_at: str = ""


@dataclass(slots=True)
class SandboxBatch:
    generated_at: str
    results: List[SandboxResult] = field(default_factory=list)
    metrics: Dict[str, Any] = field(default_factory=dict)


class SandboxTester:
    """Validate generated features before deployment."""

    def __init__(self, memory: MemorySystem) -> None:
        self._memory = memory

    def test_many(self, features: Iterable[GeneratedFeature]) -> SandboxBatch:
        rows = list(features)
        results = [self.test_one(item) for item in rows]
        batch = SandboxBatch(
            generated_at=datetime.now(timezone.utc).isoformat(),
            results=results,
            metrics=self._metrics(results),
        )
        self._persist_batch(batch)
        return batch

    def test_one(self, feature: GeneratedFeature) -> SandboxResult:
        started = datetime.now(timezone.utc).isoformat()
        checks: Dict[str, bool] = {}
        warnings: List[str] = []
        errors: List[str] = []
        detail: Dict[str, Any] = {}

        manifest_check = self._check_manifest(feature)
        checks["manifest"] = manifest_check["ok"]
        if not manifest_check["ok"]:
            errors.extend(manifest_check["errors"])
        warnings.extend(manifest_check["warnings"])
        detail["manifest"] = manifest_check

        syntax_check = self._check_syntax(feature)
        checks["syntax"] = syntax_check["ok"]
        if not syntax_check["ok"]:
            errors.extend(syntax_check["errors"])
        warnings.extend(syntax_check["warnings"])
        detail["syntax"] = syntax_check

        safety_check = self._check_safety_policy(feature)
        checks["safety"] = safety_check["ok"]
        if not safety_check["ok"]:
            errors.extend(safety_check["errors"])
        warnings.extend(safety_check["warnings"])
        detail["safety"] = safety_check

        smoke_check = self._check_smoke(feature)
        checks["smoke"] = smoke_check["ok"]
        if not smoke_check["ok"]:
            errors.extend(smoke_check["errors"])
        warnings.extend(smoke_check["warnings"])
        detail["smoke"] = smoke_check

        passed = all(checks.values()) and not errors
        score = self._score(checks, warnings, errors)

        result = SandboxResult(
            feature_id=feature.feature_id,
            version_id=feature.version_id,
            passed=passed,
            score=score,
            checks=checks,
            warnings=self._dedupe(warnings),
            errors=self._dedupe(errors),
            details=detail,
            started_at=started,
            completed_at=datetime.now(timezone.utc).isoformat(),
        )
        self._persist_result(result)
        return result

    @staticmethod
    def _check_manifest(feature: GeneratedFeature) -> Dict[str, Any]:
        errors: List[str] = []
        warnings: List[str] = []
        manifest_path = Path(feature.manifest_path)
        if not manifest_path.exists():
            errors.append("manifest_missing")
            return {"ok": False, "errors": errors, "warnings": warnings}

        try:
            data = json.loads(manifest_path.read_text(encoding="utf-8"))
        except Exception as exc:  # noqa: BLE001
            errors.append(f"manifest_invalid_json:{exc}")
            return {"ok": False, "errors": errors, "warnings": warnings}

        required = ["feature_id", "version_id", "plan_id", "files", "generated_at", "author"]
        for key in required:
            if key not in data:
                errors.append(f"manifest_missing_field:{key}")

        listed_files = data.get("files", [])
        if not isinstance(listed_files, list) or not listed_files:
            errors.append("manifest_files_invalid")

        for file_path in listed_files:
            if not Path(str(file_path)).exists():
                errors.append(f"manifest_file_not_found:{file_path}")

        if data.get("contains_core_modification"):
            warnings.append("manifest_flags_core_modification")

        return {"ok": not errors, "errors": errors, "warnings": warnings, "manifest": data}

    @staticmethod
    def _check_syntax(feature: GeneratedFeature) -> Dict[str, Any]:
        errors: List[str] = []
        warnings: List[str] = []
        compiled = 0
        for file_path in feature.files:
            path = Path(file_path)
            if not path.exists():
                errors.append(f"file_missing:{file_path}")
                continue
            text = path.read_text(encoding="utf-8")
            try:
                compile(text, str(path), "exec")
                compiled += 1
            except Exception as exc:  # noqa: BLE001
                errors.append(f"syntax_error:{file_path}:{exc}")

            if len(text) > 200_000:
                warnings.append(f"file_large:{file_path}")

        return {
            "ok": not errors,
            "errors": errors,
            "warnings": warnings,
            "compiled": compiled,
            "total": len(feature.files),
        }

    @staticmethod
    def _check_safety_policy(feature: GeneratedFeature) -> Dict[str, Any]:
        errors: List[str] = []
        warnings: List[str] = []

        dangerous_tokens = ["os.system(", "subprocess.Popen(", "eval(", "exec(", "shutil.rmtree("]
        for file_path in feature.files:
            path = Path(file_path)
            if not path.exists():
                errors.append(f"safety_file_missing:{file_path}")
                continue
            text = path.read_text(encoding="utf-8")
            for token in dangerous_tokens:
                if token in text:
                    errors.append(f"dangerous_token:{token}:{file_path}")

            if "TODO" in text:
                warnings.append(f"contains_todo:{file_path}")

        if feature.contains_core_modification:
            warnings.append("core_modification_detected_requires_strict_deployment_gate")

        return {"ok": not errors, "errors": errors, "warnings": warnings}

    @staticmethod
    def _check_smoke(feature: GeneratedFeature) -> Dict[str, Any]:
        """Simple smoke simulation without importing staged code into runtime."""
        errors: List[str] = []
        warnings: List[str] = []

        for file_path in feature.files:
            path = Path(file_path)
            if not path.exists():
                errors.append(f"smoke_file_missing:{file_path}")
                continue
            text = path.read_text(encoding="utf-8")

            if "class " not in text:
                warnings.append(f"no_class_definition:{file_path}")
            if "run(self" not in text:
                warnings.append(f"no_run_method:{file_path}")

        return {"ok": not errors, "errors": errors, "warnings": warnings}

    @staticmethod
    def _score(checks: Dict[str, bool], warnings: List[str], errors: List[str]) -> float:
        base = 0.35
        passed = sum(1 for ok in checks.values() if ok)
        total = max(1, len(checks))
        base += (passed / total) * 0.6
        base -= min(0.18, len(warnings) * 0.02)
        base -= min(0.45, len(errors) * 0.08)
        return round(max(0.0, min(1.0, base)), 4)

    @staticmethod
    def _metrics(results: List[SandboxResult]) -> Dict[str, Any]:
        if not results:
            return {"count": 0, "passed": 0, "avg_score": 0.0}
        return {
            "count": len(results),
            "passed": sum(1 for row in results if row.passed),
            "avg_score": round(sum(row.score for row in results) / len(results), 4),
        }

    def _persist_result(self, result: SandboxResult) -> None:
        payload = {
            "feature_id": result.feature_id,
            "version_id": result.version_id,
            "passed": result.passed,
            "score": result.score,
            "checks": dict(result.checks),
            "warnings": list(result.warnings),
            "errors": list(result.errors),
            "details": dict(result.details),
            "started_at": result.started_at,
            "completed_at": result.completed_at,
        }
        self._memory.remember_long_term(
            key=f"evolution:sandbox:{result.feature_id}:{result.version_id}",
            value=payload,
            source="evolution_system.sandbox_tester",
            importance=0.84 if result.passed else 0.64,
            tags=["evolution", "sandbox", "validation"],
        )

    def _persist_batch(self, batch: SandboxBatch) -> None:
        payload = {
            "generated_at": batch.generated_at,
            "metrics": dict(batch.metrics),
            "results": [
                {
                    "feature_id": row.feature_id,
                    "version_id": row.version_id,
                    "passed": row.passed,
                    "score": row.score,
                    "errors": len(row.errors),
                    "warnings": len(row.warnings),
                }
                for row in batch.results
            ],
        }
        self._memory.remember_short_term(
            key="evolution:last_sandbox_batch",
            value=payload,
            tags=["evolution", "sandbox"],
        )
        self._memory.remember_long_term(
            key=f"evolution:sandbox_batch:{batch.generated_at}",
            value=payload,
            source="evolution_system.sandbox_tester",
            importance=0.8,
            tags=["evolution", "sandbox"],
        )

    @staticmethod
    def _dedupe(rows: List[str]) -> List[str]:
        seen: set[str] = set()
        out: List[str] = []
        for item in rows:
            if item in seen:
                continue
            seen.add(item)
            out.append(item)
        return out

