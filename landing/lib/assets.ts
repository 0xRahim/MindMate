import path from "node:path";

/** Host dir for the large 3D assets (VRM / FBX / GLB).
 *  Dev default: repo's main/ next to landing/. Container: /assets (bind-mounted). */
export function assetsDir(): string {
  const env = process.env.ASSETS_DIR;
  if (env) return env;
  // landing/ -> ../main
  return path.resolve(process.cwd(), "..", "main");
}

export function safeJoin(root: string, sub: string, file: string[]): string | null {
  const resolved = path.resolve(root, sub, ...file);
  if (!resolved.startsWith(path.resolve(root, sub) + path.sep)) return null;
  return resolved;
}
