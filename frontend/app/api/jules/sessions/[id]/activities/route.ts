import { NextResponse } from "next/server";
import { julesFetch } from "@/lib/jules/server";

/** GET /api/jules/sessions/:id/activities — progress, messages, artifacts. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const q = new URL(req.url).searchParams;
  return julesFetch(
    `/sessions/${encodeURIComponent(id)}/activities?pageSize=${encodeURIComponent(q.get("pageSize") ?? "30")}`,
  );
}
