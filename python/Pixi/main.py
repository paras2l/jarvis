"""Pixi Python entrypoint.

Run with:
    python -m Pixi.main "your goal here"
"""

from __future__ import annotations

import sys

from Pixi.runtime.app_runtime import PixiRuntime


def main() -> None:
    goal = " ".join(sys.argv[1:]).strip() or "Create a tutorial video plan"
    runtime = PixiRuntime()
    output = runtime.run_once(goal)
    print(output)


if __name__ == "__main__":
    main()

