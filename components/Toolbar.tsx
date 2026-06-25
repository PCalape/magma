"use client";

import { Tool } from "@/lib/types";

interface ToolbarProps {
  tool: Tool;
  color: string;
  size: number;
  onToolChange: (t: Tool) => void;
  onColorChange: (c: string) => void;
  onSizeChange: (s: number) => void;
  onClear: () => void;
  userCount: number;
}

const PRESET_COLORS = [
  "#1a1a1a", "#ef4444", "#f97316", "#eab308",
  "#22c55e", "#3b82f6", "#8b5cf6", "#ec4899", "#ffffff",
];

const SIZES = [2, 5, 10, 20, 40];

export default function Toolbar({
  tool, color, size,
  onToolChange, onColorChange, onSizeChange, onClear,
  userCount,
}: ToolbarProps) {
  return (
    <div className="flex flex-col gap-4 p-4 bg-zinc-900 border-r border-zinc-700 w-20 items-center select-none shrink-0">
      {/* Tool buttons */}
      <div className="flex flex-col gap-2 w-full">
        <ToolButton
          active={tool === "pen"}
          onClick={() => onToolChange("pen")}
          title="Pen"
        >
          <PenIcon />
        </ToolButton>
        <ToolButton
          active={tool === "eraser"}
          onClick={() => onToolChange("eraser")}
          title="Eraser"
        >
          <EraserIcon />
        </ToolButton>
      </div>

      {tool === "pen" && (
        <>
          <Divider />

          {/* Color picker */}
          <div className="flex flex-col gap-2 items-center w-full">
            <label className="text-zinc-400 text-[10px] uppercase tracking-widest">Color</label>
            <input
              type="color"
              value={color}
              onChange={(e) => onColorChange(e.target.value)}
              className="w-10 h-10 rounded cursor-pointer border-2 border-zinc-600 bg-transparent p-0.5"
              title="Pick color"
            />
            <div className="flex flex-wrap gap-1 justify-center">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => onColorChange(c)}
                  title={c}
                  style={{ backgroundColor: c }}
                  className={`w-4 h-4 rounded-sm border ${color === c ? "border-white scale-125" : "border-zinc-600"} transition-transform`}
                />
              ))}
            </div>
          </div>
        </>
      )}

      <Divider />

      {/* Size picker */}
      <div className="flex flex-col gap-2 items-center w-full">
        <label className="text-zinc-400 text-[10px] uppercase tracking-widest">Size</label>
        <div className="flex flex-col gap-1.5 items-center">
          {SIZES.map((s) => (
            <button
              key={s}
              onClick={() => onSizeChange(s)}
              title={`${s}px`}
              className={`flex items-center justify-center w-10 h-6 rounded transition-colors ${
                size === s ? "bg-blue-500" : "bg-zinc-700 hover:bg-zinc-600"
              }`}
            >
              <div
                className="rounded-full bg-white"
                style={{ width: Math.min(s * 0.8, 28), height: Math.min(s * 0.8, 28) }}
              />
            </button>
          ))}
        </div>
        <input
          type="range"
          min={1}
          max={60}
          value={size}
          onChange={(e) => onSizeChange(Number(e.target.value))}
          className="w-full accent-blue-500"
          title={`${size}px`}
        />
        <span className="text-zinc-400 text-xs">{size}px</span>
      </div>

      <Divider />

      {/* Clear button */}
      <button
        onClick={onClear}
        title="Clear canvas (for everyone)"
        className="w-full py-1.5 rounded bg-red-600 hover:bg-red-500 text-white text-xs font-medium transition-colors"
      >
        Clear
      </button>

      <div className="mt-auto flex flex-col items-center gap-1">
        <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
        <span className="text-zinc-400 text-[10px]">{userCount} online</span>
      </div>
    </div>
  );
}

function ToolButton({ active, onClick, title, children }: {
  active: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`w-full flex items-center justify-center h-10 rounded transition-colors ${
        active ? "bg-blue-500 text-white" : "bg-zinc-700 text-zinc-300 hover:bg-zinc-600"
      }`}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div className="w-full border-t border-zinc-700" />;
}

function PenIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  );
}

function EraserIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 20H7L3 16l13-13 6 6-2 2" />
      <path d="M6.34 14.34 17.66 3.66" />
    </svg>
  );
}
