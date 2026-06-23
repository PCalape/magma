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

  // Draw a smooth quadratic bezier segment between two points
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

  // Replay a full stroke from stored points
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

  // ---------- resize ----------

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement!;

    const observer = new ResizeObserver(() => {
      // Preserve content across resize by capturing to image
      const imageData = canvas.toDataURL();
      canvas.width = parent.clientWidth;
      canvas.height = parent.clientHeight;
      const img = new Image();
      img.onload = () => {
        const ctx = canvas.getContext("2d");
        if (ctx) ctx.drawImage(img, 0, 0);
      };
      img.src = imageData;
    });
    observer.observe(parent);

    canvas.width = parent.clientWidth;
    canvas.height = parent.clientHeight;

    return () => observer.disconnect();
  }, []);

  // ---------- clear signal ----------

  useEffect(() => {
    const ctx = getCtx();
    if (!ctx) return;
    ctx.clearRect(0, 0, canvasRef.current!.width, canvasRef.current!.height);
  }, [clearSignal]);

  // ---------- socket events ----------

  useEffect(() => {
    socket.on("canvas-state", ({ strokes }: { strokes: DrawStroke[] }) => {
      const ctx = getCtx();
      if (!ctx) return;
      ctx.clearRect(0, 0, canvasRef.current!.width, canvasRef.current!.height);
      strokes.forEach((s) => replayStroke(ctx, s));
    });

    socket.on("draw-stroke", (stroke: DrawStroke) => {
      const ctx = getCtx();
      if (ctx) replayStroke(ctx, stroke);
    });

    socket.on("clear-canvas", () => {
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
  }, [socket, replayStroke, onCursorsChange]);

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

    // Emit cursor even when not drawing
    const cursorX = clientX - rect.left;
    const cursorY = clientY - rect.top;
    socket.emit("cursor-move", { x: cursorX, y: cursorY });

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
      const stroke: DrawStroke = {
        points: currentStroke.current,
        color,
        size,
        tool,
      };
      socket.emit("draw-stroke", stroke);
      currentStroke.current = [];
    }
    lastPoint.current = null;
  }, [color, size, tool, socket]);

  // Attach events to canvas element
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
