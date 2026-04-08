"""Jarvis AI System umbrella package.

This namespace provides a compatibility layout over the existing Jarvis Python
runtime package. Core implementations continue to live under `jarvis.*`.
"""

from jarvis_ai_system.main import start_jarvis

__all__ = ["start_jarvis"]
