"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

function randomId() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export default function Home() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [roomId, setRoomId] = useState("");

  function createRoom() {
    const id = randomId();
    const n = name.trim() || "Anonymous";
    router.push(`/room/${id}?name=${encodeURIComponent(n)}`);
  }

  function joinRoom() {
    const id = roomId.trim().toUpperCase();
    if (!id) return;
    const n = name.trim() || "Anonymous";
    router.push(`/room/${id}?name=${encodeURIComponent(n)}`);
  }

  return (
    <main className="min-h-screen bg-zinc-950 flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-10">
          <h1 className="text-5xl font-black text-white tracking-tight">
            collart
          </h1>
          <p className="text-zinc-400 mt-2 text-sm">
            collaborative drawing, real-time
          </p>
        </div>

        <div className="bg-zinc-900 rounded-2xl p-8 border border-zinc-800 flex flex-col gap-6">
          {/* Name */}
          <div className="flex flex-col gap-1.5">
            <label className="text-zinc-300 text-sm font-medium">
              Your name
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Anonymous"
              maxLength={24}
              className="bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5 text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500 transition-colors"
            />
          </div>

          {/* Create room */}
          <button
            onClick={createRoom}
            className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold transition-colors"
          >
            Create new room
          </button>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 border-t border-zinc-700" />
            <span className="text-zinc-500 text-sm">or</span>
            <div className="flex-1 border-t border-zinc-700" />
          </div>

          {/* Join room */}
          <div className="flex flex-col gap-1.5">
            <label className="text-zinc-300 text-sm font-medium">
              Join with room code
            </label>
            <div className="flex gap-2">
              <input
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && joinRoom()}
                placeholder="ROOM CODE"
                maxLength={8}
                className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5 text-white placeholder-zinc-500 uppercase font-mono tracking-widest focus:outline-none focus:border-blue-500 transition-colors"
              />
              <button
                onClick={joinRoom}
                className="px-5 py-2.5 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-white font-medium transition-colors"
              >
                Join
              </button>
            </div>
          </div>
        </div>

        <p className="text-center text-zinc-600 text-xs mt-6">
          Share the room code with others to draw together
        </p>
      </div>
    </main>
  );
}
