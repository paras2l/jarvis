# Pixi Python Runtime Scaffold

This folder contains a clean-architecture Python scaffold for Pixi.

## Structure

- `Pixi/core/context`: Context Engine
- `Pixi/core/planner`: Planner Engine
- `Pixi/core/orchestrator`: Agent Orchestrator
- `Pixi/skills`: Skill Registry
- `Pixi/memory`: Memory System
- `Pixi/runtime`: Runtime composition root
- `Pixi/main.py`: Executable entrypoint

## Quick Start

From repo root:

```powershell
cd python
python -m Pixi.main "Plan and summarize a learning session"
```

## Design Notes

- Core logic depends on interfaces in `Pixi/core/contracts.py`.
- Infrastructure adapters (`memory`, `skills`) can be replaced without changing orchestration flow.
- Runtime wiring is centralized in `Pixi/runtime/app_runtime.py` for scalability.

