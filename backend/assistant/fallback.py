"""Deterministic templated fallback answer (Prompt 9).

Used whenever ANTHROPIC_API_KEY is absent/empty, OR when a live model call
fails for any reason (network, auth, bad model string, rate limit) -- see
backend.assistant.service.ask. Built directly from the cached policy state
(the same get_policy_state tool the model uses), so the prototype is fully
demoable with zero external calls and the answer is always grounded.

HONEST FRAMING: never describes the product as insurance against a rare,
one-off disaster -- it is high-frequency INCOME SMOOTHING, because heat wage
loss is chronic (most heatwave days), not rare. The word this module avoids
entirely is the standard English term for that rare-event framing; deliberately
never spelled out here so the guarantee is structural, not a reviewer's habit.
"""

from __future__ import annotations

_DEVANAGARI_LO, _DEVANAGARI_HI = "ऀ", "ॿ"


def _is_hindi(question: str) -> bool:
    return any(_DEVANAGARI_LO <= ch <= _DEVANAGARI_HI for ch in question)


def template_answer(policy_state: dict, question: str) -> str:
    is_hindi = _is_hindi(question)

    if not policy_state.get("found"):
        if is_hindi:
            return "मुझे यह पॉलिसी नहीं मिली। कृपया /simulate-policy से मिला एक मान्य policy_id दें।"
        return "I couldn't find that policy_id. Please provide a valid one from /simulate-policy."

    if not policy_state.get("priced"):
        if is_hindi:
            return (
                "इस पॉलिसी के लिए कोई प्रीमियम या भुगतान नहीं निकाला गया (स्थान कवरेज क्षेत्र से बाहर है), "
                "इसलिए कोई संख्या गढ़ी नहीं गई है। यह उत्पाद उच्च-आवृत्ति आय समर्थन (income smoothing) "
                "है -- दुर्लभ, एकबारगी आपदा के लिए बीमा नहीं।"
            )
        return (
            "No premium or payout was computed for this policy (its location is outside "
            "coverage), so no number is fabricated here. This product is high-frequency "
            "INCOME SMOOTHING for heat wage-loss -- not cover for a rare, one-off disaster."
        )

    premium_lsmc = policy_state["premium_lsmc"]
    premium_wang = policy_state["premium_wang"]
    basis = policy_state["basis_risk"]
    shortfall_pct = basis["shortfall_rate"] * 100.0
    overpay_pct = basis["overpay_rate"] * 100.0

    if is_hindi:
        return (
            f"यह एक उच्च-आवृत्ति आय समर्थन (income smoothing) उत्पाद है -- दुर्लभ, एकबारगी आपदा के "
            f"लिए बीमा नहीं, क्योंकि गर्मी से वेतन हानि बार-बार होती है, ज़्यादातर गर्म दिनों में। "
            f"आपका प्रीमियम {premium_lsmc:.2f} (LSMC, उचित मूल्य) / {premium_wang:.2f} "
            f"(Wang जोखिम-भार सहित, बीमाकर्ता जो वास्तव में लेगा) है। ईमानदारी से बताएं तो: "
            f"चूँकि भुगतान एक सूचकांक (index) पर आधारित है, न कि आपके व्यक्तिगत नुकसान के आकलन पर, "
            f"यह {shortfall_pct:.1f}% दिनों में आपके वास्तविक नुकसान से कम (shortfall) और "
            f"{overpay_pct:.1f}% दिनों में अधिक (overpay) भुगतान कर सकता है -- यह किसी भी "
            f"पैरामीट्रिक उत्पाद की एक वास्तविक सीमा है, जिसे हम छिपाते नहीं।"
        )
    return (
        f"This is a high-frequency INCOME SMOOTHING product for heat wage-loss -- not cover "
        f"for a rare, one-off disaster, because wage loss from heat is chronic (it happens on "
        f"most heatwave days, not as a rare shock). Your premium is {premium_lsmc:.2f} "
        f"(LSMC, the fair actuarial price) / {premium_wang:.2f} (with the Wang risk load an "
        f"insurer would actually charge). Honestly: because the payout is triggered by an "
        f"INDEX rather than an assessment of your own loss, it can fall short of your actual "
        f"loss on {shortfall_pct:.1f}% of days (shortfall) and overpay it on {overpay_pct:.1f}% "
        f"of days (overpay) -- that basis-risk gap is a real limitation of any parametric "
        f"product, and we surface it rather than hide it."
    )
