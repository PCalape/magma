"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useSearchParams } from "next/navigation";
import PusherClient, { Channel } from "pusher-js";
import { DrawStroke, Tool, CursorUpdate } from "@/lib/types";
import Canvas, { CanvasHandle } from "@/components/Canvas";
import Toolbar from "@/components/Toolbar";
import UserCursors from "@/components/UserCursors";

type Point = { x: number; y: number };

interface ClientUpdate {
  userId: string;
  name: string;
  hue: number;
  cursor: Point;
  drawing?: { points: Point[]; color: string; size: number; tool: Tool };
}

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
  const selfIdRef = useRef("");
  const selfHueRef = useRef(210);
  const localCursorRef = useRef<Point>({ x: 0, y: 0 });
  const remoteChain = useRef<Map<string, Point>>(new Map());
  const batchRef = useRef<{ pts: Point[]; color: string; size: number; tool: Tool } | null>(null);

  useEffect(() => { selfIdRef.current = selfId; }, [selfId]);
  useEffect(() => { selfHueRef.current = selfHue; }, [selfHue]);

  // Load persisted strokes on mount
  useEffect(() => {
    fetch(`/api/canvas/${roomId}`)
      .then((r) => r.json())
      .then(({ strokes }: { strokes: DrawStroke[] }) => {
        canvasRef.current?.loadStrokes(strokes);
      });
  }, [roomId]);

  // Pusher + single 100ms flush for cursor AND drawing combined
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
      const hue = hueFromId(id);
      setSelfId(id);
      setSelfHue(hue);
      selfIdRef.current = id;
      selfHueRef.current = hue;
      setUserCount(members.count);
    });

    channel.bind("pusher:member_added", () => setUserCount((n) => n + 1));

    channel.bind("pusher:member_removed", (member: { id: string }) => {
      remoteChain.current.delete(member.id);
      setUserCount((n) => n - 1);
      setCursors((prev) => { const m = new Map(prev); m.delete(member.id); return m; });
    });

    channel.bind("draw-stroke", (payload: DrawStroke & { userId?: string }) => {
      if (payload.userId) remoteChain.current.delete(payload.userId);
      canvasRef.current?.drawStroke(payload);
    });

    channel.bind("clear-canvas", () => {
      remoteChain.current.clear();
      setClearSignal((s) => s + 1);
    });

    // One combined event handles both cursor position and live drawing points
    channel.bind("client-update", (update: ClientUpdate) => {
      // Update cursor overlay
      setCursors((prev) => {
        const m = new Map(prev);
        m.set(update.userId, { id: update.userId, x: update.cursor.x, y: update.cursor.y, name: update.name, hue: update.hue });
        return m;
      });

      // Draw live points if present
      if (update.drawing && update.drawing.points.length > 0) {
        const { points, color, size, tool } = update.drawing;
        const from = remoteChain.current.get(update.userId) ?? null;
        canvasRef.current?.drawPoints(from, points, color, size, tool);
        remoteChain.current.set(update.userId, points[points.length - 1]);
      }
    });

    // Single 100ms interval: sends cursor + any accumulated drawing points in one event
    // Stays at exactly 10 events/sec — Pusher's client event limit
    const flushTimer = setInterval(() => {
      const uid = selfIdRef.current;
      const ch = channelRef.current;
      if (!uid || !ch) return;

      const buf = batchRef.current;
      const payload: ClientUpdate = {
        userId: uid,
        name: userName,
        hue: selfHueRef.current,
        cursor: { ...localCursorRef.current },
      };

      if (buf && buf.pts.length >= 2) {
        const toSend = buf.pts;
        // Carry last point forward so next batch chains without a gap
        batchRef.current = { pts: [toSend[toSend.length - 1]], color: buf.color, size: buf.size, tool: buf.tool };
        payload.drawing = { points: toSend, color: buf.color, size: buf.size, tool: buf.tool };
      }

      ch.trigger("client-update", payload);
    }, 100);

    return () => {
      clearInterval(flushTimer);
      channel.unbind_all();
      pusher.unsubscribe(`presence-room-${roomId}`);
      pusher.disconnect();
    };
  }, [roomId, userName]);

  const handleSegment = useCallback((seg: { from: Point; to: Point; color: string; size: number; tool: Tool }) => {
    if (!batchRef.current) {
      batchRef.current = { pts: [seg.from], color: seg.color, size: seg.size, tool: seg.tool };
    }
    batchRef.current.pts.push(seg.to);
  }, []);

  const handleStroke = useCallback((stroke: DrawStroke) => {
    batchRef.current = null;
    fetch("/api/draw", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomId, userId: selfIdRef.current, stroke }),
    });
  }, [roomId]);

  const handleClear = useCallback(() => {
    batchRef.current = null;
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
    // Update refs only — the interval sends cursor position, no direct trigger here
    localCursorRef.current = { x, y };
    setLocalCursor({ x, y, visible: true });
  }, []);

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
            onSegment={handleSegment}
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
