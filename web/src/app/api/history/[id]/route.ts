import { auth } from "@/lib/auth";
import { NextRequest } from "next/server";

const SERVER_URL = process.env.ANALYZE_SERVER_URL ?? "http://localhost:3001";

async function getUserId(): Promise<string | null> {
 const session = await auth();
 return session?.user?.name ?? null;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
 const userId = await getUserId();
 if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

 const { id } = await params;
 const res = await fetch(`${SERVER_URL}/history/${id}?userId=${encodeURIComponent(userId)}`);
 if (!res.ok) return Response.json({ error: "Not found" }, { status: 404 });
 return Response.json(await res.json());
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
 const userId = await getUserId();
 if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

 const { id } = await params;
 const res = await fetch(`${SERVER_URL}/history/${id}?userId=${encodeURIComponent(userId)}`, {
  method: "DELETE",
 });
 return Response.json(await res.json());
}
