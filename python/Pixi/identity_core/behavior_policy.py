"""Behavioral Policy module for Pixi AI system.

Defines ethical guidelines, behavioral rules, and decision-making policies
that shape how the system interacts and makes choices.

Policy domains:
- Ethical principles and values
- Safety and harm prevention
- User privacy and data protection
- Truthfulness and transparency
- Autonomy and human oversight
- Resource usage and efficiency
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List

from Pixi.memory.memory_system import MemorySystem


class PolicyDomain(Enum):
    """Categories of behavioral policies."""

    ETHICS = "ethics"
    SAFETY = "safety"
    PRIVACY = "privacy"
    TRUTHFULNESS = "truthfulness"
    AUTONOMY = "autonomy"
    RESOURCE = "resource"
    USER_INTERACTION = "user_interaction"


@dataclass(slots=True)
class BehavioralRule:
    """A single behavioral rule or policy."""

    rule_id: str
    domain: str
    rule_name: str
    description: str
    enforcement_level: str  # soft, medium, hard
    conditions: List[str] = field(default_factory=list)
    actions_required: List[str] = field(default_factory=list)
    exceptions: List[str] = field(default_factory=list)
    violation_consequences: str = ""


@dataclass(slots=True)
class PolicySet:
    """A collection of behavioral policies."""

    set_id: str
    name: str
    description: str
    rules: Dict[str, BehavioralRule] = field(default_factory=dict)
    enabled: bool = True
    versioned_at: str = ""
    approval_status: str = "approved"  # draft, pending, approved, deprecated


class BehaviorPolicy:
    """Manages behavioral rules and ethical guidelines."""

    def __init__(self, memory: MemorySystem) -> None:
        self._memory = memory
        self._rules: Dict[str, BehavioralRule] = {}
        self._policy_sets: Dict[str, PolicySet] = {}
        self._violation_log: List[Dict[str, Any]] = []

        self._initialize_default_policies()

    def add_rule(
        self,
        domain: str,
        rule_name: str,
        description: str,
        enforcement_level: str,
        conditions: List[str] | None = None,
        actions_required: List[str] | None = None,
        exceptions: List[str] | None = None,
    ) -> BehavioralRule:
        """Add a new behavioral rule."""
        rule_id = f"rule_{len(self._rules):04d}"

        rule = BehavioralRule(
            rule_id=rule_id,
            domain=domain,
            rule_name=rule_name,
            description=description,
            enforcement_level=enforcement_level,
            conditions=conditions or [],
            actions_required=actions_required or [],
            exceptions=exceptions or [],
        )

        self._rules[rule_id] = rule
        self._persist_rule(rule)
        return rule

    def check_policy_compliance(
        self,
        action: str,
        context: Dict[str, Any],
    ) -> tuple[bool, List[str]]:
        """Check if an action violates any policies.
        
        Returns (compliant, violations).
        """
        violations: List[str] = []

        for rule in self._rules.values():
            if not rule.enabled:
                continue

            if self._rule_applies(rule, action, context):
                violations.append(f"{rule.domain}: {rule.rule_name}")

        compliant = len(violations) == 0
        if not compliant:
            self._log_violation(action, context, violations)

        return compliant, violations

    def get_rules_for_domain(self, domain: str) -> List[BehavioralRule]:
        """Get all rules in a specific domain."""
        return [r for r in self._rules.values() if r.domain == domain]

    def get_applicable_rules(self, context: Dict[str, Any]) -> List[BehavioralRule]:
        """Get rules that apply to the current context."""
        applicable = []
        for rule in self._rules.values():
            if not rule.enabled:
                continue

            if all(self._check_condition(cond, context) for cond in rule.conditions):
                applicable.append(rule)

        return applicable

    def enforce_rule(self, rule_id: str, enable: bool) -> bool:
        """Enable or disable a specific rule."""
        if rule_id not in self._rules:
            return False

        self._rules[rule_id].enabled = enable
        return True

    def get_ethics_principles(self) -> Dict[str, str]:
        """Get ethical principles that guide behavior."""
        return {
            "honesty": "Always provide truthful information unless compelling safety reasons require otherwise",
            "beneficence": "Aim to help users and avoid harm",
            "autonomy": "Respect user autonomy and decision-making",
            "justice": "Treat similar cases similarly and be fair",
            "transparency": "Be clear about capabilities, limitations, and reasoning",
            "accountability": "Take responsibility for actions and their consequences",
        }

    def can_execute_action(self, action_type: str, context: Dict[str, Any]) -> bool:
        """Determine if an action is permitted under current policies."""
        if action_type == "system_modification" and not context.get("approval_granted", False):
            return False
        if action_type == "system_access" and context.get("access_level", "user") == "user":
            return False
        if action_type == "data_deletion" and not context.get("confirmation", False):
            return False

        return True

    def diagnostics(self) -> Dict[str, Any]:
        """Return policy diagnostics."""
        domains_covered = set(r.domain for r in self._rules.values() if r.enabled)
        severity_distribution = {}
        for rule in self._rules.values():
            if rule.enabled:
                level = rule.enforcement_level
                severity_distribution[level] = severity_distribution.get(level, 0) + 1

        return {
            "total_rules": len(self._rules),
            "enabled_rules": sum(1 for r in self._rules.values() if r.enabled),
            "domains_covered": list(domains_covered),
            "enforcement_distribution": severity_distribution,
            "total_violations_logged": len(self._violation_log),
            "policy_sets": len(self._policy_sets),
        }

    def _initialize_default_policies(self) -> None:
        """Create default behavioral policies."""
        # Ethics
        self.add_rule(
            domain=PolicyDomain.ETHICS.value,
            rule_name="Honesty",
            description="Always provide truthful information",
            enforcement_level="hard",
            actions_required=["Refuse to deceive", "Correct misinformation"],
        )

        self.add_rule(
            domain=PolicyDomain.ETHICS.value,
            rule_name="Non-maleficence",
            description="Do not cause harm to users or systems",
            enforcement_level="hard",
            actions_required=["Refuse harmful requests", "Warn about risks"],
        )

        # Privacy
        self.add_rule(
            domain=PolicyDomain.PRIVACY.value,
            rule_name="Data Protection",
            description="Protect user personal data",
            enforcement_level="hard",
            actions_required=["Encrypt sensitive data", "Minimize data retention"],
        )

        self.add_rule(
            domain=PolicyDomain.PRIVACY.value,
            rule_name="Confidentiality",
            description="Keep user information confidential",
            enforcement_level="hard",
            actions_required=["Never share user data without consent"],
        )

        # Truthfulness
        self.add_rule(
            domain=PolicyDomain.TRUTHFULNESS.value,
            rule_name="Uncertainty Expression",
            description="Express uncertainty when not confident",
            enforcement_level="medium",
            actions_required=["Qualify claims appropriately", "Admit unknowns"],
        )

        # Autonomy
        self.add_rule(
            domain=PolicyDomain.AUTONOMY.value,
            rule_name="Human Oversight",
            description="Preserve user decision-making authority",
            enforcement_level="medium",
            actions_required=["Provide decision support", "Don't override user choices"],
        )

        # Safety
        self.add_rule(
            domain=PolicyDomain.SAFETY.value,
            rule_name="Safety-Critical Actions",
            description="Require approval for safety-critical modifications",
            enforcement_level="hard",
            actions_required=["Request confirmation", "Log all changes"],
        )

        # Resource
        self.add_rule(
            domain=PolicyDomain.RESOURCE.value,
            rule_name="Resource Efficiency",
            description="Use resources efficiently and responsibly",
            enforcement_level="medium",
            actions_required=["Monitor resource usage", "Optimize when possible"],
        )

    def _rule_applies(self, rule: BehavioralRule, action: str, context: Dict[str, Any]) -> bool:
        """Check if a rule applies to the given action and context."""
        if rule.domain == PolicyDomain.ETHICS.value and action in ["deceive", "harm", "manipulate"]:
            return True
        if rule.domain == PolicyDomain.PRIVACY.value and action in ["expose_data", "share_personal"]:
            return True
        if rule.domain == PolicyDomain.SAFETY.value and action in ["modify_core", "delete_config"]:
            return True

        return False

    @staticmethod
    def _check_condition(condition: str, context: Dict[str, Any]) -> bool:
        """Check if a condition is satisfied in the context."""
        # Simple condition checking - can be extended
        if condition == "user_authenticated":
            return context.get("authenticated", False)
        if condition == "safety_critical":
            return context.get("safety_critical", False)

        return True

    def _log_violation(self, action: str, context: Dict[str, Any], violations: List[str]) -> None:
        """Log a policy violation."""
        from datetime import datetime, timezone

        violation_record = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "action": action,
            "violations": violations,
            "context_keys": list(context.keys()),
        }

        self._violation_log.append(violation_record)

        # Keep only recent violations
        if len(self._violation_log) > 1000:
            self._violation_log = self._violation_log[-500:]

        self._memory.remember_long_term(
            key=f"policy_violation:{len(self._violation_log):05d}",
            value=violation_record,
            source="identity_core.behavior_policy",
            importance=0.85,
            tags=["policy", "violation"],
        )

    def _persist_rule(self, rule: BehavioralRule) -> None:
        """Store rule in persistent memory."""
        self._memory.remember_long_term(
            key=f"behavior_rule:{rule.rule_id}",
            value={
                "rule_id": rule.rule_id,
                "domain": rule.domain,
                "rule_name": rule.rule_name,
                "enforcement_level": rule.enforcement_level,
            },
            source="identity_core.behavior_policy",
            importance=0.8,
            tags=["behavior", "policy", "rule"],
        )
        # Track enabled rules
        self._memory.remember_short_term(
            key="active_behavior_rules",
            value={"count": sum(1 for r in self._rules.values() if r.enabled)},
            tags=["behavior", "policy"],
        )

