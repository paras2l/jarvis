# Cross-Platform App Launch Implementation Plan

## Objective
Build a permission-aware, audit-friendly, cross-platform system that can open apps using the best available method per device.

## Scope Delivered in This Iteration
- Platform launch architecture in code (launcher orchestration, strategy fallback, permissions, audit logs).
- Windows desktop implementation via Electron native bridge and assistive UI automation.
- Cross-platform adapter structure for web/mobile fallbacks.
- Standardized launch reason codes for provider outcomes and audit diagnostics.
- iOS Capacitor provider scaffold integrated into orchestrator.

## Architecture
1. Per-platform native launcher module
- Implemented through provider interfaces and strategy routing in `src/core/platform/launch-orchestrator.ts`.
- Windows native provider: `src/core/platform/providers/windows-electron-provider.ts`.
- Web/mobile fallback provider: `src/core/platform/providers/web-fallback-provider.ts`.

2. Per-platform automation adapter (permission-gated)
- Permission model: `src/core/platform/permission-center.ts`.
- UI automation strategy included only when explicitly enabled.
- Windows assistive automation wired through Electron IPC.

3. Installed-app indexer per device/user
- App profile/index module: `src/core/platform/app-indexer.ts`.
- Supports known apps and dynamic fallback for unknown app names.

4. Capability check before action
- Capability + strategy ordering: `src/core/platform/capability-checker.ts`.
- Order includes UI automation, native launch, package/deep link, then web fallback.

5. Permission center and audit log
- Permission state persisted in local storage.
- Audit entries persisted with strategy/success/failure in `src/core/platform/audit-log.ts`.

## Platform Roadmap
### Windows
- Current: native launch + assistive Start-menu automation + deep-link fallback.
- Next:
  - Enumerate installed apps from Start Menu/App Paths/registry.
  - Add UAC-aware elevated action workflow.

### macOS
- Next:
  - Native launcher via `open -a` and app bundle detection.
  - UI automation via AppleScript/Accessibility with explicit user consent.

### Linux
- Next:
  - Native launcher via `xdg-open`, desktop entries, and app command lookup.
  - Optional UI automation adapter via xdotool/Wayland-compatible alternatives.

### Android
- Next:
  - Capacitor plugin to launch by package name.
  - Accessibility Service adapter for UI interaction with explicit permissions.

### iOS
- Next:
  - App Intents/Shortcuts and URL-scheme-based launches.
  - Note: full cross-app UI automation is restricted by iOS policy.

## Risk and Limitation Notes
- "Open any app" is best-effort and constrained by OS policy, app installation, permission grants, and enterprise controls.
- Some actions require elevated privileges or user prompts.

## Validation Checklist
- [x] Strategy fallback order implemented.
- [x] Permission-gated automation path implemented.
- [x] Audit log writes on every strategy attempt.
- [x] Task executor migrated to orchestrator.
- [x] Reason-code diagnostics added to launch outcomes and audit entries.
- [x] iOS provider scaffold wired to runtime bridge checks.
- [ ] Native adapters fully completed for macOS/Linux/Android/iOS.
- [ ] Installed-app discovery expanded per platform.

## Next Immediate Build Steps
1. Finish iOS native integration details
- Add production Capacitor iOS AppLauncher plugin config validation.
- Add allow-list driven scheme checks and denial reason mapping.

2. Expand app index coverage
- Add per-platform app registry entries for top requested apps.
- Add app-not-installed/store-fallback reason mapping.

3. Conformance tests
- Add launch tests for each strategy and platform reason code expectations.
