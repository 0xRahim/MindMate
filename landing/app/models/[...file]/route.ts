import { NextResponse } from "next/server";
import { createReadStream, promises as fs } from "node:fs";
import { assetsDir, publicDir, safeJoin } from "@/lib/assets";


const MIME: Record<string, string> = {
  ".vrm": "model/gltf-binary",
  ".fbx": "application/octet-stream",
  ".glb": "model/gltf-binary",
};

function serve(sub: string, file: string[]) {
  return async () => {
    // Prefer files bundled in public/ (self-contained on Vercel);
    // fall back to the external assets dir (local dev ../main, Docker /assets).
    const candidates = [safeJoin(publicDir(), sub, file), safeJoin(assetsDir(), sub, file)];
    for (const full of candidates) {
      if (!full) continue;
      try {
        const stat = await fs.stat(full);
        if (!stat.isFile()) continue;
        const ext = full.slice(full.lastIndexOf(".")).toLowerCase();
        const stream = createReadStream(full);
        return new NextResponse(stream as unknown as BodyInit, {
          headers: {
            "Content-Type": MIME[ext] ?? "application/octet-stream",
            "Content-Length": String(stat.size),
            "Cache-Control": "public, max-age=86400, immutable",
          },
        });
      } catch {
        continue;
      }
    }
    // No candidate resolved (bad path) or no file found in either dir.
    const bad = !candidates.some((c) => c !== null);
    return NextResponse.json({ error: bad ? "bad path" : "not found" }, { status: bad ? 400 : 404 });
  };
}

export async function GET(_: Request, ctx: { params: Promise<{ file: string[] }> }) {
  const { file } = await ctx.params;
  return serve("models", file)();
}
