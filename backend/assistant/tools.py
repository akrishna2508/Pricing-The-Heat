"""Tool definition + implementation for get_policy_state -- the assistant's
ONLY source of numeric policy facts (Prompt 9's grounding requirement).

Reads directly from the in-memory policy cache populated by /simulate-policy
(backend.main._policy_cache); never recomputes a premium and never invents
one. An unknown or unpriced policy_id returns an honest marker instead of a
number, so the model (or the templated fallback) can say so rather than guess.
"""

from __future__ import annotations

GET_POLICY_STATE_TOOL = {
    "name": "get_policy_state",
    "description": (
        "Return the ACTUAL computed pricing state for a policy_id: premium_lsmc, "
        "premium_wang, payout_schedule, and basis_risk (basis_risk_rmse, "
        "shortfall_rate, overpay_rate, correlation). ALWAYS call this tool before "
        "stating ANY number about a policy -- never invent, estimate, or recall a "
        "figure from anywhere else."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "policy_id": {"type": "string", "description": "The policy_id to look up."},
        },
        "required": ["policy_id"],
    },
}


def get_policy_state(policy_id: str, policy_cache: dict) -> dict:
    """Looks up policy_id in the in-memory cache -- the sole source of truth."""
    cached = policy_cache.get(policy_id)
    if cached is None:
        return {"found": False, "reason": f"unknown policy_id {policy_id!r}"}
    if cached.get("premium_lsmc") is None:
        return {
            "found": True,
            "priced": False,
            "reason": "policy has no priced contract (out-of-coverage or unpriced)",
        }
    return {
        "found": True,
        "priced": True,
        "premium_lsmc": cached["premium_lsmc"],
        "premium_wang": cached["premium_wang"],
        "payout_schedule": cached["payout_schedule"],
        "basis_risk": cached["basis_risk"],
        "occupation": cached.get("occupation"),
    }
