import { NextResponse } from "next/server";
import { julesFetch } from "@/lib/jules/server";

/** POST /api/jules/sessions/:id/message — send follow-up instructions. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  let body: { prompt?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (!(body.prompt ?? "").trim()) return NextResponse.json({ error: "prompt required" }, { status: 400 });
  return julesFetch(`/sessions/${encodeURIComponent(id)}:sendMessage`, {
    method: "POST",
    body: JSON.stringify({ prompt: body.prompt!.trim() }),
  });
}
