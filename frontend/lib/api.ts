import type {
  ExplainResponse,
  HeatmapResponse,
  ResolveLocationRequest,
  ResolveLocationResponse,
  SimulatePolicyRequest,
  SimulatePolicyResponse,
  StateListEntry,
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

// The backend's free-tier hosting (Render) sleeps after inactivity; the
// first request after a sleep can take 30-60s to cold-boot. Plain fetch()
// has no default timeout, so without this a truly-hung connection would
// leave a page's loading spinner running forever with no error ever shown.
// 90s comfortably exceeds a normal cold boot while still eventually
// surfacing a visible error for a genuinely dead backend.
const REQUEST_TIMEOUT_MS = 90_000;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let resp: Response;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    resp = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new ApiError(
        `The pricing server at ${API_URL} took too long to respond. If this is the first ` +
          `request in a while, the free-tier server may still be waking up -- please try again.`,
      );
    }
    throw new ApiError(`Couldn't reach the pricing server at ${API_URL}. Is the backend running?`);
  } finally {
    clearTimeout(timeoutId);
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

export function getStates(): Promise<StateListEntry[]> {
  return request<StateListEntry[]>("/states");
}

export function resolveLocation(body: ResolveLocationRequest): Promise<ResolveLocationResponse> {
  return request<ResolveLocationResponse>("/resolve-location", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function getHeatmap(stateKey: string, date?: string): Promise<HeatmapResponse> {
  const qs = new URLSearchParams({ state_key: stateKey, ...(date ? { date } : {}) });
  return request<HeatmapResponse>(`/heatmap?${qs.toString()}`);
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
