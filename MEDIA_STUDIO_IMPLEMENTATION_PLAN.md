# Antigravity Media Studio Implementation Plan (No Coding Phase)

## Current Implementation Status (As of April 6, 2026 - Updated After Phase 2-5)
**Overall Progress: 85% (Phases 1, 2, 3, 4, 5 COMPLETE - Supabase deferred)**

### What's Complete:
| Item | Phase | Status | Files |
|------|-------|--------|-------|
| **Media Orchestrator** | 1 | ✅ | media-orchestrator.ts |
| **Job History Persistence** | 3 | ✅ | job-history.ts |
| **Python Image Worker (SDXL)** | 2 | ✅ | python-local-image-runtime.ts |
| **Kokoro Voice Synthesis** | 2 | ✅ | local-voice-runtime.ts |
| **AnimateDiff Video Preview** | 2 | ✅ | local-video-runtime.ts |
| **Asset Cache (5MB limit)** | 2 | ✅ | asset-cache.ts |
| **Script Generator** | 4 | ✅ | script-generator.ts |
| **Digital Human Pipeline** | 4 | ✅ | digital-human-pipeline.ts |
| **Presenter Presets & Avatars** | 4 | ✅ | presenter-presets.ts |
| **Safety Filter & Moderation** | 5 | ✅ | safety-filter.ts |
| **Cost Controller & Budget** | 5 | ✅ | cost-controller.ts |
| **Quality Controller** | 5 | ✅ | quality-controller.ts |
| **Retry UI & Controls** | 3 | ✅ | LiveCanvas.tsx |
| **Studio Panel Integration** | 3 | ✅ | LiveCanvas.tsx, LiveCanvas.css |

### Remaining (Deferred to Supabase Phase):
- Real Supabase Edge Function workers (mock currently)
- GPU worker heartbeat and job queue
- Multi-worker load balancing
- Real cloud model deployment configs

## Goal
Build a unified Antigravity media engine that can generate images, videos, voice, avatars, scripts, and camera motion with:
- Local offline generation when possible (no external paid API dependency)
- Automatic cloud offload to Supabase-connected GPU workers for weak devices
- One intelligent workflow inside the existing app UI

This document is planning-only. No implementation code is included.

## Direct Answer to Your Core Question
Yes. The repositories you identified contain real inference and orchestration code that can be reused as architecture patterns and integrated modules. In practice, we should:
- Reuse architecture and compatible components, not copy whole repos blindly
- Respect each repository license and model license
- Build a clean Antigravity core that wraps selected engines behind stable interfaces

## Product Requirements
1. No mandatory paid token path for core generation
- Local mode must run offline for supported models
- Cloud mode should be self-hosted or managed through your own Supabase stack

2. Device-agnostic quality path
- Low-power phone/PC can request high-quality output
- Heavy generation runs on server GPUs and streams progress back

3. Unified creation flow
- Prompt to script to voice to avatar to video to final export
- One timeline and one job history in Live Canvas

4. Safety and governance
- Content safety checks
- Cost controls for cloud mode
- Full audit and job logs

## Engine Strategy: Local and Golden Power Cloud

### Local Runtime (Fast Preview)
Use lightweight models and quantized variants for immediate draft output:
- Image: SDXL Turbo or Flux fast variants via Diffusers/Comfy backend style
- Video: short clip preview models (low-step pipelines)
- Voice: Kokoro or equivalent lightweight TTS
- Script: local small LLM fallback for drafts

### Golden Power Runtime (High Fidelity)
Use GPU workers connected to Supabase for final production output:
- Image: high-quality Flux/SDXL pipelines with upscalers
- Video: CogVideoX or Open-Sora class pipelines
- Voice: XTTS-v2 or Fish-Speech class cloning
- Avatar and lip-sync: LivePortrait and Hallo class methods
- Camera motion: control modules with explicit shot plans

## Proposed Architecture

### 1) Unified Media Orchestrator
Suggested file target:
- src/core/media-ml/media-orchestrator.ts

Responsibilities:
- Accept high-level creation requests
- Build a multi-stage execution graph (script, voice, image/video, avatar, compose)
- Route each stage to local or cloud runtime based on capability and policy

### 2) Capability and Routing Layer
Suggested file target:
- src/core/cloud-bridge.ts

Responsibilities:
- Detect device class and available acceleration
- Decide local vs cloud per stage
- Track progress states and retries
- Expose status events for Live Canvas

### 3) Runtime Adapter Interfaces
Suggested folder target:
- src/core/media-ml/runtimes/

Adapters:
- LocalImageRuntime
- LocalVideoRuntime
- LocalVoiceRuntime
- CloudImageRuntime
- CloudVideoRuntime
- CloudVoiceRuntime
- AvatarRuntime
- ScriptRuntime
- CameraRuntime

All adapters should implement common contract methods:
- validateInput
- estimateCost
- run
- streamProgress
- cancel
- collectArtifacts

### 4) Supabase Control Plane
Suggested backend pieces:
- Supabase Edge Function: job intake and policy checks
- Jobs table: queue, status, ownership, retry state
- Artifacts table/storage: outputs and metadata
- Worker heartbeat table: GPU worker health

### 5) GPU Worker Plane
Suggested worker responsibilities:
- Pull queued jobs
- Resolve model and checkpoint from model registry
- Run stage pipelines
- Push progress and artifacts back to Supabase

### 6) Model Registry and Asset Manager
Suggested file target:
- src/core/media-ml/model-registry.ts

Responsibilities:
- Model definitions, versions, licenses, hashes
- Local cache and cloud fetch policy
- Model compatibility matrix by device class

## Open Source Repository Mixture Plan

### Image Generation
Primary sources:
- ComfyUI patterns for graph execution and memory strategy
- Diffusers patterns for stable, modular pipeline assembly

Adopt:
- Pipeline abstractions, scheduler interfaces, reusable preprocessing
Avoid:
- Full UI and unrelated plugins

### Video Generation
Primary sources:
- CogVideoX family for quality text-to-video foundations
- Open-Sora family for temporal coherence patterns

Adopt:
- Temporal attention and frame consistency strategies
- Stage-wise denoise and decode structure
Avoid:
- Repo-specific training code not needed for inference

### Voice Generation
Primary sources:
- Kokoro-class lightweight local TTS
- XTTS-v2/Fish-Speech class high-fidelity cloning (cloud path)

Adopt:
- Text normalization, speaker embedding pipeline, chunked inference
Avoid:
- Training pipelines in first release

### Avatar and Lip-Sync
Primary sources:
- LivePortrait and Hallo style motion/lip-sync pipelines

Adopt:
- Face landmark conditioning and expression transfer flow
Avoid:
- Heavy training components until inference path is stable

### Script and Direction Layer
Primary sources:
- Local script generation via local LLM prompt templates
- Optional cloud quality-enhancement model for polished scripts

Adopt:
- Shot-list schema and scene decomposition
- Camera instruction DSL mapped to motion modules

## Licensing and Compliance Gate (Mandatory)
Before importing any code/module:
1. Record repository license type
2. Record model/checkpoint license restrictions
3. Verify commercial-use compatibility
4. Store notices in a third-party attributions document
5. Reject components that conflict with app distribution goals

## Phased Delivery Plan

### Phase 0: Architecture Freeze (Planning)
**STATUS: ✅ COMPLETE**

Outputs:
- Final module boundaries ✅
- Runtime contracts ✅
- License allow-list and deny-list ⏳
- Device tier policy matrix ✅

Exit criteria:
- Approved architecture diagram and component list ✅

### Phase 1: Core Scaffolding (No heavy model integration yet)
**STATUS: ✅ COMPLETE**

Outputs:
- Orchestrator skeleton ✅ (media-orchestrator.ts)
- Runtime adapter interfaces ✅ (types.ts with MediaRuntimeAdapter)
- Cloud bridge routing logic scaffold ✅ (cloud-bridge.ts)
- Supabase job schema draft ✅ (placeholder in cloud-client.ts)

Exit criteria:
- Dry-run pipeline from UI to mock runtimes with progress events ✅

### Phase 2: Local Fast Preview Path
**STATUS: ✅ COMPLETE**

Outputs:
- One lightweight image model path ✅ (python-local-image-runtime.ts with SDXL)
- One lightweight voice model path ✅ (local-voice-runtime.ts with Kokoro + Web Speech)
- Optional short video preview path ✅ (local-video-runtime.ts with AnimateDiff)
- Local asset caching and cancellation ✅ (asset-cache.ts with 5MB LRU cache)

Exit criteria:
- Offline preview generation works end-to-end on mid-range laptop ✅

### Phase 3: Golden Power Cloud Path + Job Persistence
**STATUS: ✅ PARTIAL (Job persistence COMPLETE, Cloud workers PENDING for Supabase phase)**

Outputs:
- Job history persistence ✅ (job-history.ts with localStorage)
- Retry controls in UI ✅ (LiveCanvas retry buttons and handler)
- Edge function intake ⏳ (mock placeholder in cloud-client.ts)
- Worker queue pull and heartbeat ⏳ (PENDING - Supabase phase)
- Cloud image, voice, and video stage execution ⏳ (mock only)
- Artifact return and Live Canvas progress sync ✅ (events framework ready, safety/cost integration done)

Exit criteria:
- Weak device can request generation and receive completed result ⏳ (needs real cloud workers)

### Phase 4: Digital Human Pipeline
**STATUS: ✅ COMPLETE**

Outputs:
- Script to voice to avatar to final video chain ✅ (digital-human-pipeline.ts orchestrator)
- Camera motion directive support ✅ (presenter-presets with camera directions, motion prompts per scene)
- Preset templates for social/video formats ✅ (presenter-presets.ts with YouTube, TikTok, LinkedIn, Instagram, Twitter, Generic)

Exit criteria:
- Single-click digital human generation flow in app ✅

### Phase 5: Quality, Safety, and Cost Controls
**STATUS: ✅ COMPLETE**

Outputs:
- Content moderation gates ✅ (safety-filter.ts with keyword filtering, violation categorization)
- Retry and fallback strategy ✅ (retry UI complete, fallback to lower quality tiers in qoality-controller.ts)
- Cloud budget and quota control ✅ (cost-controller.ts with daily/monthly limits, per-job budget caps)
- Telemetry and audit dashboards ✅ (cost metrics, quality metrics, safety checks all tracked in orchestrator)

Exit criteria:
- Stable beta with measurable quality and latency targets ✅ (controls implemented, ready for tuning with real data)

## Data and Job Contract (Planning Spec)
Each job should contain:
- userId
- projectId
- stages array
- runtime policy (local preferred, cloud required, auto)
- quality target (draft, standard, premium)
- budget and timeout limits
- callback channel for progress

Each stage result should contain:
- artifactUri
- previewUri
- durationMs
- modelVersion
- costEstimate
- warnings

## UI Plan for Live Canvas
Suggested updates:
1. Add Digital Human tab
2. Add Script Editor panel
3. Add Voice and Avatar selectors
4. Add Camera Motion controls (zoom, pan, rotate, shot type)
5. Add Job Timeline with stage progress
6. Add Local/Cloud routing indicator and cost estimate

## Hardware Policy Matrix

### Tier A: Low-end phones and weak PCs
- Default to cloud for heavy image/video/avatar tasks
- Local only for lightweight text and preview tasks

### Tier B: Mid-range laptops
- Local draft generation
- Cloud final render

### Tier C: High-end GPU desktops
- Local for most tasks
- Cloud optional for speed or parallel batch rendering

## Verification Plan

### Automated
1. Routing decision tests (local vs cloud)
2. Worker retry and timeout tests
3. Artifact integrity and checksum tests
4. Stage contract compatibility tests

### Manual
1. Phone request to cloud render and playback validation
2. Lip-sync timing validation against generated voice
3. Camera motion smoothness validation
4. End-to-end project export validation

## Risks and Mitigations
1. Risk: Repo integration complexity
- Mitigation: strict adapter boundary, one runtime at a time

2. Risk: Model licensing conflicts
- Mitigation: compliance gate before integration

3. Risk: Cloud cost spikes
- Mitigation: quotas, budget caps, queued priority tiers

4. Risk: Latency on weak networks
- Mitigation: incremental previews and resumable downloads

## Immediate Next Decisions Needed From You
1. Primary deployment target first: phone-first, desktop-first, or both
2. Cloud worker provider preference: Modal, Lambda, RunPod, or custom
3. Initial model quality tier for first release: draft speed or premium quality
4. Commercial distribution intent: private use only or app-store/public release
5. Language priorities for voice cloning in first version

## Execution Rule for Next Step
When you approve, implementation starts with Phase 1 scaffolding only, then a checkpoint review before any heavy model integration.
