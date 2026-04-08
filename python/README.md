# Jarvis Python Runtime Scaffold

This folder contains a clean-architecture Python scaffold for Jarvis.

## Structure

- `jarvis/core/context`: Context Engine
- `jarvis/core/planner`: Planner Engine
- `jarvis/core/orchestrator`: Agent Orchestrator
- `jarvis/skills`: Skill Registry
- `jarvis/memory`: Memory System
- `jarvis/runtime`: Runtime composition root
- `jarvis/main.py`: Executable entrypoint

## Quick Start

From repo root:

```powershell
cd python
python -m jarvis.main "Plan and summarize a learning session"
```

## Design Notes

- Core logic depends on interfaces in `jarvis/core/contracts.py`.
- Infrastructure adapters (`memory`, `skills`) can be replaced without changing orchestration flow.
- Runtime wiring is centralized in `jarvis/runtime/app_runtime.py` for scalability.
