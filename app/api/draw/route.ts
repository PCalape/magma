import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongo";
import { getPusher } from "@/lib/pusher-server";

export async function POST(req: NextRequest) {
  const { roomId, stroke } = await req.json();

  const db = await getDb();
  await db.collection("strokes").insertOne({ room: roomId, ...stroke });

  await getPusher().trigger(`presence-room-${roomId}`, "draw-stroke", stroke);

  return NextResponse.json({ ok: true });
}
