"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ApiError, assistantAsk } from "@/lib/api";
import { ErrorBanner } from "@/components/ErrorBanner";

type ChatMessage = { role: "user" | "assistant"; text: string; source?: string };

function sourceLabel(source: string): string {
  if (source === "fallback_no_key") return "templated answer -- no ANTHROPIC_API_KEY configured";
  if (source === "fallback_error") return "templated answer -- the model call failed";
  if (source === "model_ungrounded") return "answered by Claude (no policy lookup was needed)";
  return "answered by Claude, grounded in your policy state";
}

export default function AssistantPage() {
  const [policyId, setPolicyId] = useState("");
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem("lastPolicyId");
    if (saved) setPolicyId(saved);
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmedId = policyId.trim();
    const trimmedQuestion = question.trim();
    if (!trimmedId || !trimmedQuestion) return;

    setError(null);
    setLoading(true);
    setMessages((prev) => [...prev, { role: "user", text: trimmedQuestion }]);
    setQuestion("");

    try {
      const resp = await assistantAsk(trimmedId, trimmedQuestion);
      setMessages((prev) => [...prev, { role: "assistant", text: resp.answer, source: resp.source }]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't reach the assistant.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="max-w-2xl mx-auto p-4 sm:p-6">
      <h1 className="text-xl font-semibold mb-1">Ask about your policy</h1>
      <p className="text-sm text-gray-600 mb-4">
        This assistant only states numbers it looked up for your specific policy -- it never
        invents a premium or a payout figure. It works even without an API key configured (a
        deterministic, transparent fallback), so this page is always demoable.
      </p>

      <label className="block text-sm text-gray-700 mb-4">
        Policy ID
        <input
          value={policyId}
          onChange={(e) => setPolicyId(e.target.value)}
          placeholder="Simulate a policy first to get a policy_id"
          className="mt-1 w-full border border-gray-300 rounded px-3 py-2 text-sm font-mono"
        />
      </label>

      {error && (
        <div className="mb-4">
          <ErrorBanner message={error} />
        </div>
      )}

      <div className="border border-gray-200 rounded bg-white mb-4 h-96 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <p className="text-sm text-gray-400">
            Ask something like &ldquo;What is my premium?&rdquo; or &ldquo;Is this like insurance for a
            disaster?&rdquo;
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "text-right" : "text-left"}>
            <div
              className={`inline-block rounded px-3 py-2 text-sm max-w-[85%] ${
                m.role === "user" ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-900"
              }`}
            >
              {m.text}
            </div>
            {m.source && m.role === "assistant" && (
              <p className="text-[11px] text-gray-400 mt-1">{sourceLabel(m.source)}</p>
            )}
          </div>
        ))}
      </div>

      <form onSubmit={(e) => void handleSubmit(e)} className="flex gap-2">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask a question about this policy..."
          className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={loading || !policyId.trim() || !question.trim()}
          className="rounded bg-gray-900 text-white px-4 py-2 text-sm disabled:opacity-50"
        >
          {loading ? "Asking..." : "Send"}
        </button>
      </form>
    </main>
  );
}
