"""Jarvis Python entrypoint.

Run with:
    python -m jarvis.main "your goal here"
"""

from __future__ import annotations

import sys

from jarvis.runtime.app_runtime import JarvisRuntime


def main() -> None:
    goal = " ".join(sys.argv[1:]).strip() or "Create a tutorial video plan"
    runtime = JarvisRuntime()
    output = runtime.run_once(goal)
    print(output)


if __name__ == "__main__":
    main()
