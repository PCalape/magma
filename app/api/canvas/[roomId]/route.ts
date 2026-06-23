import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongo";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const { roomId } = await params;
  const db = await getDb();
  const strokes = await db
    .collection("strokes")
    .find({ room: roomId }, { projection: { _id: 0, room: 0 } })
    .sort({ _id: 1 })
    .toArray();

  return NextResponse.json({ strokes });
}
