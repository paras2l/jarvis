"""Integration bridge between Planning Engine and Knowledge System.

Provides planning-specific interfaces and utilities for the planner to
use knowledge in task decomposition, dependency analysis, and planning.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from jarvis.knowledge_system.knowledge_core import KnowledgeCore


@dataclass(slots=True)
class PlanningEntity:
    """Entity representation for planning operations."""

    entity_id: str
    label: str
    kind: str
    is_goal: bool = False
    is_resource: bool = False
    preconditions: List[str] = None
    effects: List[str] = None

    def __post_init__(self):
        if self.preconditions is None:
            self.preconditions = []
        if self.effects is None:
            self.effects = []


@dataclass(slots=True)
class PlanningDependency:
    """A dependency between planning entities."""

    from_entity_id: str
    to_entity_id: str
    dependency_type: str  # "prerequisite", "resource", "sequential", "parallel"
    strength: float  # 0.0-1.0
    description: str


class PlanningKnowledgeBridge:
    """Bridge between Planning Engine and Knowledge System.

    Adapts knowledge system output for planning operations and provides
    utilities for task decomposition, dependency analysis, and resource
    planning.
    """

    def __init__(self, knowledge_core: KnowledgeCore) -> None:
        self._knowledge = knowledge_core

    def analyze_task_dependencies(self, task_entity_id: str) -> Dict[str, Any]:
        """Analyze dependencies for a task entity.

        Integration point: Planning → Knowledge System
        """
        task_context = self._knowledge.get_task_knowledge([task_entity_id])

        if not task_context:
            return {
                "success": False,
                "message": f"Task entity {task_entity_id} not found",
            }

        # Analyze relationships to identify dependencies
        dependencies: List[PlanningDependency] = []

        for rel in task_context.get("relationships", []):
            rel_type = rel.get("relation_type", "")

            # Map knowledge relationships to planning dependencies
            planning_type = self._map_to_planning_dependency(rel_type)

            if planning_type:
                dependencies.append(
                    PlanningDependency(
                        from_entity_id=rel.get("from_entity_id", ""),
                        to_entity_id=rel.get("to_entity_id", ""),
                        dependency_type=planning_type,
                        strength=rel.get("confidence", 0.5),
                        description=rel.get("description", ""),
                    )
                )

        return {
            "success": True,
            "task_entity_id": task_entity_id,
            "dependencies": [
                {
                    "from": d.from_entity_id,
                    "to": d.to_entity_id,
                    "type": d.dependency_type,
                    "strength": d.strength,
                }
                for d in dependencies
            ],
            "dependency_count": len(dependencies),
        }

    def find_prerequisites(self, task_entity_id: str) -> Dict[str, Any]:
        """Find prerequisites for a task.

        Integration point: Planning → Knowledge System (goal analysis)
        """
        entity_info = self._knowledge.get_entity_info(task_entity_id)

        if not entity_info:
            return {"success": False, "prerequisites": []}

        # Incoming relationships may indicate prerequisites
        prerequisites = []

        for rel in entity_info.get("incoming_relations", []):
            if rel.get("relation_type") in ["requires", "depends_on", "prerequisite_of"]:
                prerequisites.append(
                    {
                        "entity_id": rel.get("from_entity_id", ""),
                        "entity_label": rel.get("from_entity_label", ""),
                        "type": rel.get("relation_type", ""),
                        "confidence": rel.get("confidence", 0.5),
                    }
                )

        return {
            "success": True,
            "task_entity_id": task_entity_id,
            "prerequisites": prerequisites,
            "prerequisite_count": len(prerequisites),
        }

    def find_resources(self, task_entity_id: str) -> Dict[str, Any]:
        """Find available resources for a task.

        Integration point: Planning → Knowledge System (resource allocation)
        """
        entity_info = self._knowledge.get_entity_info(task_entity_id)

        if not entity_info:
            return {"success": False, "resources": []}

        # Relationships with resource-related types
        resources = []

        for rel in entity_info.get("outgoing_relations", []):
            if rel.get("relation_type") in ["uses", "requires_resource", "needs"]:
                resources.append(
                    {
                        "entity_id": rel.get("to_entity_id", ""),
                        "entity_label": rel.get("to_entity_label", ""),
                        "type": rel.get("relation_type", ""),
                        "confidence": rel.get("confidence", 0.5),
                    }
                )

        return {
            "success": True,
            "task_entity_id": task_entity_id,
            "resources": resources,
            "resource_count": len(resources),
        }

    def check_feasibility(self, task_entity_id: str, constraints: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Check feasibility of a task given constraints.

        Integration point: Planning → Knowledge System (feasibility check)
        """
        # Get task context
        task_context = self._knowledge.get_task_knowledge([task_entity_id])

        if not task_context:
            return {"success": False, "feasible": False, "reason": "Task not found"}

        # Simple feasibility heuristics
        entity_count = task_context.get("entity_count", 0)
        relationship_count = len(task_context.get("relationships", []))

        # Check if task has enough connections to be feasible
        min_connections = 1
        if relationship_count < min_connections:
            return {
                "success": True,
                "feasible": False,
                "reason": f"Insufficient relationships ({relationship_count} < {min_connections})",
                "confidence": 0.8,
            }

        # Check constraints
        feasibility_issues = []

        if constraints:
            if "max_duration" in constraints:
                # Could check if task has duration_estimate property
                pass

            if "required_resources" in constraints:
                # Check if resources are available
                resources = self.find_resources(task_entity_id)
                available_resource_count = resources.get("resource_count", 0)

                if available_resource_count < len(constraints["required_resources"]):
                    feasibility_issues.append("Not all required resources are available")

        return {
            "success": True,
            "feasible": len(feasibility_issues) == 0,
            "confidence": 0.75 if not feasibility_issues else 0.5,
            "issues": feasibility_issues,
        }

    def decompose_task(self, task_entity_id: str) -> Dict[str, Any]:
        """Decompose a task into subtasks based on knowledge.

        Integration point: Planning → Knowledge System (goal decomposition)
        """
        task_context = self._knowledge.get_task_knowledge([task_entity_id])

        if not task_context:
            return {"success": False, "subtasks": []}

        # Look for entities related as subgoals or components
        subtasks = []

        for entity in task_context.get("entities", []):
            entity_kind = entity.get("kind", "")

            # Heuristic: if entity kind includes "task" or "goal", it might be a subtask
            if "task" in entity_kind.lower() or "goal" in entity_kind.lower():
                if entity.get("entity_id") != task_entity_id:  # Exclude self
                    subtasks.append(
                        {
                            "subtask_id": entity.get("entity_id", ""),
                            "subtask_label": entity.get("label", ""),
                            "kind": entity_kind,
                            "confidence": entity.get("confidence", 0.5),
                        }
                    )

        return {
            "success": True,
            "task_entity_id": task_entity_id,
            "subtasks": subtasks,
            "subtask_count": len(subtasks),
        }

    def estimate_effort(self, task_entity_id: str) -> Dict[str, Any]:
        """Estimate effort/complexity for a task.

        Integration point: Planning → Knowledge System (effort estimation)
        """
        entity_info = self._knowledge.get_entity_info(task_entity_id)

        if not entity_info:
            return {"success": False, "estimated_effort": 0}

        # Estimate based on entity properties and relationships
        base_effort = 1.0  # Start with low effort

        # Check for complexity properties
        properties = entity_info.get("properties", {})

        if properties.get("complexity", "low").lower() == "high":
            base_effort *= 2.0
        elif properties.get("complexity", "low").lower() == "medium":
            base_effort *= 1.5

        # More relationships = more coordination needed = more effort
        relationship_count = (
            len(entity_info.get("incoming_relations", []))
            + len(entity_info.get("outgoing_relations", []))
        )

        coordination_factor = 1.0 + (relationship_count * 0.1)
        estimated_effort = base_effort * coordination_factor

        # Confidence decreases with more relationships (less predictable)
        confidence = max(0.5, 1.0 - (relationship_count * 0.05))

        return {
            "success": True,
            "task_entity_id": task_entity_id,
            "estimated_effort": estimated_effort,
            "complexity_factors": {
                "base_effort": base_effort,
                "coordination_factor": coordination_factor,
                "relationship_count": relationship_count,
            },
            "confidence": confidence,
        }

    def plan_task_sequence(self, task_entity_ids: List[str]) -> Dict[str, Any]:
        """Plan optimal sequence of tasks.

        Integration point: Planning → Knowledge System (sequencing)
        """
        if not task_entity_ids:
            return {"success": False, "sequence": []}

        # Analyze dependencies between all tasks
        task_dependencies = {}

        for task_id in task_entity_ids:
            deps = self.analyze_task_dependencies(task_id)
            task_dependencies[task_id] = deps.get("dependencies", [])

        # Simple topological sort based on dependencies
        sequence = self._topological_sort(task_entity_ids, task_dependencies)

        return {
            "success": True,
            "original_count": len(task_entity_ids),
            "sequence": sequence,
            "is_valid_sequence": len(sequence) == len(task_entity_ids),
        }

    def _map_to_planning_dependency(self, relation_type: str) -> Optional[str]:
        """Map knowledge relationship types to planning dependencies."""
        mapping = {
            "depends_on": "prerequisite",
            "requires": "prerequisite",
            "uses": "resource",
            "needs": "resource",
            "precedes": "sequential",
            "follows": "sequential",
            "parallelize_with": "parallel",
        }

        return mapping.get(relation_type.lower())

    def _topological_sort(self, tasks: List[str], dependencies: Dict[str, List[Dict[str, Any]]]) -> List[str]:
        """Perform topological sort on tasks based on dependencies."""
        # Simple implementation
        sorted_tasks = []
        remaining = set(tasks)

        while remaining:
            # Find tasks with no unsatisfied dependencies
            ready = []

            for task in remaining:
                task_deps = dependencies.get(task, [])
                unsatisfied = [d for d in task_deps if d.get("from") in remaining]

                if not unsatisfied:
                    ready.append(task)

            if not ready:
                # Cycle detected or all tasks have dependencies
                ready = list(remaining)

            # Add ready tasks to result
            sorted_tasks.extend(ready)
            remaining -= set(ready)

        return sorted_tasks
