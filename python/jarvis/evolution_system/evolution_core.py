"""Evolution core coordinator.

Coordinates the self-evolution pipeline:
1) Capability analysis
2) Plan synthesis
3) Feature generation in staging
4) Sandbox validation
5) Controlled deployment with rollback

Safety guarantees:
- no deployment without validation
- no core changes without successful sandbox test
- rollback snapshot prepared before deployment
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from threading import RLock
from typing import Any, Dict, Iterable, List

from jarvis.core.contracts import ContextSnapshot
from jarvis.evolution_system.capability_analyzer import CapabilityAnalyzer, CapabilityReport
from jarvis.evolution_system.deployment_controller import DeploymentController, DeploymentResult
from jarvis.evolution_system.feature_generator import FeatureGenerator, GeneratedBundle
from jarvis.evolution_system.feature_registry import FeatureRegistry
from jarvis.evolution_system.improvement_planner import ImprovementPlanner, PlanBundle
from jarvis.evolution_system.sandbox_tester import SandboxBatch, SandboxResult, SandboxTester
from jarvis.memory.memory_system import MemorySystem
from jarvis.system_bus.bus_core import SystemBus
from jarvis.world_model.world_state import WorldStateModel


@dataclass(slots=True)
class EvolutionPolicy:
    min_minutes_between_cycles: int = 45
    max_cycles_per_day: int = 16
    max_gap_candidates: int = 20
    max_plans_per_cycle: int = 8
    require_validation_for_deploy: bool = True
    allow_core_modifications: bool = True
    min_sandbox_score_for_deploy: float = 0.82
    min_sandbox_score_for_core_mods: float = 0.92


@dataclass(slots=True)
class EvolutionCycleResult:
    cycle_id: str
    started_at: str
    completed_at: str
    triggered: bool
    reason: str
    capability_report: CapabilityReport | None = None
    plan_bundle: PlanBundle | None = None
    generated_bundle: GeneratedBundle | None = None
    sandbox_batch: SandboxBatch | None = None
    deployments: List[DeploymentResult] = field(default_factory=list)
    errors: List[str] = field(default_factory=list)
    notes: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)


class EvolutionCore:
    """Central coordinator for autonomous capability evolution."""

    def __init__(
        self,
        memory: MemorySystem,
        world_model: WorldStateModel,
        *,
        system_bus: SystemBus | None = None,
        policy: EvolutionPolicy | None = None,
        analyzer: CapabilityAnalyzer | None = None,
        planner: ImprovementPlanner | None = None,
        generator: FeatureGenerator | None = None,
        tester: SandboxTester | None = None,
        registry: FeatureRegistry | None = None,
        deployment: DeploymentController | None = None,
    ) -> None:
        self._memory = memory
        self._world_model = world_model
        self._bus = system_bus
        self.policy = policy or EvolutionPolicy()

        self.registry = registry or FeatureRegistry(memory=memory)
        self.analyzer = analyzer or CapabilityAnalyzer(memory=memory, world_model=world_model)
        self.planner = planner or ImprovementPlanner(memory=memory)
        self.generator = generator or FeatureGenerator(memory=memory)
        self.tester = tester or SandboxTester(memory=memory)
        self.deployment = deployment or DeploymentController(memory=memory, registry=self.registry)

        self._lock = RLock()
        self._counter = 0
        self._cycles_today = 0
        self._day_anchor = datetime.now(timezone.utc).date()
        self._last_run: datetime | None = None
        self._paused = False
        self._history: List[EvolutionCycleResult] = []

    def run_cycle(self, *, context: ContextSnapshot, force: bool = False) -> EvolutionCycleResult:
        start = datetime.now(timezone.utc)
        cycle_id = f"evolution-{self._counter + 1}-{int(start.timestamp())}"

        allowed, reason = self._can_run(now=start, force=force)
        if not allowed:
            result = EvolutionCycleResult(
                cycle_id=cycle_id,
                started_at=start.isoformat(),
                completed_at=datetime.now(timezone.utc).isoformat(),
                triggered=False,
                reason=reason,
                notes=["cycle_skipped"],
                metadata={"force": force},
            )
            self._record(result)
            self._publish("evolution.cycle.skipped", {"cycle_id": cycle_id, "reason": reason})
            return result

        self._mark_cycle_started(start)
        self._counter += 1
        self._publish("evolution.cycle.started", {"cycle_id": cycle_id, "force": force})

        errors: List[str] = []
        notes: List[str] = []
        capability_report: CapabilityReport | None = None
        plan_bundle: PlanBundle | None = None
        generated_bundle: GeneratedBundle | None = None
        sandbox_batch: SandboxBatch | None = None
        deployments: List[DeploymentResult] = []

        try:
            self._world_model.refresh(context)
            capability_report = self.analyzer.analyze(max_gaps=self.policy.max_gap_candidates)

            if not capability_report.gaps:
                notes.append("no_capability_gaps")
                result = self._finalize(
                    cycle_id=cycle_id,
                    started=start,
                    reason="no_gaps",
                    capability_report=capability_report,
                    notes=notes,
                    errors=errors,
                    plan_bundle=plan_bundle,
                    generated_bundle=generated_bundle,
                    sandbox_batch=sandbox_batch,
                    deployments=deployments,
                )
                self._publish("evolution.cycle.completed", {"cycle_id": cycle_id, "reason": "no_gaps"})
                return result

            plan_bundle = self.planner.create_plans(
                capability_report.top(self.policy.max_plans_per_cycle),
                max_plans=self.policy.max_plans_per_cycle,
            )
            generated_bundle = self.generator.generate(plan_bundle.plans)

            # Register generated features immediately as draft records.
            for generated in generated_bundle.generated:
                self.registry.register_feature(
                    feature_id=generated.feature_id,
                    name=generated.feature_name,
                    capability_area=self._capability_area_for_plan(plan_bundle, generated.plan_id),
                    version_id=generated.version_id,
                    checksum=generated.checksum,
                    author="evolution_core",
                    notes="generated_in_staging",
                    files=generated.files,
                    tags=["evolution", "generated"],
                    metadata=dict(generated.metadata),
                )

            sandbox_batch = self.tester.test_many(generated_bundle.generated)
            self._apply_sandbox_to_registry(sandbox_batch)

            deployments = self._deploy_validated(generated_bundle, sandbox_batch)
            success = sum(1 for row in deployments if row.deployed)
            notes.append(f"deployments_successful={success}")

            reason_out = "ok" if success > 0 else "validated_but_not_deployed"
            result = self._finalize(
                cycle_id=cycle_id,
                started=start,
                reason=reason_out,
                capability_report=capability_report,
                notes=notes,
                errors=errors,
                plan_bundle=plan_bundle,
                generated_bundle=generated_bundle,
                sandbox_batch=sandbox_batch,
                deployments=deployments,
            )
            self._publish(
                "evolution.cycle.completed",
                {
                    "cycle_id": cycle_id,
                    "reason": reason_out,
                    "gaps": len(capability_report.gaps),
                    "plans": len(plan_bundle.plans),
                    "generated": len(generated_bundle.generated),
                    "deployments": success,
                },
            )
            return result

        except Exception as exc:  # noqa: BLE001
            errors.append(f"{type(exc).__name__}: {exc}")
            result = self._finalize(
                cycle_id=cycle_id,
                started=start,
                reason="error",
                capability_report=capability_report,
                notes=notes,
                errors=errors,
                plan_bundle=plan_bundle,
                generated_bundle=generated_bundle,
                sandbox_batch=sandbox_batch,
                deployments=deployments,
            )
            self._publish("evolution.cycle.failed", {"cycle_id": cycle_id, "error": str(exc)}, severity="error")
            return result

    def maybe_run(self, *, context: ContextSnapshot) -> EvolutionCycleResult:
        return self.run_cycle(context=context, force=False)

    def pause(self) -> None:
        self._paused = True
        self._publish("evolution.paused", {"paused": True})

    def resume(self) -> None:
        self._paused = False
        self._publish("evolution.resumed", {"paused": False})

    def diagnostics(self) -> Dict[str, Any]:
        latest = self._history[-1] if self._history else None
        return {
            "paused": self._paused,
            "counter": self._counter,
            "cycles_today": self._cycles_today,
            "last_run": None if self._last_run is None else self._last_run.isoformat(),
            "policy": {
                "min_minutes_between_cycles": self.policy.min_minutes_between_cycles,
                "max_cycles_per_day": self.policy.max_cycles_per_day,
                "max_gap_candidates": self.policy.max_gap_candidates,
                "max_plans_per_cycle": self.policy.max_plans_per_cycle,
                "require_validation_for_deploy": self.policy.require_validation_for_deploy,
                "allow_core_modifications": self.policy.allow_core_modifications,
                "min_sandbox_score_for_deploy": self.policy.min_sandbox_score_for_deploy,
                "min_sandbox_score_for_core_mods": self.policy.min_sandbox_score_for_core_mods,
            },
            "registry": self.registry.summarize(),
            "latest": None
            if latest is None
            else {
                "cycle_id": latest.cycle_id,
                "triggered": latest.triggered,
                "reason": latest.reason,
                "notes": list(latest.notes),
                "errors": list(latest.errors),
                "deployments": len(latest.deployments),
            },
        }

    def handle_bus_message(self, message: Dict[str, Any]) -> Dict[str, Any]:
        topic = str(message.get("topic", "")).lower()
        payload = dict(message.get("payload", {}))

        if topic in {"evolution.run", "evolution.cycle"}:
            context = payload.get("context")
            if context is None:
                return {"status": "error", "reason": "missing_context"}
            result = self.run_cycle(context=context, force=bool(payload.get("force", False)))
            return {
                "cycle_id": result.cycle_id,
                "triggered": result.triggered,
                "reason": result.reason,
                "deployments": sum(1 for row in result.deployments if row.deployed),
            }

        if topic == "evolution.pause":
            self.pause()
            return {"status": "ok", "paused": True}

        if topic == "evolution.resume":
            self.resume()
            return {"status": "ok", "paused": False}

        if topic == "evolution.diagnostics":
            return self.diagnostics()

        return {"status": "ignored", "topic": topic}

    def _deploy_validated(self, generated: GeneratedBundle, sandbox: SandboxBatch) -> List[DeploymentResult]:
        by_id = {(row.feature_id, row.version_id): row for row in sandbox.results}
        out: List[DeploymentResult] = []

        for feature in generated.generated:
            check = by_id.get((feature.feature_id, feature.version_id))
            if check is None:
                continue

            # Validation gate derived from sandbox + policy requirements.
            approved = check.passed and check.score >= self.policy.min_sandbox_score_for_deploy
            if feature.contains_core_modification and check.score < self.policy.min_sandbox_score_for_core_mods:
                approved = False

            if not self.policy.allow_core_modifications and feature.contains_core_modification:
                approved = False

            self.registry.mark_validation(
                feature.feature_id,
                approved=approved,
                validator="evolution_core",
                notes="policy_gate" if approved else "policy_rejected",
            )

            result = self.deployment.deploy(
                feature,
                check,
                validation_approved=(approved if self.policy.require_validation_for_deploy else True),
                operator="evolution_core",
            )
            out.append(result)

        return out

    def _apply_sandbox_to_registry(self, batch: SandboxBatch) -> None:
        for row in batch.results:
            self.registry.mark_sandbox_result(
                row.feature_id,
                passed=row.passed,
                summary="sandbox_pass" if row.passed else "sandbox_fail",
                details={"score": row.score, "errors": list(row.errors), "warnings": list(row.warnings)},
            )

    @staticmethod
    def _capability_area_for_plan(plan_bundle: PlanBundle, plan_id: str) -> str:
        for row in plan_bundle.plans:
            if row.plan_id == plan_id:
                tags = row.proposed_tags
                if tags:
                    return tags[0]
        return "general"

    def _finalize(
        self,
        *,
        cycle_id: str,
        started: datetime,
        reason: str,
        capability_report: CapabilityReport | None,
        plan_bundle: PlanBundle | None,
        generated_bundle: GeneratedBundle | None,
        sandbox_batch: SandboxBatch | None,
        deployments: List[DeploymentResult],
        errors: List[str],
        notes: List[str],
    ) -> EvolutionCycleResult:
        result = EvolutionCycleResult(
            cycle_id=cycle_id,
            started_at=started.isoformat(),
            completed_at=datetime.now(timezone.utc).isoformat(),
            triggered=True,
            reason=reason,
            capability_report=capability_report,
            plan_bundle=plan_bundle,
            generated_bundle=generated_bundle,
            sandbox_batch=sandbox_batch,
            deployments=deployments,
            errors=list(errors),
            notes=list(notes),
            metadata={
                "gaps": 0 if capability_report is None else len(capability_report.gaps),
                "plans": 0 if plan_bundle is None else len(plan_bundle.plans),
                "generated": 0 if generated_bundle is None else len(generated_bundle.generated),
                "sandbox_passed": 0 if sandbox_batch is None else sum(1 for row in sandbox_batch.results if row.passed),
                "deployed": sum(1 for row in deployments if row.deployed),
            },
        )
        self._record(result)
        return result

    def _record(self, result: EvolutionCycleResult) -> None:
        self._history.append(result)
        if len(self._history) > 240:
            self._history = self._history[-240:]

        payload = {
            "cycle_id": result.cycle_id,
            "started_at": result.started_at,
            "completed_at": result.completed_at,
            "triggered": result.triggered,
            "reason": result.reason,
            "errors": list(result.errors),
            "notes": list(result.notes),
            "metadata": dict(result.metadata),
        }
        self._memory.remember_short_term(
            key="evolution:last_cycle",
            value=payload,
            tags=["evolution", "cycle"],
        )
        self._memory.remember_long_term(
            key=f"evolution:cycle:{result.cycle_id}",
            value=payload,
            source="evolution_system.evolution_core",
            importance=0.86,
            tags=["evolution", "cycle"],
        )

    def _can_run(self, *, now: datetime, force: bool) -> tuple[bool, str]:
        if self._paused and not force:
            return False, "paused"

        with self._lock:
            if now.date() != self._day_anchor:
                self._day_anchor = now.date()
                self._cycles_today = 0

            if not force:
                if self._cycles_today >= self.policy.max_cycles_per_day:
                    return False, "daily_limit"
                if self._last_run is not None:
                    if now - self._last_run < timedelta(minutes=self.policy.min_minutes_between_cycles):
                        return False, "frequency_limit"

        return True, "scheduled"

    def _mark_cycle_started(self, now: datetime) -> None:
        with self._lock:
            self._last_run = now
            self._cycles_today += 1

    def _publish(self, event_type: str, payload: Dict[str, Any], *, severity: str = "info") -> None:
        if self._bus is None:
            return
        self._bus.publish_event(
            event_type=event_type,
            source="evolution_system",
            payload=payload,
            topic=event_type,
            severity=severity,
            tags=["evolution", "system_bus"],
        )
