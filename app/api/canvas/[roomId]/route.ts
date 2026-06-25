import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongo";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const { roomId } = await params;
  const db = await getDb();
  const doc = await db.collection("rooms").findOne(
    { room: roomId },
    { projection: { _id: 0, strokes: 1 } }
  );

  return NextResponse.json({ strokes: doc?.strokes ?? [] });
}
