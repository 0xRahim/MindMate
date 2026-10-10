import { NextResponse } from "next/server";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { assetsDir } from "@/lib/assets";


export async function GET() {
  const dir = path.join(assetsDir(), "models");
  let files: string[] = [];
  try {
    files = (await readdir(dir)).filter((f) => f.toLowerCase().endsWith(".vrm")).sort();
  } catch {
    files = [];
  }
  return NextResponse.json(files.map((name) => ({ name, url: `/models/${encodeURIComponent(name)}` })));
}
