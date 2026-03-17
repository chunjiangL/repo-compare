import { auth } from "@/lib/auth";
import { NextRequest } from "next/server";

// Allow up to 10 minutes for the LLM deep analysis
export const maxDuration = 600;

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
  const { urls } = body as { urls: string[] };

  if (!urls || !Array.isArray(urls) || urls.length === 0) {
    return new Response(JSON.stringify({ error: "urls array is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const serverUrl = process.env.ANALYZE_SERVER_URL ?? "http://localhost:3001";

  // Phase 2 agent can take 5+ minutes — no timeout on this fetch
  const serverRes = await fetch(`${serverUrl}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ urls, githubToken: accessToken }),
    signal: AbortSignal.timeout(10 * 60 * 1000), // 10 minute timeout
  });

  if (!serverRes.ok || !serverRes.body) {
    return new Response(JSON.stringify({ error: "Analysis server error" }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Pipe the SSE stream from the Express server back to the client
  return new Response(serverRes.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
