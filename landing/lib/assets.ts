import path from "node:path";

/** Host dir for the large 3D assets (VRM / FBX / GLB).
 *  Dev default: repo's main/ next to landing/. Container: /assets (bind-mounted). */
export function assetsDir(): string {
  const env = process.env.ASSETS_DIR;
  if (env) return env;
  // landing/ -> ../main
  return path.resolve(process.cwd(), "..", "main");
}

/** Bundled web assets (landing/public). Preferred on hosts like Vercel
 *  where neither ASSETS_DIR nor ../main exists — the deployment is
 *  self-contained because the VRM/FBX files are committed under public/. */
export function publicDir(): string {
  return path.resolve(process.cwd(), "public");
}

export function safeJoin(root: string, sub: string, file: string[]): string | null {
  const resolved = path.resolve(root, sub, ...file);
  if (!resolved.startsWith(path.resolve(root, sub) + path.sep)) return null;
  return resolved;
}
