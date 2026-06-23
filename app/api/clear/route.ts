import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongo";
import { getPusher } from "@/lib/pusher-server";

export async function POST(req: NextRequest) {
  const { roomId } = await req.json();

  const db = await getDb();
  await db.collection("strokes").deleteMany({ room: roomId });

  await getPusher().trigger(`presence-room-${roomId}`, "clear-canvas", {});

  return NextResponse.json({ ok: true });
}
