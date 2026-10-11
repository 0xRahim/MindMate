import { NextResponse } from "next/server";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { assetsDir, publicDir } from "@/lib/assets";


async function listFbx(dir: string): Promise<string[]> {
  try {
    return (await readdir(dir)).filter((f) => f.toLowerCase().endsWith(".fbx")).sort();
  } catch {
    return [];
  }
}

export async function GET() {
  // Prefer files bundled in public/ (self-contained on Vercel);
  // fall back to the external assets dir (local dev ../main, Docker /assets).
  let files = await listFbx(path.join(publicDir(), "animations"));
  if (!files.length) files = await listFbx(path.join(assetsDir(), "animations"));
  return NextResponse.json(files.map((name) => ({ name, url: `/animations/${encodeURIComponent(name)}` })));
}
