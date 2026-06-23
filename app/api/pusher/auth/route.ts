import { NextRequest, NextResponse } from "next/server";
import { getPusher } from "@/lib/pusher-server";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const params = new URLSearchParams(body);
  const socket_id = params.get("socket_id")!;
  const channel_name = params.get("channel_name")!;
  const name = params.get("name") || "Anonymous";

  const userId = `u_${Math.random().toString(36).slice(2, 10)}`;

  const auth = getPusher().authorizeChannel(socket_id, channel_name, {
    user_id: userId,
    user_info: { name },
  });

  return NextResponse.json(auth);
}
