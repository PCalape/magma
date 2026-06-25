import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongo";
import { getPusher } from "@/lib/pusher-server";

export async function POST(req: NextRequest) {
  const { roomId, stroke } = await req.json();

  const db = await getDb();
  // Single document per room — atomic push + cap in one operation
  await db.collection("rooms").updateOne(
    { room: roomId },
    { $push: { strokes: { $each: [stroke], $slice: -5000 } } } as object,
    { upsert: true }
  );

  await getPusher().trigger(`presence-room-${roomId}`, "draw-stroke", stroke);

  return NextResponse.json({ ok: true });
}
