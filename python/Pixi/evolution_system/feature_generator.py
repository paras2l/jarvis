"""Feature generator for Evolution System.

Generates candidate feature implementations in a staging area.
All output is non-production until sandbox validation and deployment approval.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path
from typing import Any, Dict, Iterable, List
import json

from Pixi.evolution_system.improvement_planner import ImprovementPlan
from Pixi.memory.memory_system import MemorySystem


@dataclass(slots=True)
class GeneratedFeature:
    feature_id: str
    plan_id: str
    feature_name: str
    version_id: str
    files: List[str]
    manifest_path: str
    checksum: str
    contains_core_modification: bool
    status: str
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class GeneratedBundle:
    generated_at: str
    generated: List[GeneratedFeature] = field(default_factory=list)
    skipped: List[Dict[str, Any]] = field(default_factory=list)
    metrics: Dict[str, Any] = field(default_factory=dict)


class FeatureGenerator:
    """Create generated feature artifacts under an isolated staging root."""

    def __init__(self, memory: MemorySystem, staging_root: str = "python/.Pixi_runtime/evolution_staging") -> None:
        self._memory = memory
        self._staging_root = Path(staging_root)
        self._staging_root.mkdir(parents=True, exist_ok=True)

    def generate(self, plans: Iterable[ImprovementPlan], *, author: str = "Pixi_evolution") -> GeneratedBundle:
        timestamp = datetime.now(timezone.utc).isoformat()
        out: List[GeneratedFeature] = []
        skipped: List[Dict[str, Any]] = []

        for plan in plans:
            try:
                out.append(self._generate_for_plan(plan, author=author))
            except Exception as exc:  # noqa: BLE001
                skipped.append({"plan_id": plan.plan_id, "reason": f"{type(exc).__name__}: {exc}"})

        bundle = GeneratedBundle(
            generated_at=timestamp,
            generated=out,
            skipped=skipped,
            metrics={
                "generated": len(out),
                "skipped": len(skipped),
                "contains_core_modification": sum(1 for row in out if row.contains_core_modification),
            },
        )
        self._persist_bundle(bundle)
        return bundle

    def _generate_for_plan(self, plan: ImprovementPlan, *, author: str) -> GeneratedFeature:
        feature_id = f"feat-{plan.plan_id}"
        version_id = f"v{int(datetime.now(timezone.utc).timestamp())}"
        feature_root = self._staging_root / feature_id / version_id
        feature_root.mkdir(parents=True, exist_ok=True)

        generated_files: List[str] = []
        contains_core_modification = False

        for target in plan.target_files:
            normalized_target = str(target).replace("\\", "/")
            if self._is_core_file(normalized_target):
                contains_core_modification = True

            relative = normalized_target.replace("python/Pixi/", "")
            out_path = feature_root / relative
            out_path.parent.mkdir(parents=True, exist_ok=True)

            content = self._build_feature_module(plan, normalized_target)
            out_path.write_text(content, encoding="utf-8")
            generated_files.append(str(out_path).replace("\\", "/"))

        manifest = {
            "feature_id": feature_id,
            "version_id": version_id,
            "plan_id": plan.plan_id,
            "feature_name": plan.feature_name,
            "objective": plan.objective,
            "priority": plan.priority,
            "risk_level": plan.risk_level,
            "contains_core_modification": contains_core_modification,
            "files": generated_files,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "author": author,
            "steps": [
                {
                    "step_id": step.step_id,
                    "title": step.title,
                    "safety_gate": step.safety_gate,
                    "acceptance_criteria": list(step.acceptance_criteria),
                }
                for step in plan.steps
            ],
        }
        manifest_path = feature_root / "manifest.json"
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=True, indent=2), encoding="utf-8")

        checksum = self._checksum_paths(generated_files + [str(manifest_path).replace("\\", "/")])
        generated = GeneratedFeature(
            feature_id=feature_id,
            plan_id=plan.plan_id,
            feature_name=plan.feature_name,
            version_id=version_id,
            files=generated_files,
            manifest_path=str(manifest_path).replace("\\", "/"),
            checksum=checksum,
            contains_core_modification=contains_core_modification,
            status="staged",
            metadata={
                "risk_level": plan.risk_level,
                "priority": plan.priority,
                "target_files": list(plan.target_files),
            },
        )
        self._persist_feature(generated)
        return generated

    def _build_feature_module(self, plan: ImprovementPlan, target: str) -> str:
        class_name = self._class_name(plan.feature_name)
        tags = ", ".join(repr(item) for item in plan.proposed_tags[:8])
        goal = plan.objective.replace('"', "'")
        return (
            '"""Auto-generated evolution feature module.\n\n'
            "Generated in staging. This file is NOT production-active until\n"
            "sandbox validation and deployment approval are complete.\n"
            '"""\n\n'
            "from __future__ import annotations\n\n"
            "from dataclasses import dataclass, field\n"
            "from datetime import datetime, timezone\n"
            "from typing import Any, Dict, List\n\n\n"
            "@dataclass(slots=True)\n"
            f"class {class_name}Result:\n"
            "    success: bool\n"
            "    summary: str\n"
            "    metrics: Dict[str, Any] = field(default_factory=dict)\n"
            "    outputs: List[str] = field(default_factory=list)\n\n\n"
            f"class {class_name}:\n"
            f"    FEATURE_NAME = \"{plan.feature_name}\"\n"
            f"    OBJECTIVE = \"{goal}\"\n"
            f"    TAGS = [{tags}]\n\n"
            "    def run(self, payload: Dict[str, Any] | None = None) -> " + class_name + "Result:\n"
            "        payload = dict(payload or {})\n"
            "        started = datetime.now(timezone.utc).isoformat()\n"
            "        outputs = []\n"
            "        for key, value in list(payload.items())[:12]:\n"
            "            outputs.append(f\"{key}={value}\")\n"
            "        summary = f\"Executed {self.FEATURE_NAME} with {len(outputs)} payload fields\"\n"
            "        return " + class_name + "Result(\n"
            "            success=True,\n"
            "            summary=summary,\n"
            "            metrics={\n"
            "                \"started_at\": started,\n"
            "                \"payload_size\": len(payload),\n"
            f"                \"target\": \"{target}\",\n"
            "            },\n"
            "            outputs=outputs,\n"
            "        )\n"
        )

    @staticmethod
    def _class_name(feature_name: str) -> str:
        words = [item for item in feature_name.replace("-", "_").split("_") if item]
        return "".join(word.capitalize() for word in words) or "GeneratedFeature"

    @staticmethod
    def _is_core_file(target: str) -> bool:
        core_markers = [
            "python/Pixi/runtime/",
            "python/Pixi/core/",
            "python/Pixi/memory/",
            "python/Pixi/system_bus/",
            "python/Pixi/world_model/",
        ]
        return any(marker in target for marker in core_markers)

    def _checksum_paths(self, paths: List[str]) -> str:
        digest = sha256()
        for path in sorted(paths):
            data = Path(path).read_bytes()
            digest.update(path.encode("utf-8"))
            digest.update(data)
        return digest.hexdigest()

    def _persist_feature(self, item: GeneratedFeature) -> None:
        payload = {
            "feature_id": item.feature_id,
            "plan_id": item.plan_id,
            "feature_name": item.feature_name,
            "version_id": item.version_id,
            "files": list(item.files),
            "manifest_path": item.manifest_path,
            "checksum": item.checksum,
            "contains_core_modification": item.contains_core_modification,
            "status": item.status,
            "metadata": dict(item.metadata),
        }
        self._memory.remember_long_term(
            key=f"evolution:generated_feature:{item.feature_id}:{item.version_id}",
            value=payload,
            source="evolution_system.feature_generator",
            importance=0.72,
            tags=["evolution", "generated", "feature"],
        )

    def _persist_bundle(self, bundle: GeneratedBundle) -> None:
        payload = {
            "generated_at": bundle.generated_at,
            "metrics": dict(bundle.metrics),
            "generated_ids": [f"{row.feature_id}:{row.version_id}" for row in bundle.generated],
            "skipped": list(bundle.skipped),
        }
        self._memory.remember_short_term(
            key="evolution:last_generated_bundle",
            value=payload,
            tags=["evolution", "generation"],
        )
        self._memory.remember_long_term(
            key=f"evolution:generated_bundle:{bundle.generated_at}",
            value=payload,
            source="evolution_system.feature_generator",
            importance=0.7,
            tags=["evolution", "generation"],
        )

