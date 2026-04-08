"""Deployment controller for Evolution System.

Deployment policy:
- validation required before deployment
- core modifications must pass sandbox checks first
- rollback snapshot required for every deployment
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from shutil import copy2
from typing import Any, Dict, List

from jarvis.evolution_system.feature_generator import GeneratedFeature
from jarvis.evolution_system.feature_registry import FeatureRegistry
from jarvis.evolution_system.sandbox_tester import SandboxResult
from jarvis.memory.memory_system import MemorySystem


@dataclass(slots=True)
class RollbackRecord:
    rollback_id: str
    feature_id: str
    from_version: str
    to_version: str
    backup_files: List[Dict[str, str]] = field(default_factory=list)
    created_at: str = ""
    reason: str = ""
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class DeploymentResult:
    feature_id: str
    version_id: str
    deployed: bool
    reason: str
    changed_files: List[str] = field(default_factory=list)
    rollback: RollbackRecord | None = None
    metadata: Dict[str, Any] = field(default_factory=dict)


class DeploymentController:
    """Approve and deploy validated evolution features with rollback support."""

    def __init__(
        self,
        memory: MemorySystem,
        registry: FeatureRegistry,
        workspace_root: str = ".",
        rollback_root: str = "python/.jarvis_runtime/evolution_rollbacks",
    ) -> None:
        self._memory = memory
        self._registry = registry
        self._workspace_root = Path(workspace_root).resolve()
        self._rollback_root = Path(rollback_root)
        self._rollback_root.mkdir(parents=True, exist_ok=True)

    def deploy(
        self,
        feature: GeneratedFeature,
        sandbox: SandboxResult,
        *,
        operator: str = "jarvis_evolution",
        validation_approved: bool = True,
        environment: str = "production",
    ) -> DeploymentResult:
        if not sandbox.passed:
            return self._reject(feature, "sandbox_failed")
        if not validation_approved:
            return self._reject(feature, "validation_not_approved")

        # Safety requirement: core modifications cannot bypass strict sandbox pass.
        if feature.contains_core_modification and sandbox.score < 0.92:
            return self._reject(feature, "core_modification_requires_higher_sandbox_score")

        backup = self._prepare_rollback_snapshot(feature, operator=operator)
        changed_files: List[str] = []

        try:
            changed_files = self._apply_feature_files(feature)
            self._registry.mark_deployment(
                feature.feature_id,
                deployed=True,
                environment=environment,
                operator=operator,
                notes="deployment_success",
                rollback_version=backup.to_version,
            )
            result = DeploymentResult(
                feature_id=feature.feature_id,
                version_id=feature.version_id,
                deployed=True,
                reason="ok",
                changed_files=changed_files,
                rollback=backup,
                metadata={"environment": environment, "operator": operator},
            )
            self._persist(result)
            return result
        except Exception as exc:  # noqa: BLE001
            self.rollback(backup, operator=operator, reason=f"post_deploy_failure:{exc}")
            result = DeploymentResult(
                feature_id=feature.feature_id,
                version_id=feature.version_id,
                deployed=False,
                reason=f"deployment_error:{type(exc).__name__}:{exc}",
                changed_files=changed_files,
                rollback=backup,
                metadata={"environment": environment, "operator": operator},
            )
            self._registry.mark_deployment(
                feature.feature_id,
                deployed=False,
                environment=environment,
                operator=operator,
                notes=result.reason,
                rollback_version=backup.to_version,
            )
            self._persist(result)
            return result

    def rollback(self, rollback: RollbackRecord, *, operator: str, reason: str) -> bool:
        restored = 0
        for pair in rollback.backup_files:
            source = Path(pair["backup"])  # backup copy
            target = Path(pair["target"])  # production target
            if not source.exists():
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            copy2(str(source), str(target))
            restored += 1

        self._registry.mark_rollback(
            rollback.feature_id,
            to_version=rollback.to_version,
            operator=operator,
            reason=reason,
        )
        self._memory.remember_long_term(
            key=f"evolution:rollback:{rollback.rollback_id}",
            value={
                "rollback_id": rollback.rollback_id,
                "feature_id": rollback.feature_id,
                "from_version": rollback.from_version,
                "to_version": rollback.to_version,
                "restored_files": restored,
                "operator": operator,
                "reason": reason,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            },
            source="evolution_system.deployment_controller",
            importance=0.91,
            tags=["evolution", "rollback", "safety"],
        )
        return restored > 0

    def _prepare_rollback_snapshot(self, feature: GeneratedFeature, *, operator: str) -> RollbackRecord:
        now = datetime.now(timezone.utc)
        rollback_id = f"rb-{int(now.timestamp())}-{abs(hash(feature.feature_id)) % 100000}"
        rollback_dir = self._rollback_root / rollback_id
        rollback_dir.mkdir(parents=True, exist_ok=True)

        backup_pairs: List[Dict[str, str]] = []
        for staged_path in feature.files:
            target = self._target_for_staged_path(staged_path)
            backup_path = rollback_dir / target.as_posix().replace("/", "__")
            if target.exists():
                backup_path.parent.mkdir(parents=True, exist_ok=True)
                copy2(str(target), str(backup_path))
            else:
                backup_path.write_text("", encoding="utf-8")
            backup_pairs.append({"target": str(target), "backup": str(backup_path)})

        current_version = feature.version_id
        existing = self._registry.get(feature.feature_id)
        previous_version = existing.current_version if existing is not None else "none"

        return RollbackRecord(
            rollback_id=rollback_id,
            feature_id=feature.feature_id,
            from_version=current_version,
            to_version=previous_version,
            backup_files=backup_pairs,
            created_at=now.isoformat(),
            reason="pre_deploy_snapshot",
            metadata={"operator": operator},
        )

    def _apply_feature_files(self, feature: GeneratedFeature) -> List[str]:
        changed: List[str] = []
        for staged_path in feature.files:
            source = Path(staged_path)
            if not source.exists():
                raise FileNotFoundError(f"staged_file_missing:{staged_path}")
            target = self._target_for_staged_path(staged_path)
            target.parent.mkdir(parents=True, exist_ok=True)
            copy2(str(source), str(target))
            changed.append(str(target))
        return changed

    def _target_for_staged_path(self, staged_path: str) -> Path:
        path = Path(staged_path).resolve()
        parts = [item for item in path.parts if item not in {"", "/", "\\"}]

        # Staging path layout: .../evolution_staging/<feature>/<version>/<relative_target>
        if "evolution_staging" not in parts:
            raise ValueError(f"invalid_staged_path:{staged_path}")
        idx = parts.index("evolution_staging")
        relative = Path(*parts[idx + 3 :])
        return (self._workspace_root / "python" / "jarvis" / relative).resolve()

    def _reject(self, feature: GeneratedFeature, reason: str) -> DeploymentResult:
        result = DeploymentResult(
            feature_id=feature.feature_id,
            version_id=feature.version_id,
            deployed=False,
            reason=reason,
            changed_files=[],
            rollback=None,
            metadata={"rejected_at": datetime.now(timezone.utc).isoformat()},
        )
        self._persist(result)
        return result

    def _persist(self, result: DeploymentResult) -> None:
        payload = {
            "feature_id": result.feature_id,
            "version_id": result.version_id,
            "deployed": result.deployed,
            "reason": result.reason,
            "changed_files": list(result.changed_files),
            "rollback": None
            if result.rollback is None
            else {
                "rollback_id": result.rollback.rollback_id,
                "from_version": result.rollback.from_version,
                "to_version": result.rollback.to_version,
                "created_at": result.rollback.created_at,
            },
            "metadata": dict(result.metadata),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        self._memory.remember_short_term(
            key="evolution:last_deployment_result",
            value=payload,
            tags=["evolution", "deployment"],
        )
        self._memory.remember_long_term(
            key=f"evolution:deployment:{result.feature_id}:{result.version_id}",
            value=payload,
            source="evolution_system.deployment_controller",
            importance=0.9 if result.deployed else 0.7,
            tags=["evolution", "deployment"],
        )
