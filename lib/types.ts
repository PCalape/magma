export type Tool = "pen" | "eraser";

export interface DrawStroke {
  points: { x: number; y: number }[];
  color: string;
  size: number;
  tool: Tool;
}

export interface DrawBatch {
  userId: string;
  points: { x: number; y: number }[];
  color: string;
  size: number;
  tool: Tool;
}

export interface UserInfo {
  id: string;
  name: string;
  hue: number;
  cursor: { x: number; y: number };
}

export interface CursorUpdate {
  id: string;
  x: number;
  y: number;
  hue: number;
  name: string;
}
