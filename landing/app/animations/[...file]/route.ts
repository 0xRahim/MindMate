import { NextResponse } from "next/server";
import { createReadStream, promises as fs } from "node:fs";
import { assetsDir, publicDir, safeJoin } from "@/lib/assets";


export async function GET(_: Request, ctx: { params: Promise<{ file: string[] }> }) {
  const { file } = await ctx.params;
  // Prefer files bundled in public/ (self-contained on Vercel);
  // fall back to the external assets dir (local dev ../main, Docker /assets).
  const candidates = [safeJoin(publicDir(), "animations", file), safeJoin(assetsDir(), "animations", file)];
  for (const full of candidates) {
    if (!full) continue;
    try {
      const stat = await fs.stat(full);
      if (!stat.isFile()) continue;
      const stream = createReadStream(full);
      return new NextResponse(stream as unknown as BodyInit, {
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Length": String(stat.size),
          "Cache-Control": "public, max-age=86400, immutable",
        },
      });
    } catch {
      continue;
    }
  }
  const bad = !candidates.some((c) => c !== null);
  return NextResponse.json({ error: bad ? "bad path" : "not found" }, { status: bad ? 400 : 404 });
}
