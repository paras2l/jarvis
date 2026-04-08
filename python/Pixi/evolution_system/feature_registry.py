"""Feature registry for Pixi Evolution System.

Tracks capabilities, versions, lifecycle state, and deployment lineage.
This registry is the source of truth for what is available in production
and what can be rolled back safely.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from threading import RLock
from typing import Any, Dict, Iterable, List

from Pixi.memory.memory_system import MemorySystem


@dataclass(slots=True)
class FeatureVersion:
    version_id: str
    created_at: str
    checksum: str
    author: str
    notes: str
    files: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class FeatureRecord:
    feature_id: str
    name: str
    capability_area: str
    status: str
    current_version: str
    rollback_version: str | None = None
    tags: List[str] = field(default_factory=list)
    versions: List[FeatureVersion] = field(default_factory=list)
    deployment_history: List[Dict[str, Any]] = field(default_factory=list)
    safety: Dict[str, Any] = field(default_factory=dict)
    metadata: Dict[str, Any] = field(default_factory=dict)


class FeatureRegistry:
    """Central registry of generated and deployed system features."""

    def __init__(self, memory: MemorySystem) -> None:
        self._memory = memory
        self._lock = RLock()
        self._records: Dict[str, FeatureRecord] = {}
        self._load_from_memory()

    def register_feature(
        self,
        *,
        feature_id: str,
        name: str,
        capability_area: str,
        version_id: str,
        checksum: str,
        author: str,
        notes: str,
        files: Iterable[str],
        tags: Iterable[str] | None = None,
        metadata: Dict[str, Any] | None = None,
    ) -> FeatureRecord:
        now = datetime.now(timezone.utc).isoformat()
        version = FeatureVersion(
            version_id=version_id,
            created_at=now,
            checksum=checksum,
            author=author,
            notes=notes,
            files=list(files),
            metadata=dict(metadata or {}),
        )

        with self._lock:
            existing = self._records.get(feature_id)
            if existing is None:
                record = FeatureRecord(
                    feature_id=feature_id,
                    name=name,
                    capability_area=capability_area,
                    status="draft",
                    current_version=version.version_id,
                    tags=self._merge_tags(tags or []),
                    versions=[version],
                    safety={
                        "sandbox_tested": False,
                        "validated": False,
                        "deployment_approved": False,
                    },
                    metadata=dict(metadata or {}),
                )
                self._records[feature_id] = record
            else:
                existing.rollback_version = existing.current_version
                existing.current_version = version.version_id
                existing.versions.append(version)
                existing.tags = self._merge_tags(list(existing.tags) + list(tags or []))
                existing.metadata.update(dict(metadata or {}))
                record = existing

        self._persist_record(record)
        return record

    def mark_sandbox_result(self, feature_id: str, *, passed: bool, summary: str, details: Dict[str, Any] | None = None) -> bool:
        with self._lock:
            record = self._records.get(feature_id)
            if record is None:
                return False
            record.safety["sandbox_tested"] = True
            record.safety["sandbox_passed"] = bool(passed)
            record.safety["last_sandbox_summary"] = summary
            record.safety["last_sandbox_at"] = datetime.now(timezone.utc).isoformat()
            if details:
                record.safety["sandbox_details"] = dict(details)
            if passed:
                record.status = "validated"
        self._persist_record(record)
        return True

    def mark_validation(self, feature_id: str, *, approved: bool, validator: str, notes: str = "") -> bool:
        with self._lock:
            record = self._records.get(feature_id)
            if record is None:
                return False
            record.safety["validated"] = bool(approved)
            record.safety["validated_by"] = validator
            record.safety["validated_at"] = datetime.now(timezone.utc).isoformat()
            record.safety["validation_notes"] = notes
            if approved and record.safety.get("sandbox_passed", False):
                record.status = "approved"
            elif not approved:
                record.status = "rejected"
        self._persist_record(record)
        return True

    def mark_deployment(
        self,
        feature_id: str,
        *,
        deployed: bool,
        environment: str,
        operator: str,
        notes: str = "",
        rollback_version: str | None = None,
    ) -> bool:
        with self._lock:
            record = self._records.get(feature_id)
            if record is None:
                return False

            event = {
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "deployed": bool(deployed),
                "environment": environment,
                "operator": operator,
                "version": record.current_version,
                "rollback_version": rollback_version or record.rollback_version,
                "notes": notes,
            }
            record.deployment_history.append(event)
            record.rollback_version = rollback_version or record.rollback_version
            record.safety["deployment_approved"] = bool(deployed)
            record.safety["last_deployment"] = event
            record.status = "deployed" if deployed else "deployment_failed"

        self._persist_record(record)
        return True

    def mark_rollback(self, feature_id: str, *, to_version: str, operator: str, reason: str) -> bool:
        with self._lock:
            record = self._records.get(feature_id)
            if record is None:
                return False
            current = record.current_version
            record.current_version = to_version
            record.rollback_version = current
            record.status = "rolled_back"
            record.deployment_history.append(
                {
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "event": "rollback",
                    "from": current,
                    "to": to_version,
                    "operator": operator,
                    "reason": reason,
                }
            )
        self._persist_record(record)
        return True

    def get(self, feature_id: str) -> FeatureRecord | None:
        with self._lock:
            return self._records.get(feature_id)

    def list_features(self, *, status: str | None = None, capability_area: str | None = None, limit: int = 200) -> List[FeatureRecord]:
        with self._lock:
            rows = list(self._records.values())

        if status is not None:
            rows = [row for row in rows if row.status == status]
        if capability_area is not None:
            rows = [row for row in rows if row.capability_area == capability_area]

        rows.sort(key=lambda row: row.feature_id)
        return rows[: max(1, int(limit))]

    def get_deployable_candidates(self, *, limit: int = 40) -> List[FeatureRecord]:
        rows = self.list_features(limit=max(1, limit * 4))
        out = [
            row
            for row in rows
            if row.safety.get("sandbox_tested")
            and row.safety.get("sandbox_passed")
            and row.safety.get("validated")
            and row.status in {"approved", "validated"}
        ]
        return out[: max(1, limit)]

    def summarize(self) -> Dict[str, Any]:
        rows = self.list_features(limit=5000)
        status_counts: Dict[str, int] = {}
        for row in rows:
            status_counts[row.status] = status_counts.get(row.status, 0) + 1

        return {
            "total": len(rows),
            "status_counts": status_counts,
            "deployable": len(self.get_deployable_candidates(limit=5000)),
            "last_updated": datetime.now(timezone.utc).isoformat(),
        }

    def _persist_record(self, record: FeatureRecord) -> None:
        payload = {
            "feature_id": record.feature_id,
            "name": record.name,
            "capability_area": record.capability_area,
            "status": record.status,
            "current_version": record.current_version,
            "rollback_version": record.rollback_version,
            "tags": list(record.tags),
            "safety": dict(record.safety),
            "versions": [
                {
                    "version_id": row.version_id,
                    "created_at": row.created_at,
                    "checksum": row.checksum,
                    "author": row.author,
                    "notes": row.notes,
                    "files": list(row.files),
                    "metadata": dict(row.metadata),
                }
                for row in record.versions
            ],
            "deployment_history": list(record.deployment_history),
            "metadata": dict(record.metadata),
        }
        self._memory.remember_long_term(
            key=f"evolution:feature:{record.feature_id}",
            value=payload,
            source="evolution_system.feature_registry",
            importance=0.88,
            tags=["evolution", "feature_registry", record.capability_area],
        )
        self._memory.remember_short_term(
            key="evolution:last_feature_registry_update",
            value={"feature_id": record.feature_id, "status": record.status, "version": record.current_version},
            tags=["evolution", "feature_registry"],
        )

    def _load_from_memory(self) -> None:
        records = self._memory.long_term.find_by_tags(["evolution", "feature_registry"], limit=2000)
        for item in records:
            value = dict(item.value)
            feature_id = str(value.get("feature_id", "")).strip()
            if not feature_id:
                continue

            versions: List[FeatureVersion] = []
            for row in value.get("versions", []):
                if not isinstance(row, dict):
                    continue
                versions.append(
                    FeatureVersion(
                        version_id=str(row.get("version_id", "")),
                        created_at=str(row.get("created_at", "")),
                        checksum=str(row.get("checksum", "")),
                        author=str(row.get("author", "unknown")),
                        notes=str(row.get("notes", "")),
                        files=[str(path) for path in row.get("files", [])],
                        metadata=dict(row.get("metadata", {})),
                    )
                )

            self._records[feature_id] = FeatureRecord(
                feature_id=feature_id,
                name=str(value.get("name", feature_id)),
                capability_area=str(value.get("capability_area", "general")),
                status=str(value.get("status", "draft")),
                current_version=str(value.get("current_version", "v0")),
                rollback_version=value.get("rollback_version"),
                tags=[str(tag) for tag in value.get("tags", [])],
                versions=versions,
                deployment_history=list(value.get("deployment_history", [])),
                safety=dict(value.get("safety", {})),
                metadata=dict(value.get("metadata", {})),
            )

    @staticmethod
    def _merge_tags(tags: Iterable[str]) -> List[str]:
        out: List[str] = []
        seen: set[str] = set()
        for item in tags:
            normalized = str(item).strip().lower().replace(" ", "_")
            if not normalized or normalized in seen:
                continue
            seen.add(normalized)
            out.append(normalized)
        return out

