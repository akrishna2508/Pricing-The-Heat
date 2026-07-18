"""Grounded Claude policy assistant (Prompt 9).

GROUNDING: the system prompt instructs the model to call get_policy_state
BEFORE stating any number -- that tool (backend.assistant.tools) is the ONLY
numeric source the model is given; the model never sees raw pricing internals
any other way.

NEVER 500: any failure calling the Anthropic API (bad model string, network,
rate limit, auth, missing key) is caught and falls through to the
deterministic templated fallback (backend.assistant.fallback), built from the
SAME cached policy state -- so the answer is always grounded, model or no
model.
"""

from __future__ import annotations

import logging
import os

import anthropic

from backend.assistant.fallback import template_answer
from backend.assistant.tools import GET_POLICY_STATE_TOOL, get_policy_state

logger = logging.getLogger(__name__)

DEFAULT_MODEL = "claude-sonnet-4-5"
MAX_TOKENS = 600
MAX_TOOL_ROUNDS = 4

SYSTEM_PROMPT = """You are the policy assistant for a heatwave-wage-loss micro-insurance \
product for informal outdoor workers (vendors, construction, delivery).

PRODUCT FRAMING (must always hold): this is HIGH-FREQUENCY INCOME SMOOTHING / wage \
protection. Heat-driven wage loss is CHRONIC -- workers lose wages on most heatwave \
days, not as a rare, one-off disaster. Never describe this product as cover for a rare \
disaster or a one-off shock; always frame it as smoothing frequent income disruption. \
Never use the standard English word for "large-scale disaster" in your answer.

GROUNDING (non-negotiable): you MUST call the get_policy_state tool for the given \
policy_id BEFORE stating any premium, payout, or basis-risk number. Never invent, \
estimate, or recall a figure from anywhere else. If the tool reports the policy is not \
found or not priced, say so honestly instead of guessing a number.

HONESTY: basis risk is a feature to disclose, not hide. Explain, when relevant, that the \
index-triggered payout can fall short of the worker's actual loss (shortfall_rate) or \
exceed it (overpay_rate) -- an inherent property of any parametric product.

LANGUAGE: respond in the same language as the question (support at minimum English and \
Hindi)."""


def ask(policy_id: str, question: str, policy_cache: dict) -> dict:
    """Returns {"answer": str, "source": "model" | "fallback_no_key" | "fallback_error"}."""
    api_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    state = get_policy_state(policy_id, policy_cache)

    if not api_key:
        return {"answer": template_answer(state, question), "source": "fallback_no_key"}

    try:
        return _ask_model(policy_id, question, policy_cache, api_key)
    except Exception:
        logger.exception("assistant model call failed; falling back to templated answer")
        return {"answer": template_answer(state, question), "source": "fallback_error"}


def _ask_model(policy_id: str, question: str, policy_cache: dict, api_key: str) -> dict:
    model = os.environ.get("ANTHROPIC_MODEL", DEFAULT_MODEL)
    client = anthropic.Anthropic(api_key=api_key)

    messages: list[dict] = [{"role": "user", "content": f"policy_id: {policy_id}\n\n{question}"}]
    tool_was_called = False

    for _ in range(MAX_TOOL_ROUNDS):
        response = client.messages.create(
            model=model, max_tokens=MAX_TOKENS, system=SYSTEM_PROMPT,
            tools=[GET_POLICY_STATE_TOOL], messages=messages,
        )
        messages.append({"role": "assistant", "content": response.content})

        if response.stop_reason != "tool_use":
            text = "".join(block.text for block in response.content if block.type == "text")
            return {"answer": text, "source": "model" if tool_was_called else "model_ungrounded"}

        tool_results = []
        for block in response.content:
            if block.type != "tool_use":
                continue
            if block.name == "get_policy_state":
                tool_was_called = True
                result = get_policy_state(block.input.get("policy_id", policy_id), policy_cache)
            else:
                result = {"error": f"unknown tool {block.name!r}"}
            tool_results.append({
                "type": "tool_result", "tool_use_id": block.id, "content": str(result),
            })
        messages.append({"role": "user", "content": tool_results})

    # Exhausted tool-use rounds without a final answer -- caller falls back honestly.
    raise RuntimeError("assistant exceeded max tool-use rounds without a final answer")
