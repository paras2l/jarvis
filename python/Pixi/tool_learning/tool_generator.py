"""Generate new Pixi tool implementations."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
import textwrap
from typing import Any, Callable, Dict, Iterable, List

from Pixi.memory.memory_system import MemorySystem
from Pixi.tool_learning.tool_detector import ToolNeed


@dataclass(slots=True)
class GeneratedToolArtifact:
    """Concrete tool artifact produced by the generator."""

    tool_name: str
    source_path: str
    source_code: str
    entrypoint: str = "execute"
    tool_type: str = "script"
    description: str = ""
    required_capabilities: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)
    generated_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    prompt: str = ""
    in_memory_callable: Callable[[Dict[str, Any]], Dict[str, Any]] | None = None


class ToolGenerator:
    """Generates tool source code and optional runtime callables."""

    def __init__(self, memory: MemorySystem, output_dir: str = "python/Pixi/tool_learning/generated", code_agent: Any | None = None) -> None:
        self._memory = memory
        self._output_dir = Path(output_dir)
        self._output_dir.mkdir(parents=True, exist_ok=True)
        self._code_agent = code_agent

    def generate(self, need: ToolNeed, *, overwrite: bool = False) -> GeneratedToolArtifact:
        tool_name = self._sanitize_name(need.tool_name)
        path = self._output_dir / f"{tool_name}.py"

        if path.exists() and not overwrite:
            source_code = path.read_text(encoding="utf-8")
        else:
            source_code = self._request_source(need)
            path.write_text(source_code, encoding="utf-8")

        artifact = GeneratedToolArtifact(
            tool_name=tool_name,
            source_path=str(path),
            source_code=source_code,
            entrypoint="execute",
            tool_type=need.preferred_tool_type,
            description=need.description,
            required_capabilities=list(need.required_capabilities),
            metadata={
                **dict(need.metadata),
                "need_id": need.need_id,
                "category": need.category,
                "confidence": need.confidence,
                "urgency": need.urgency,
            },
            prompt=self._build_prompt(need),
        )
        artifact.in_memory_callable = self._load_callable(artifact)
        self._persist(artifact)
        return artifact

    def generate_many(self, needs: Iterable[ToolNeed], *, overwrite: bool = False) -> List[GeneratedToolArtifact]:
        artifacts: List[GeneratedToolArtifact] = []
        for need in needs:
            artifacts.append(self.generate(need, overwrite=overwrite))
        return artifacts

    def rewrite(self, artifact: GeneratedToolArtifact, *, prompt_hint: str | None = None) -> GeneratedToolArtifact:
        source = self._request_source_from_artifact(artifact, prompt_hint=prompt_hint)
        Path(artifact.source_path).write_text(source, encoding="utf-8")
        artifact.source_code = source
        artifact.in_memory_callable = self._load_callable(artifact)
        artifact.generated_at = datetime.now(timezone.utc).isoformat()
        self._persist(artifact)
        return artifact

    def propose_runtime_payload(self, need: ToolNeed) -> Dict[str, Any]:
        return {
            "tool_name": need.tool_name,
            "category": need.category,
            "tool_type": need.preferred_tool_type,
            "required_capabilities": list(need.required_capabilities),
            "context": dict(need.context),
            "metadata": dict(need.metadata),
        }

    def _request_source(self, need: ToolNeed) -> str:
        prompt = self._build_prompt(need)
        source = self._call_code_agent(prompt, need)
        if source is None:
            source = self._template_source(need)
        source = self._normalize_source(source)
        return source

    def _request_source_from_artifact(self, artifact: GeneratedToolArtifact, *, prompt_hint: str | None = None) -> str:
        prompt = self._build_rewrite_prompt(artifact, prompt_hint=prompt_hint)
        source = self._call_code_agent(prompt, None)
        if source is None:
            source = self._template_source_from_artifact(artifact)
        return self._normalize_source(source)

    def _call_code_agent(self, prompt: str, need: ToolNeed | None) -> str | None:
        if self._code_agent is None:
            return None

        agent = self._code_agent
        try:
            if callable(agent):
                response = agent(prompt=prompt, need=need) if need is not None else agent(prompt=prompt)
            elif hasattr(agent, "generate_code"):
                response = agent.generate_code(prompt, need=need)
            elif hasattr(agent, "generate"):
                response = agent.generate(prompt, need=need)
            else:
                return None
        except TypeError:
            try:
                response = agent.generate_code(prompt) if hasattr(agent, "generate_code") else agent(prompt)
            except Exception:
                return None
        except Exception:
            return None

        if isinstance(response, dict):
            source = response.get("source_code") or response.get("code") or response.get("text")
            return None if source is None else str(source)
        return None if response is None else str(response)

    def _template_source(self, need: ToolNeed) -> str:
        args_doc = ", ".join(need.required_capabilities) if need.required_capabilities else "general automation"
        content = f'''"""Auto-generated tool: {need.tool_name}."""

from __future__ import annotations

from typing import Any, Dict


TOOL_NAME = "{need.tool_name}"
TOOL_TYPE = "{need.preferred_tool_type}"


def _normalize_payload(payload: Dict[str, Any]) -> Dict[str, Any]:
    if not isinstance(payload, dict):
        raise ValueError("payload must be a dict")
    return payload


def execute(payload: Dict[str, Any]) -> Dict[str, Any]:
    payload = _normalize_payload(payload)
    task = str(payload.get("task") or payload.get("goal") or payload.get("description") or "")
    return {{
        "status": "ok",
        "tool": TOOL_NAME,
        "summary": f"{need.title} handled: {{task}}",
        "details": {{
            "category": "{need.category}",
            "description": "{need.description}",
            "required_capabilities": {list(need.required_capabilities)!r},
            "capability_notes": "{args_doc}",
        }},
        "confidence": {max(0.45, min(0.95, need.confidence)):.2f},
    }}
'''
        return textwrap.dedent(content)

    def _template_source_from_artifact(self, artifact: GeneratedToolArtifact) -> str:
        content = f'''"""Auto-generated tool rewrite: {artifact.tool_name}."""

from __future__ import annotations

from typing import Any, Dict


TOOL_NAME = "{artifact.tool_name}"


def execute(payload: Dict[str, Any]) -> Dict[str, Any]:
    if not isinstance(payload, dict):
        raise ValueError("payload must be a dict")
    return {{
        "status": "ok",
        "tool": TOOL_NAME,
        "summary": "Rewritten tool executed successfully.",
        "details": {{"source_path": "{artifact.source_path}", "metadata": {artifact.metadata!r}}},
        "confidence": 0.78,
    }}
'''
        return textwrap.dedent(content)

    @staticmethod
    def _normalize_source(source: str) -> str:
        text = source.strip()
        if text.startswith("```"):
            text = text.strip("`")
        if "def execute" not in text:
            raise ValueError("generated source must define execute(payload)")
        return text + "\n"

    def _load_callable(self, artifact: GeneratedToolArtifact):
        namespace: Dict[str, Any] = {}
        code = compile(artifact.source_code, artifact.source_path, "exec")
        exec(code, namespace, namespace)
        execute = namespace.get(artifact.entrypoint)
        if not callable(execute):
            return None
        return execute

    def _build_prompt(self, need: ToolNeed) -> str:
        return (
            f"Create a Pixi tool named {need.tool_name}. "
            f"Category: {need.category}. Type: {need.preferred_tool_type}. "
            f"Description: {need.description}. "
            f"Capabilities: {', '.join(need.required_capabilities) or 'general automation'}."
        )

    def _build_rewrite_prompt(self, artifact: GeneratedToolArtifact, *, prompt_hint: str | None = None) -> str:
        hint = f" Improvement hint: {prompt_hint}." if prompt_hint else ""
        return f"Rewrite the Pixi tool {artifact.tool_name} to improve robustness and clarity.{hint}"

    def _persist(self, artifact: GeneratedToolArtifact) -> None:
        payload = {
            "type": "generated_tool",
            "tool_name": artifact.tool_name,
            "source_path": artifact.source_path,
            "tool_type": artifact.tool_type,
            "description": artifact.description,
            "required_capabilities": list(artifact.required_capabilities),
            "metadata": dict(artifact.metadata),
            "generated_at": artifact.generated_at,
        }
        self._memory.remember_short_term(
            key=f"tool_learning:generated:{artifact.tool_name}",
            value=payload,
            tags=["tool_learning", "generation"],
        )
        self._memory.remember_long_term(
            key=f"tool_learning:generated:{artifact.tool_name}:{artifact.generated_at}",
            value=payload,
            source="Pixi.tool_learning.tool_generator",
            importance=0.77,
            tags=["tool_learning", "generation"],
        )
        self._memory.remember_semantic(
            doc_id=f"tool_learning:generated:{artifact.tool_name}:{datetime.now(timezone.utc).timestamp()}",
            text=f"{artifact.tool_name} {artifact.description} {artifact.tool_type}",
            metadata={"type": "generated_tool"},
        )

    @staticmethod
    def _sanitize_name(name: str) -> str:
        import re

        cleaned = re.sub(r"[^a-zA-Z0-9_]+", "_", name.strip()).strip("_").lower()
        if not cleaned:
            raise ValueError("invalid tool name")
        return cleaned

