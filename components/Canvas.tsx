"use client";

import { useEffect, useRef, useCallback } from "react";
import { DrawStroke, Tool, CursorUpdate } from "@/lib/types";
import { Socket } from "socket.io-client";

interface Props {
  socket: Socket;
  tool: Tool;
  color: string;
  size: number;
  onCursorsChange: (updater: (prev: Map<string, CursorUpdate>) => Map<string, CursorUpdate>) => void;
  clearSignal: number;
}

export default function Canvas({ socket, tool, color, size, onCursorsChange, clearSignal }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);
  const currentStroke = useRef<{ x: number; y: number }[]>([]);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);

  // Client-side stroke log — source of truth for redraws on resize/clear
  const allStrokes = useRef<DrawStroke[]>([]);

  // ---------- canvas helpers ----------

  function getCtx() {
    const canvas = canvasRef.current;
    return canvas ? canvas.getContext("2d") : null;
  }

  function canvasPoint(e: MouseEvent | TouchEvent): { x: number; y: number } {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  }

  function drawSegment(
    ctx: CanvasRenderingContext2D,
    from: { x: number; y: number },
    to: { x: number; y: number },
    strokeColor: string,
    strokeSize: number,
    strokeTool: Tool
  ) {
    ctx.beginPath();
    ctx.globalCompositeOperation = strokeTool === "eraser" ? "destination-out" : "source-over";
    ctx.strokeStyle = strokeTool === "eraser" ? "rgba(0,0,0,1)" : strokeColor;
    ctx.lineWidth = strokeSize;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  }

  const replayStroke = useCallback((ctx: CanvasRenderingContext2D, stroke: DrawStroke) => {
    if (stroke.points.length === 0) return;
    ctx.beginPath();
    ctx.globalCompositeOperation = stroke.tool === "eraser" ? "destination-out" : "source-over";
    ctx.strokeStyle = stroke.tool === "eraser" ? "rgba(0,0,0,1)" : stroke.color;
    ctx.lineWidth = stroke.size;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
    for (let i = 1; i < stroke.points.length; i++) {
      ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
    }
    ctx.stroke();
  }, []);

  const redrawAll = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    allStrokes.current.forEach((s) => replayStroke(ctx, s));
  }, [replayStroke]);

  // ---------- resize: replay strokes instead of snapshot/restore ----------

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement!;

    const observer = new ResizeObserver(() => {
      canvas.width = parent.clientWidth;
      canvas.height = parent.clientHeight;
      redrawAll();
    });
    observer.observe(parent);
    return () => observer.disconnect();
  }, [redrawAll]);

  // ---------- clear signal (local user pressed Clear) ----------

  useEffect(() => {
    allStrokes.current = [];
    const ctx = getCtx();
    if (!ctx) return;
    ctx.clearRect(0, 0, canvasRef.current!.width, canvasRef.current!.height);
  }, [clearSignal]);

  // ---------- socket events ----------

  useEffect(() => {
    socket.on("canvas-state", ({ strokes }: { strokes: DrawStroke[] }) => {
      allStrokes.current = strokes;
      redrawAll();
    });

    socket.on("draw-stroke", (stroke: DrawStroke) => {
      allStrokes.current.push(stroke);
      const ctx = getCtx();
      if (ctx) replayStroke(ctx, stroke);
    });

    socket.on("clear-canvas", () => {
      allStrokes.current = [];
      const ctx = getCtx();
      if (ctx) ctx.clearRect(0, 0, canvasRef.current!.width, canvasRef.current!.height);
    });

    socket.on("cursor-update", (update: CursorUpdate) => {
      onCursorsChange((prev) => {
        const next = new Map(prev);
        next.set(update.id, update);
        return next;
      });
    });

    socket.on("user-left", ({ id }: { id: string }) => {
      onCursorsChange((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
    });

    return () => {
      socket.off("canvas-state");
      socket.off("draw-stroke");
      socket.off("clear-canvas");
      socket.off("cursor-update");
      socket.off("user-left");
    };
  }, [socket, replayStroke, redrawAll, onCursorsChange]);

  // ---------- drawing ----------

  const startDrawing = useCallback((e: MouseEvent | TouchEvent) => {
    if ("touches" in e) e.preventDefault();
    const pt = canvasPoint(e);
    isDrawing.current = true;
    lastPoint.current = pt;
    currentStroke.current = [pt];
    const ctx = getCtx();
    if (ctx) drawSegment(ctx, pt, pt, color, size, tool);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [color, size, tool]);

  const draw = useCallback((e: MouseEvent | TouchEvent) => {
    if ("touches" in e) e.preventDefault();
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : (e as MouseEvent).clientY;

    socket.emit("cursor-move", { x: clientX - rect.left, y: clientY - rect.top });

    if (!isDrawing.current || !lastPoint.current) return;

    const pt = canvasPoint(e);
    const ctx = getCtx();
    if (ctx) drawSegment(ctx, lastPoint.current, pt, color, size, tool);
    lastPoint.current = pt;
    currentStroke.current.push(pt);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [color, size, tool, socket]);

  const stopDrawing = useCallback(() => {
    if (!isDrawing.current) return;
    isDrawing.current = false;

    if (currentStroke.current.length > 0) {
      const stroke: DrawStroke = { points: currentStroke.current, color, size, tool };
      allStrokes.current.push(stroke);
      socket.emit("draw-stroke", stroke);
      currentStroke.current = [];
    }
    lastPoint.current = null;
  }, [color, size, tool, socket]);

  // Attach pointer events to canvas element
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.addEventListener("mousedown", startDrawing);
    canvas.addEventListener("mousemove", draw);
    canvas.addEventListener("mouseup", stopDrawing);
    canvas.addEventListener("mouseleave", stopDrawing);
    canvas.addEventListener("touchstart", startDrawing, { passive: false });
    canvas.addEventListener("touchmove", draw, { passive: false });
    canvas.addEventListener("touchend", stopDrawing);

    return () => {
      canvas.removeEventListener("mousedown", startDrawing);
      canvas.removeEventListener("mousemove", draw);
      canvas.removeEventListener("mouseup", stopDrawing);
      canvas.removeEventListener("mouseleave", stopDrawing);
      canvas.removeEventListener("touchstart", startDrawing);
      canvas.removeEventListener("touchmove", draw);
      canvas.removeEventListener("touchend", stopDrawing);
    };
  }, [startDrawing, draw, stopDrawing]);

  return (
    <canvas
      ref={canvasRef}
      className="block w-full h-full"
      style={{ cursor: "none", touchAction: "none" }}
    />
  );
}
