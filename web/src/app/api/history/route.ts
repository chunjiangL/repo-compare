import { auth } from "@/lib/auth";
import { NextRequest } from "next/server";

const SERVER_URL = process.env.ANALYZE_SERVER_URL ?? "http://localhost:3001";

async function getUserId(): Promise<string | null> {
 const session = await auth();
 // Use GitHub username as userId
 return session?.user?.name ?? null;
}

export async function GET() {
 const userId = await getUserId();
 if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

 const res = await fetch(`${SERVER_URL}/history?userId=${encodeURIComponent(userId)}`);
 return Response.json(await res.json());
}

export async function POST(req: NextRequest) {
 const userId = await getUserId();
 if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

 const body = await req.json();
 const res = await fetch(`${SERVER_URL}/history`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ ...body, userId }),
 });
 return Response.json(await res.json());
}
