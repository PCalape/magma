"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { getSocket } from "@/lib/socket";
import { Tool, CursorUpdate, UserInfo } from "@/lib/types";
import Canvas from "@/components/Canvas";
import Toolbar from "@/components/Toolbar";
import UserCursors from "@/components/UserCursors";

export default function RoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const searchParams = useSearchParams();
  const userName = searchParams.get("name") || "Anonymous";

  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState("#1a1a1a");
  const [size, setSize] = useState(5);
  const [cursors, setCursors] = useState<Map<string, CursorUpdate>>(new Map());
  const [userCount, setUserCount] = useState(1);
  const [selfInfo, setSelfInfo] = useState<UserInfo | null>(null);
  const [clearSignal, setClearSignal] = useState(0);
  const [copied, setCopied] = useState(false);
  const [localCursor, setLocalCursor] = useState<{
    x: number;
    y: number;
    visible: boolean;
  }>({
    x: 0,
    y: 0,
    visible: false,
  });

  const socket = getSocket();
  const joined = useRef(false);

  useEffect(() => {
    if (joined.current) return;
    joined.current = true;
    socket.emit("join-room", { roomId, name: userName });

    socket.on("self-info", (info: UserInfo) => setSelfInfo(info));
    socket.on("users-update", (users: UserInfo[]) =>
      setUserCount(users.length),
    );

    return () => {
      socket.off("self-info");
      socket.off("users-update");
    };
  }, [roomId, userName, socket]);

  const handleClear = useCallback(() => {
    socket.emit("clear-canvas");
    setClearSignal((s) => s + 1);
  }, [socket]);

  // Listen for remote clear to update local signal
  useEffect(() => {
    socket.on("clear-canvas", () => setClearSignal((s) => s + 1));
    return () => {
      socket.off("clear-canvas");
    };
  }, [socket]);

  function copyRoomCode() {
    navigator.clipboard.writeText(roomId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="flex flex-col h-screen bg-zinc-950 overflow-hidden">
      {/* Top bar */}
      <header className="flex items-center justify-between px-4 py-2 bg-zinc-900 border-b border-zinc-700 shrink-0">
        <span className="text-white font-black text-lg tracking-tight">
          collart
        </span>

        <div className="flex items-center gap-3">
          {selfInfo && (
            <span
              className="text-xs font-medium px-2 py-0.5 rounded-full"
              style={{
                backgroundColor: `hsl(${selfInfo.hue}, 70%, 45%)`,
                color: "white",
              }}
            >
              {selfInfo.name}
            </span>
          )}
          <button
            onClick={copyRoomCode}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-mono transition-colors"
            title="Copy room code"
          >
            <span className="tracking-widest">{roomId}</span>
            <span className="text-zinc-500 text-xs">
              {copied ? "Copied!" : "Copy"}
            </span>
          </button>
        </div>
      </header>

      {/* Main area */}
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

        {/* Canvas area */}
        <div
          className="relative flex-1 bg-white overflow-hidden"
          style={{ cursor: "none" }}
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            setLocalCursor({
              x: e.clientX - rect.left,
              y: e.clientY - rect.top,
              visible: true,
            });
          }}
          onMouseLeave={() => setLocalCursor((c) => ({ ...c, visible: false }))}
        >
          <Canvas
            socket={socket}
            tool={tool}
            color={color}
            size={size}
            onCursorsChange={setCursors}
            clearSignal={clearSignal}
          />
          <UserCursors cursors={cursors} />

          {/* Brush size preview */}
          {localCursor.visible && (
            <div
              className="absolute pointer-events-none rounded-full"
              style={{
                width: size,
                height: size,
                left: localCursor.x,
                top: localCursor.y,
                transform: "translate(-50%, -50%)",
                border: "1.5px solid rgba(0,0,0,0.7)",
                boxShadow: "0 0 0 1px rgba(255,255,255,0.8)",
                background:
                  tool === "eraser" ? "rgba(255,255,255,0.3)" : `${color}33`,
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
