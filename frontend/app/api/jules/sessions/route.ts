import { NextResponse } from "next/server";
import { julesConfig, julesFetch } from "@/lib/jules/server";
import { stripTaskPrefix } from "@/lib/jules/tasks";

/** POST /api/jules/sessions — create a long agentic task (AUTO_CREATE_PR, auto-approved plans). */
export async function POST(req: Request) {
  const { apiKey, source, startingBranch } = julesConfig();
  if (!apiKey) {
    return NextResponse.json({ error: "Jules not configured — set JULES_API_KEY." }, { status: 503 });
  }
  let body: { prompt?: string; title?: string; startingBranch?: string; source?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const prompt = stripTaskPrefix((body.prompt ?? "").trim());
  if (!prompt) return NextResponse.json({ error: "prompt required" }, { status: 400 });
  const src = (body.source ?? source).trim();
  if (!src) {
    return NextResponse.json(
      { error: "No Jules source — set JULES_SOURCE or pick one from GET /api/jules/sources." },
      { status: 400 },
    );
  }
  return julesFetch("/sessions", {
    method: "POST",
    body: JSON.stringify({
      prompt,
      title: (body.title ?? prompt.slice(0, 80)).trim() || "MindMate task",
      sourceContext: {
        source: src,
        githubRepoContext: { startingBranch: (body.startingBranch ?? startingBranch).trim() || "main" },
      },
      automationMode: "AUTO_CREATE_PR",
    }),
  });
}

/** GET /api/jules/sessions?pageSize=&pageToken= — list sessions. */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const pageSize = q.get("pageSize") ?? "10";
  const pageToken = q.get("pageToken");
  const path = `/sessions?pageSize=${encodeURIComponent(pageSize)}${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`;
  return julesFetch(path);
}
