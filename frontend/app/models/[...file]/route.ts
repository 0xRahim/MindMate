import { NextResponse } from "next/server";
import { createReadStream, promises as fs } from "node:fs";
import { assetsDir, safeJoin } from "@/lib/assets";


const MIME: Record<string, string> = {
  ".vrm": "model/gltf-binary",
  ".fbx": "application/octet-stream",
  ".glb": "model/gltf-binary",
};

function serve(sub: string, file: string[]) {
  return async () => {
    const full = safeJoin(assetsDir(), sub, file);
    if (!full) return NextResponse.json({ error: "bad path" }, { status: 400 });
    try {
      const stat = await fs.stat(full);
      if (!stat.isFile()) throw new Error("not a file");
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
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
  };
}

export async function GET(_: Request, ctx: { params: Promise<{ file: string[] }> }) {
  const { file } = await ctx.params;
  return serve("models", file)();
}
