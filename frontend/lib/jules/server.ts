import { NextResponse } from "next/server";

const BASE = "https://jules.googleapis.com/v1alpha";
const TIMEOUT_MS = 15000;

export function julesConfig() {
  return {
    apiKey: process.env.JULES_API_KEY ?? "",
    source: process.env.JULES_SOURCE ?? "",
    startingBranch: process.env.JULES_STARTING_BRANCH ?? "main",
  };
}

function upstreamError(status: number): string {
  if (status === 401) return "Jules API key not valid.";
  if (status === 403) return "Jules permission denied — check repo access.";
  if (status === 404) return "Jules resource not found.";
  if (status === 429) return "Jules quota exceeded — try again later.";
  return `Jules request failed (${status}).`;
}

/** Server-side GET/POST passthrough to Jules. Key never leaves the server. */
export async function julesFetch(path: string, init?: RequestInit) {
  const { apiKey } = julesConfig();
  if (!apiKey) {
    return NextResponse.json({ error: "Jules not configured — set JULES_API_KEY." }, { status: 503 });
  }
  let upstream: Response;
  try {
    upstream = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
        "x-goog-api-key": apiKey,
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    const msg = e instanceof Error && e.name === "TimeoutError"
      ? "Jules request timed out."
      : `Jules unreachable: ${e instanceof Error ? e.message : "network error"}`;
    return NextResponse.json({ error: msg }, { status: 504 });
  }
  const text = await upstream.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!upstream.ok) {
    const msg = (data as { error?: { message?: string } } | null)?.error?.message
      ?? upstreamError(upstream.status);
    return NextResponse.json({ error: msg }, { status: upstream.status });
  }
  return NextResponse.json(data ?? {});
}
