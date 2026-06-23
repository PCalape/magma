"use client";

import {
  useEffect, useRef, useCallback,
  forwardRef, useImperativeHandle,
} from "react";
import { DrawStroke, Tool } from "@/lib/types";

export interface CanvasHandle {
  drawStroke: (stroke: DrawStroke) => void;
  loadStrokes: (strokes: DrawStroke[]) => void;
}

interface Props {
  tool: Tool;
  color: string;
  size: number;
  onStroke: (stroke: DrawStroke) => void;
  clearSignal: number;
}

const Canvas = forwardRef<CanvasHandle, Props>(function Canvas(
  { tool, color, size, onStroke, clearSignal },
  ref
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);
  const currentStroke = useRef<{ x: number; y: number }[]>([]);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);
  const allStrokes = useRef<DrawStroke[]>([]);

  // ---------- helpers ----------

  function getCtx() {
    return canvasRef.current?.getContext("2d") ?? null;
  }

  function canvasPoint(e: MouseEvent | TouchEvent) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
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
    if (!stroke.points.length) return;
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

  // ---------- imperative API for parent ----------

  useImperativeHandle(ref, () => ({
    drawStroke(stroke: DrawStroke) {
      allStrokes.current.push(stroke);
      const ctx = getCtx();
      if (ctx) replayStroke(ctx, stroke);
    },
    loadStrokes(strokes: DrawStroke[]) {
      allStrokes.current = strokes;
      redrawAll();
    },
  }), [replayStroke, redrawAll]);

  // ---------- resize ----------

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

  // ---------- clear signal ----------

  useEffect(() => {
    allStrokes.current = [];
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
  }, [clearSignal]);

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
    if (!isDrawing.current || !lastPoint.current) return;
    const pt = canvasPoint(e);
    const ctx = getCtx();
    if (ctx) drawSegment(ctx, lastPoint.current, pt, color, size, tool);
    lastPoint.current = pt;
    currentStroke.current.push(pt);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [color, size, tool]);

  const stopDrawing = useCallback(() => {
    if (!isDrawing.current) return;
    isDrawing.current = false;
    if (currentStroke.current.length > 0) {
      const stroke: DrawStroke = { points: currentStroke.current, color, size, tool };
      allStrokes.current.push(stroke);
      onStroke(stroke);
      currentStroke.current = [];
    }
    lastPoint.current = null;
  }, [color, size, tool, onStroke]);

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
});

export default Canvas;
