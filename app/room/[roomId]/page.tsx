"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useSearchParams } from "next/navigation";
import PusherClient, { Channel } from "pusher-js";
import { DrawStroke, Tool, CursorUpdate } from "@/lib/types";
import Canvas, { CanvasHandle } from "@/components/Canvas";
import Toolbar from "@/components/Toolbar";
import UserCursors from "@/components/UserCursors";

function hueFromId(id: string): number {
  const hues = [210, 0, 120, 270, 30, 180, 300, 60];
  let hash = 0;
  for (const c of id) hash = (hash * 31 + c.charCodeAt(0)) & 0xffff;
  return hues[hash % hues.length];
}

export default function RoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const searchParams = useSearchParams();
  const userName = searchParams.get("name") || "Anonymous";

  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState("#1a1a1a");
  const [size, setSize] = useState(5);
  const [cursors, setCursors] = useState<Map<string, CursorUpdate>>(new Map());
  const [userCount, setUserCount] = useState(1);
  const [selfId, setSelfId] = useState("");
  const [selfHue, setSelfHue] = useState(210);
  const [clearSignal, setClearSignal] = useState(0);
  const [copied, setCopied] = useState(false);
  const [localCursor, setLocalCursor] = useState({ x: 0, y: 0, visible: false });

  const canvasRef = useRef<CanvasHandle>(null);
  const channelRef = useRef<Channel | null>(null);

  // Load persisted strokes on mount
  useEffect(() => {
    fetch(`/api/canvas/${roomId}`)
      .then((r) => r.json())
      .then(({ strokes }: { strokes: DrawStroke[] }) => {
        canvasRef.current?.loadStrokes(strokes);
      });
  }, [roomId]);

  // Pusher presence channel
  useEffect(() => {
    const pusher = new PusherClient(process.env.NEXT_PUBLIC_PUSHER_KEY!, {
      cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
      channelAuthorization: {
        endpoint: "/api/pusher/auth",
        transport: "ajax",
        params: { name: userName },
      },
    });

    const channel = pusher.subscribe(`presence-room-${roomId}`) as Channel & {
      members: { me: { id: string }; count: number };
    };
    channelRef.current = channel;

    channel.bind("pusher:subscription_succeeded", (members: { me: { id: string }; count: number }) => {
      const id = members.me.id;
      setSelfId(id);
      setSelfHue(hueFromId(id));
      setUserCount(members.count);
    });

    channel.bind("pusher:member_added", () => setUserCount((n) => n + 1));

    channel.bind("pusher:member_removed", (member: { id: string }) => {
      setUserCount((n) => n - 1);
      setCursors((prev) => { const m = new Map(prev); m.delete(member.id); return m; });
    });

    channel.bind("draw-stroke", (stroke: DrawStroke) => {
      canvasRef.current?.drawStroke(stroke);
    });

    channel.bind("clear-canvas", () => {
      setClearSignal((s) => s + 1);
    });

    channel.bind("client-cursor-move", (update: CursorUpdate) => {
      setCursors((prev) => { const m = new Map(prev); m.set(update.id, update); return m; });
    });

    return () => {
      channel.unbind_all();
      pusher.unsubscribe(`presence-room-${roomId}`);
      pusher.disconnect();
    };
  }, [roomId, userName]);

  const handleStroke = useCallback((stroke: DrawStroke) => {
    fetch("/api/draw", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomId, stroke }),
    });
  }, [roomId]);

  const handleClear = useCallback(() => {
    fetch("/api/clear", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomId }),
    });
    setClearSignal((s) => s + 1);
  }, [roomId]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setLocalCursor({ x, y, visible: true });

    if (channelRef.current && selfId) {
      channelRef.current.trigger("client-cursor-move", {
        id: selfId, x, y,
        name: userName,
        hue: selfHue,
      });
    }
  }, [selfId, userName, selfHue]);

  function copyRoomCode() {
    navigator.clipboard.writeText(roomId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="flex flex-col h-screen bg-zinc-950 overflow-hidden">
      <header className="flex items-center justify-between px-4 py-2 bg-zinc-900 border-b border-zinc-700 shrink-0">
        <span className="text-white font-black text-lg tracking-tight">collart</span>
        <div className="flex items-center gap-3">
          {selfId && (
            <span
              className="text-xs font-medium px-2 py-0.5 rounded-full"
              style={{ backgroundColor: `hsl(${selfHue}, 70%, 45%)`, color: "white" }}
            >
              {userName}
            </span>
          )}
          <button
            onClick={copyRoomCode}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-mono transition-colors"
            title="Copy room code"
          >
            <span className="tracking-widest">{roomId}</span>
            <span className="text-zinc-500 text-xs">{copied ? "Copied!" : "Copy"}</span>
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <Toolbar
          tool={tool}
          color={color}
          size={size}
          onToolChange={setTool}
          onColorChange={setColor}
          onSizeChange={setSize}
          onClear={handleClear}
          userCount={userCount}
        />

        <div
          className="relative flex-1 bg-white overflow-hidden"
          style={{ cursor: "none" }}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setLocalCursor((c) => ({ ...c, visible: false }))}
        >
          <Canvas
            ref={canvasRef}
            tool={tool}
            color={color}
            size={size}
            onStroke={handleStroke}
            clearSignal={clearSignal}
          />
          <UserCursors cursors={cursors} />

          {localCursor.visible && (
            <div
              className="absolute pointer-events-none rounded-full"
              style={{
                width: Math.max(size, 4),
                height: Math.max(size, 4),
                left: localCursor.x,
                top: localCursor.y,
                transform: "translate(-50%, -50%)",
                border: "1.5px solid rgba(0,0,0,0.7)",
                boxShadow: "0 0 0 1px rgba(255,255,255,0.8)",
                background: tool === "eraser" ? "rgba(255,255,255,0.3)" : `${color}33`,
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
