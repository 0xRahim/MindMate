import { NextResponse } from "next/server";
import { createReadStream, promises as fs } from "node:fs";
import { assetsDir, safeJoin } from "@/lib/assets";


export async function GET(_: Request, ctx: { params: Promise<{ file: string[] }> }) {
  const { file } = await ctx.params;
  const full = safeJoin(assetsDir(), "animations", file);
  if (!full) return NextResponse.json({ error: "bad path" }, { status: 400 });
  try {
    const stat = await fs.stat(full);
    if (!stat.isFile()) throw new Error("not a file");
    const stream = createReadStream(full);
    return new NextResponse(stream as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": String(stat.size),
        "Cache-Control": "public, max-age=86400, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
}
