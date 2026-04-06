# 8-Week Workstream Implementation (Applied Now)

This file tracks the immediate implementation scaffold added for all workstreams.

## Week 1: Policy Gateway + Route Inventory + Mandatory Wrapper
- Added policy types and gateway.
- Added route inventory baseline.
- Wired mandatory policy checks into local and remote execution.

Files:
- src/core/policy/types.ts
- src/core/policy/PolicyGateway.ts
- src/core/policy/route-inventory.ts
- src/core/agent-engine.ts

## Week 2: Hardcode Tokenized Decisions + Deny-By-Default
- Added token mint/validate support in Hardcode protocol.
- Updated master codeword to "paro the master".
- Policy gateway supports hardcode token bypass and codeword bypass.

Files:
- src/core/protocols/HardcodeProtocol.ts
- src/core/policy/PolicyGateway.ts

## Week 3: Mutation Manifest + Sandbox + Immutable Boundary Checks
- Added mutation types, manifest registry, sandbox executor, and boundary guard.

Files:
- src/core/mutation/types.ts
- src/core/mutation/manifest-registry.ts
- src/core/mutation/sandbox-executor.ts
- src/core/mutation/boundary-guard.ts

## Week 4: Canary + Rollback + Registry + Quarantine
- Added canary manager, rollback manager, quarantine registry, and orchestration service.

Files:
- src/core/mutation/canary-manager.ts
- src/core/mutation/rollback-manager.ts
- src/core/mutation/quarantine-registry.ts
- src/core/mutation/mutation-service.ts

## Week 5: Memory Tiers + Salience + Long-Term Policies
- Added tiered memory service with salience scoring and tier routing.
- Integrated recording in chat input path.

Files:
- src/core/memory/memory-tier-service.ts
- src/components/ChatInterface.tsx

## Week 6: Persona Loop + Proactive Scheduler + Feedback UI
- Added persona feedback service.
- Added persona loop tuning service.
- Added proactive scheduler.
- Added thumbs-up/thumbs-down feedback controls in UI.

Files:
- src/core/persona/feedback-service.ts
- src/core/persona/persona-loop-service.ts
- src/core/persona/proactive-scheduler.ts
- src/components/ChatInterface.tsx
- src/core/agent-engine.ts

## Week 7: Security + Behavior Test Harness + Red-Team Pass
- Added behavior test suite and red-team harness.

Files:
- src/core/security/behavior-test-suite.ts
- src/core/security/red-team-harness.ts

## Week 8: Staged Rollout + Thresholds + Hardening Baseline
- Added metric thresholds and staged rollout plan.

Files:
- src/core/ops/metric-thresholds.ts
- src/core/ops/rollout-plan.ts

## Notes
- This is a full architecture scaffold and runtime wiring pass.
- Existing business logic remains intact.
- Next step is expanding each scaffold into deeper production behavior and adding dedicated tests per module.
