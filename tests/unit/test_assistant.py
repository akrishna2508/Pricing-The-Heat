"""Offline-capable tests for the grounded Claude policy assistant (Prompt 9).

The Anthropic client is fully mocked for the "model" path -- no network call,
no real API key needed. The no-key fallback path needs no mocking at all
(ANTHROPIC_API_KEY absent -> deterministic template straight from the
in-memory policy cache), which is exactly what makes the prototype demoable
with zero external calls.
"""

from __future__ import annotations

from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

import backend.main as main_module
from backend.assistant import service as assistant_service
from backend.main import app

client = TestClient(app)

KNOWN_POLICY = {
    "occupation": "vendor",
    "window_days": 14,
    "strike": 75.0,
    "cap": 0.9,
    "city_key": "ahmedabad",
    "premium_lsmc": 229.32,
    "premium_wang": 252.19,
    "payout_schedule": {
        "form": "cap * (mu_tevi - strike)_+ / (100 - strike)",
        "strike": 75.0, "cap": 0.9, "trigger_frequency": 0.30,
    },
    "basis_risk": {
        "basis_risk_rmse": 0.20, "shortfall_rate": 0.40,
        "overpay_rate": 0.26, "correlation": 0.85,
    },
}

OUT_OF_COVERAGE_POLICY = {"window_days": None}


@pytest.fixture(autouse=True)
def _seeded_policy_cache(monkeypatch):
    cache = {"pid-known": dict(KNOWN_POLICY), "pid-uncovered": dict(OUT_OF_COVERAGE_POLICY)}
    monkeypatch.setattr(main_module, "_policy_cache", cache)
    yield cache


def test_missing_policy_id_returns_422():
    resp = client.post("/assistant/ask", json={"question": "what is my premium?"})
    assert resp.status_code == 422


def test_unknown_question_field_still_422_when_question_missing():
    resp = client.post("/assistant/ask", json={"policy_id": "pid-known"})
    assert resp.status_code == 422


def test_no_key_fallback_returns_correct_premium_and_basis_risk(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    resp = client.post("/assistant/ask", json={
        "policy_id": "pid-known", "question": "What is my premium?",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["source"] == "fallback_no_key"
    assert f"{KNOWN_POLICY['premium_lsmc']:.2f}" in data["answer"]
    assert f"{KNOWN_POLICY['premium_wang']:.2f}" in data["answer"]
    shortfall_pct = KNOWN_POLICY["basis_risk"]["shortfall_rate"] * 100.0
    assert f"{shortfall_pct:.1f}" in data["answer"]


def test_no_key_fallback_out_of_coverage_policy_is_honest_not_fabricated(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    resp = client.post("/assistant/ask", json={
        "policy_id": "pid-uncovered", "question": "What is my premium?",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert "no premium" in data["answer"].lower() or "no number" in data["answer"].lower()


def test_no_key_fallback_never_says_catastrophe_and_uses_income_smoothing_framing(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    resp = client.post("/assistant/ask", json={
        "policy_id": "pid-known", "question": "Is this like insurance for a disaster?",
    })
    assert resp.status_code == 200
    answer = resp.json()["answer"]
    assert "catastrophe" not in answer.lower()
    assert "income smoothing" in answer.lower()


def test_unknown_policy_id_fallback_is_honest_not_fabricated(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    resp = client.post("/assistant/ask", json={
        "policy_id": "does-not-exist", "question": "What is my premium?",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert "couldn't find" in data["answer"].lower() or "not find" in data["answer"].lower()


# --- model path (mocked Anthropic client) -----------------------------------


class _FakeTextBlock:
    def __init__(self, text):
        self.type = "text"
        self.text = text


class _FakeToolUseBlock:
    def __init__(self, name, input_, id_):
        self.type = "tool_use"
        self.name = name
        self.input = input_
        self.id = id_


class _FakeResponse:
    def __init__(self, content, stop_reason):
        self.content = content
        self.stop_reason = stop_reason


def test_model_path_calls_get_policy_state_before_any_numeric_claim(monkeypatch):
    """The FIRST mocked response contains ONLY a tool_use block -- no text at
    all -- so it is structurally impossible for a number to have been stated
    before get_policy_state ran. The SECOND response's tool_result content
    (round-tripped back from our code) must carry the cache's real premium,
    proving the tool was actually invoked and grounded the answer."""
    calls = []

    def fake_create(**kwargs):
        # Snapshot messages NOW -- `messages` is mutated in place by the
        # caller across rounds, so storing the bare reference would make
        # every recorded call reflect the FINAL state, not what was actually
        # sent at call time.
        calls.append({**kwargs, "messages": list(kwargs["messages"])})
        if len(calls) == 1:
            assert kwargs["messages"][-1]["role"] == "user"
            return _FakeResponse(
                [_FakeToolUseBlock("get_policy_state", {"policy_id": "pid-known"}, "tool_1")],
                "tool_use",
            )
        return _FakeResponse(
            [_FakeTextBlock(f"Your premium is {KNOWN_POLICY['premium_lsmc']:.2f}.")],
            "end_turn",
        )

    fake_client = SimpleNamespace(messages=SimpleNamespace(create=fake_create))
    monkeypatch.setattr(assistant_service, "anthropic",
                        SimpleNamespace(Anthropic=lambda api_key: fake_client))
    monkeypatch.setenv("ANTHROPIC_API_KEY", "fake-test-key")

    result = assistant_service.ask("pid-known", "What is my premium?", {"pid-known": dict(KNOWN_POLICY)})

    assert len(calls) == 2  # the tool round-trip actually happened
    assert result["source"] == "model"
    assert f"{KNOWN_POLICY['premium_lsmc']:.2f}" in result["answer"]

    # The tool_result sent back on round 2 must carry the REAL cached premium
    # (not a guess) -- this is the grounding proof, not just "a tool ran".
    second_call_messages = calls[1]["messages"]
    tool_result_msg = second_call_messages[-1]
    assert tool_result_msg["role"] == "user"
    tool_result_content = str(tool_result_msg["content"])
    assert str(KNOWN_POLICY["premium_lsmc"]) in tool_result_content


def test_model_call_exception_falls_back_to_template(monkeypatch):
    """ANY error from the Anthropic call (auth, bad model, network, rate
    limit) must fall through to the deterministic fallback -- never a 500."""
    def raising_create(**kwargs):
        raise RuntimeError("simulated network failure")

    fake_client = SimpleNamespace(messages=SimpleNamespace(create=raising_create))
    monkeypatch.setattr(assistant_service, "anthropic",
                        SimpleNamespace(Anthropic=lambda api_key: fake_client))
    monkeypatch.setenv("ANTHROPIC_API_KEY", "fake-test-key")

    result = assistant_service.ask("pid-known", "What is my premium?", {"pid-known": dict(KNOWN_POLICY)})
    assert result["source"] == "fallback_error"
    assert f"{KNOWN_POLICY['premium_lsmc']:.2f}" in result["answer"]


def test_assistant_ask_endpoint_never_500s_on_model_failure(monkeypatch):
    def raising_create(**kwargs):
        raise RuntimeError("simulated failure")

    fake_client = SimpleNamespace(messages=SimpleNamespace(create=raising_create))
    monkeypatch.setattr(assistant_service, "anthropic",
                        SimpleNamespace(Anthropic=lambda api_key: fake_client))
    monkeypatch.setenv("ANTHROPIC_API_KEY", "fake-test-key")

    resp = client.post("/assistant/ask", json={"policy_id": "pid-known", "question": "premium?"})
    assert resp.status_code == 200
    assert resp.json()["source"] == "fallback_error"
