"use client";

import { CursorUpdate } from "@/lib/types";

interface Props {
  cursors: Map<string, CursorUpdate>;
}

export default function UserCursors({ cursors }: Props) {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {Array.from(cursors.values()).map((c) => (
        <div
          key={c.id}
          className="absolute flex items-start gap-1 transition-transform duration-75"
          style={{ transform: `translate(${c.x}px, ${c.y}px)` }}
        >
          {/* Cursor arrow */}
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M1 1l5.5 13 2.5-5.5L14.5 6 1 1z"
              fill={`hsl(${c.hue}, 80%, 60%)`}
              stroke="white"
              strokeWidth="1"
            />
          </svg>
          {/* Name label */}
          <span
            className="text-white text-[11px] font-medium px-1.5 py-0.5 rounded-full whitespace-nowrap shadow"
            style={{ backgroundColor: `hsl(${c.hue}, 70%, 45%)` }}
          >
            {c.name}
          </span>
        </div>
      ))}
    </div>
  );
}
