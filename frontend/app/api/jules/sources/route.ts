import { julesFetch } from "@/lib/jules/server";

/** GET /api/jules/sources — list connected repos (to discover JULES_SOURCE). */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const params = new URLSearchParams();
  params.set("pageSize", q.get("pageSize") ?? "10");
  const pageToken = q.get("pageToken");
  if (pageToken) params.set("pageToken", pageToken);
  const filter = q.get("filter");
  if (filter) params.set("filter", filter);
  return julesFetch(`/sources?${params}`);
}
