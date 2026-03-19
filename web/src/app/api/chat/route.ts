import { auth } from "@/lib/auth";
import { NextRequest } from "next/server";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const session = await auth();
  const accessToken = (session as unknown as Record<string, unknown>)?.accessToken as string | undefined;

  if (!session || !accessToken) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const body = await req.json();
  const serverUrl = process.env.ANALYZE_SERVER_URL ?? "http://localhost:3001";

  const serverRes = await fetch(`${serverUrl}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5 * 60 * 1000),
  });

  if (!serverRes.ok || !serverRes.body) {
    return new Response(JSON.stringify({ error: "Chat server error" }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(serverRes.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
