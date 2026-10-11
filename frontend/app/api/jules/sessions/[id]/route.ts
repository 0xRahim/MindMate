import { NextResponse } from "next/server";
import { julesFetch } from "@/lib/jules/server";

/** GET /api/jules/sessions/:id — poll session state/outputs. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  return julesFetch(`/sessions/${encodeURIComponent(id)}`);
}

/** DELETE /api/jules/sessions/:id — cancel a task. */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  return julesFetch(`/sessions/${encodeURIComponent(id)}`, { method: "DELETE" });
}
