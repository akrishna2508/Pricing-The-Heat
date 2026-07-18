import type {
  AssistantAskResponse,
  ExplainResponse,
  HeatmapResponse,
  SimulatePolicyRequest,
  SimulatePolicyResponse,
} from "./types";

export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export class ApiError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let resp: Response;
  try {
    resp = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    });
  } catch {
    throw new ApiError(`Couldn't reach the pricing server at ${API_URL}. Is the backend running?`);
  }

  let body: unknown = null;
  try {
    body = await resp.json();
  } catch {
    // Non-JSON body -- leave body null; the status-based message below still applies.
  }

  if (!resp.ok) {
    const detail =
      body && typeof body === "object" && "detail" in (body as Record<string, unknown>)
        ? String((body as { detail: unknown }).detail)
        : `Request failed (${resp.status})`;
    throw new ApiError(detail, resp.status);
  }
  return body as T;
}

export function getHeatmap(date?: string): Promise<HeatmapResponse> {
  const qs = date ? `?date=${encodeURIComponent(date)}` : "";
  return request<HeatmapResponse>(`/heatmap${qs}`);
}

export function simulatePolicy(body: SimulatePolicyRequest): Promise<SimulatePolicyResponse> {
  return request<SimulatePolicyResponse>("/simulate-policy", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function explainPolicy(policyId: string): Promise<ExplainResponse> {
  return request<ExplainResponse>(`/explain/${encodeURIComponent(policyId)}`);
}

export function assistantAsk(policyId: string, question: string): Promise<AssistantAskResponse> {
  return request<AssistantAskResponse>("/assistant/ask", {
    method: "POST",
    body: JSON.stringify({ policy_id: policyId, question }),
  });
}
