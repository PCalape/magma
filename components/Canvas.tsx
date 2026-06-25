"use client";

import {
  useEffect, useRef, useCallback,
  forwardRef, useImperativeHandle,
} from "react";
import { DrawStroke, Tool } from "@/lib/types";

type Point = { x: number; y: number };

// Used only internally to communicate segments from draw → onSegment
interface DrawSegment {
  from: Point;
  to: Point;
  color: string;
  size: number;
  tool: Tool;
}

export interface CanvasHandle {
  drawStroke: (stroke: DrawStroke) => void;
  /** Draw a connected chain: from → points[0] → points[1] → … */
  drawPoints: (from: Point | null, points: Point[], color: string, size: number, tool: Tool) => void;
  loadStrokes: (strokes: DrawStroke[]) => void;
}

interface Props {
  tool: Tool;
  color: string;
  size: number;
  onStroke: (stroke: DrawStroke) => void;
  onSegment: (seg: DrawSegment) => void;
  clearSignal: number;
}

const Canvas = forwardRef<CanvasHandle, Props>(function Canvas(
  { tool, color, size, onStroke, onSegment, clearSignal },
  ref
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);
  const currentStroke = useRef<Point[]>([]);
  const lastPoint = useRef<Point | null>(null);
  const allStrokes = useRef<DrawStroke[]>([]);

  function getCtx() {
    return canvasRef.current?.getContext("2d") ?? null;
  }

  function canvasPoint(e: MouseEvent | TouchEvent): Point {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
  }

  function paintLine(ctx: CanvasRenderingContext2D, from: Point, to: Point, c: string, s: number, t: Tool) {
    ctx.beginPath();
    ctx.globalCompositeOperation = t === "eraser" ? "destination-out" : "source-over";
    ctx.strokeStyle = t === "eraser" ? "rgba(0,0,0,1)" : c;
    ctx.lineWidth = s;
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
    for (let i = 1; i < stroke.points.length; i++) ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
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

  useImperativeHandle(ref, () => ({
    drawStroke(stroke: DrawStroke) {
      allStrokes.current.push(stroke);
      const ctx = getCtx();
      if (ctx) replayStroke(ctx, stroke);
    },
    drawPoints(from: Point | null, points: Point[], c: string, s: number, t: Tool) {
      const ctx = getCtx();
      if (!ctx || points.length === 0) return;
      let prev = from ?? points[0];
      for (const pt of points) {
        paintLine(ctx, prev, pt, c, s, t);
        prev = pt;
      }
    },
    loadStrokes(strokes: DrawStroke[]) {
      allStrokes.current = strokes;
      redrawAll();
    },
  }), [replayStroke, redrawAll]);

  // Resize — replay from allStrokes instead of snapshot/restore
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

  // Clear signal
  useEffect(() => {
    allStrokes.current = [];
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
  }, [clearSignal]);

  // Drawing
  const startDrawing = useCallback((e: MouseEvent | TouchEvent) => {
    if ("touches" in e) e.preventDefault();
    const pt = canvasPoint(e);
    isDrawing.current = true;
    lastPoint.current = pt;
    currentStroke.current = [pt];
    const ctx = getCtx();
    if (ctx) paintLine(ctx, pt, pt, color, size, tool);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [color, size, tool]);

  const draw = useCallback((e: MouseEvent | TouchEvent) => {
    if ("touches" in e) e.preventDefault();
    if (!isDrawing.current || !lastPoint.current) return;
    const pt = canvasPoint(e);
    const ctx = getCtx();
    if (ctx) paintLine(ctx, lastPoint.current, pt, color, size, tool);
    onSegment({ from: lastPoint.current, to: pt, color, size, tool });
    lastPoint.current = pt;
    currentStroke.current.push(pt);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [color, size, tool, onSegment]);

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
