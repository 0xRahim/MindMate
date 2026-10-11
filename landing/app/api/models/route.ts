import { NextResponse } from "next/server";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { assetsDir, publicDir } from "@/lib/assets";


async function listVrm(dir: string): Promise<string[]> {
  try {
    return (await readdir(dir)).filter((f) => f.toLowerCase().endsWith(".vrm")).sort();
  } catch {
    return [];
  }
}

export async function GET() {
  // Prefer files bundled in public/ (self-contained on Vercel);
  // fall back to the external assets dir (local dev ../main, Docker /assets).
  let files = await listVrm(path.join(publicDir(), "models"));
  if (!files.length) files = await listVrm(path.join(assetsDir(), "models"));
  return NextResponse.json(files.map((name) => ({ name, url: `/models/${encodeURIComponent(name)}` })));
}
