import { apiBase, isSameOrigin, readSession } from "@/lib/session";
const allowed = /^(me|profile|privacy\/requests|providers|providers\/[a-zA-Z0-9-]+(?:\/(?:availability|services))?|appointments|navigator\/assignments|admin\/aggregate)$/;
export async function GET(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const path = (await params).path.join("/");
  if (!allowed.test(path)) return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  const session = await readSession();
  if (!session) return Response.json({ error: "SESSION_EXPIRED" }, { status: 401 });
  const source = new URL(request.url);
  const target = new URL(`/v1/${path}`, apiBase());
  for (const name of ["cursor", "limit"]) if (source.searchParams.has(name)) target.searchParams.set(name, source.searchParams.get(name)!);
  try {
    const response = await fetch(target, { headers: { Authorization: `Bearer ${session.accessToken}` }, cache: "no-store", signal: AbortSignal.timeout(10_000) });
    if (!response.ok) return Response.json({ error: response.status === 401 ? "SESSION_EXPIRED" : response.status === 403 ? "ACCESS_DENIED" : "SERVICE_UNAVAILABLE" }, { status: [401, 403, 404].includes(response.status) ? response.status : 503 });
    return Response.json(await response.json(), { headers: { "Cache-Control": "no-store, private" } });
  } catch { return Response.json({ error: "SERVICE_UNAVAILABLE" }, { status: 503 }); }
}

export async function POST(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  if (!isSameOrigin(request)) return new Response(null, { status: 403 });
  const path = (await params).path.join("/");
  if (!/^(privacy\/requests|appointments|appointments\/[a-zA-Z0-9-]+\/(?:confirm|cancel))$/.test(path)) return new Response(null, { status: 404 });
  const session = await readSession();
  if (!session) return Response.json({ error: "SESSION_EXPIRED" }, { status: 401 });
  try {
    const { readLimitedJson } = await import("@/lib/request-body");
    const body = JSON.stringify(await readLimitedJson(request, 8192));
    const response = await fetch(`${apiBase()}/v1/${path}`, { method: "POST", headers: { Authorization: `Bearer ${session.accessToken}`, "Content-Type": "application/json" }, body, cache: "no-store", signal: AbortSignal.timeout(10_000) });
    const result = await response.json();
    return Response.json(response.ok ? result : { error: typeof result.error === "string" ? result.error : "REQUEST_FAILED" }, { status: response.status, headers: { "Cache-Control": "no-store, private" } });
  } catch { return Response.json({ error: "SERVICE_UNAVAILABLE" }, { status: 503 }); }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  if (!isSameOrigin(request)) return new Response(null, { status: 403 });
  if ((await params).path.join("/") !== "profile") return new Response(null, { status: 404 });
  const session = await readSession();
  if (!session) return Response.json({ error: "SESSION_EXPIRED" }, { status: 401 });
  try {
    const { readLimitedJson } = await import("@/lib/request-body");
    const body = await readLimitedJson(request, 1024);
    const response = await fetch(`${apiBase()}/v1/profile`, { method: "PATCH", headers: { Authorization: `Bearer ${session.accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store", signal: AbortSignal.timeout(10_000) });
    return Response.json(await response.json(), { status: response.status, headers: { "Cache-Control": "no-store, private" } });
  } catch { return Response.json({ error: "REQUEST_FAILED" }, { status: 503 }); }
}
