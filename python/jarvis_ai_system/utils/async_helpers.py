"""Async helper utilities for Jarvis AI System."""

from __future__ import annotations

import asyncio
from typing import Any, Awaitable, Iterable, List


async def gather_limited(limit: int, coroutines: Iterable[Awaitable[Any]]) -> List[Any]:
    semaphore = asyncio.Semaphore(max(1, limit))

    async def _runner(coro: Awaitable[Any]) -> Any:
        async with semaphore:
            return await coro

    return await asyncio.gather(*(_runner(coro) for coro in coroutines))
