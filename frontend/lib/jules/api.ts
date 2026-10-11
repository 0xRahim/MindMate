"use client";

/**
 * Browser client for the same-origin Jules proxy (`/api/jules*`).
 * The API key never leaves the server — the browser only talks to our
 * Next route handlers, which attach `x-goog-api-key` upstream.
 */

export type JulesState =
  | "STATE_UNSPECIFIED"
  | "QUEUED"
  | "PLANNING"
  | "AWAITING_PLAN_APPROVAL"
  | "AWAITING_USER_FEEDBACK"
  | "IN_PROGRESS"
  | "PAUSED"
  | "FAILED"
  | "COMPLETED";

export type JulesSession = {
  name: string;
  id: string;
  title?: string;
  prompt?: string;
  state?: JulesState;
  url?: string;
  outputs?: { pullRequest?: { url: string; title: string; description?: string } }[];
  createTime?: string;
  updateTime?: string;
};

export type JulesActivity = {
  name: string;
  id: string;
  originator?: string;
  description?: string;
  createTime?: string;
  planGenerated?: unknown;
  planApproved?: unknown;
  userMessaged?: { userMessage?: string };
  agentMessaged?: { agentMessage?: string };
  progressUpdated?: { title?: string; description?: string };
  sessionCompleted?: unknown;
  sessionFailed?: { reason?: string };
  artifacts?: unknown[];
};

export function julesErrorMessage(status: number, fallback: string): string {
  if (status === 401) return "Jules: API key not valid — check JULES_API_KEY.";
  if (status === 403) return "Jules: permission denied — check repo access.";
  if (status === 404) return "Jules: session/source not found.";
  if (status === 429) return "Jules: quota exceeded — try again later.";
  return fallback || `Jules: request failed (${status}).`;
}

async function req<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init);
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? julesErrorMessage(res.status, `Jules: request failed (${res.status}).`));
  }
  return (await res.json()) as T;
}

export function createJulesSession(prompt: string, title?: string, startingBranch?: string) {
  return req<JulesSession>("/api/jules/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, title, startingBranch }),
  });
}

export function listJulesSessions(pageSize = 10, pageToken?: string) {
  const q = new URLSearchParams({ pageSize: String(pageSize) });
  if (pageToken) q.set("pageToken", pageToken);
  return req<{ sessions: JulesSession[]; nextPageToken?: string }>(`/api/jules/sessions?${q}`);
}

export function getJulesSession(id: string) {
  return req<JulesSession>(`/api/jules/sessions/${encodeURIComponent(id)}`);
}

export function listJulesActivities(id: string, pageSize = 30) {
  return req<{ activities: JulesActivity[]; nextPageToken?: string }>(
    `/api/jules/sessions/${encodeURIComponent(id)}/activities?pageSize=${pageSize}`,
  );
}

export function sendJulesMessage(id: string, prompt: string) {
  return req<{}>(`/api/jules/sessions/${encodeURIComponent(id)}/message`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
}

export function deleteJulesSession(id: string) {
  return req<{}>(`/api/jules/sessions/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function listJulesSources(pageSize = 10) {
  return req<{ sources: { name: string; id: string }[]; nextPageToken?: string }>(
    `/api/jules/sources?pageSize=${pageSize}`,
  );
}
