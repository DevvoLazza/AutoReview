import { checkOrigin, currentToken, demoMode } from "@/lib/session";

async function proxy(request: Request, context: { params: Promise<{ path: string[] }> }) {
  try {
    checkOrigin(request);
    const { path } = await context.params;
    const allowed = [
      "reviews",
      "knowledge",
      "automation-rules",
      "workspace",
      "locations",
      "audit",
      "devices",
      "session",
      "integrations",
    ];
    if (
      !path.length ||
      !allowed.includes(path[0] ?? "") ||
      path.some((part) => part === "." || part === ".." || /[\\/]/.test(part))
    )
      return Response.json({ message: "Endpoint non disponibile" }, { status: 404 });
    if (path[0] === "integrations" && ["callback"].includes(path[2] ?? ""))
      return Response.json({ message: "Endpoint non disponibile" }, { status: 404 });
    const token = demoMode() ? null : await currentToken();
    if (!demoMode() && !token)
      return Response.json({ message: "Sessione scaduta: accedi nuovamente" }, { status: 401 });
    const base = (process.env.API_INTERNAL_URL ?? "http://localhost:4100/v1").replace(/\/$/, "");
    const url = `${base}/${path.map(encodeURIComponent).join("/")}${new URL(request.url).search}`;
    const response = await fetch(url, {
      method: request.method,
      headers: {
        "Content-Type": "application/json",
        ...(token
          ? { Authorization: `Bearer ${token}` }
          : { "x-role": "owner", "x-mfa-verified": "true" }),
      },
      body: request.method === "GET" ? undefined : await request.text(),
      cache: "no-store",
      signal: AbortSignal.timeout(95_000),
    });
    return new Response(await response.text(), {
      status: response.status,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json(
      { message: "Servizio non disponibile o sessione scaduta. Riprova o accedi nuovamente." },
      { status: 503 },
    );
  }
}
export { proxy as GET, proxy as POST };
