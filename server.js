const { createServer } = require("http");
const { Server } = require("socket.io");
const next = require("next");
const Database = require("better-sqlite3");
const path = require("path");

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME || "localhost";
const port = parseInt(process.env.PORT || "3000", 10);

// ---------- SQLite setup ----------
const db = new Database(path.join(__dirname, "canvas.db"));
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS strokes (
    id    INTEGER PRIMARY KEY AUTOINCREMENT,
    room  TEXT    NOT NULL,
    data  TEXT    NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_strokes_room ON strokes(room);
`);

const insertStroke = db.prepare("INSERT INTO strokes (room, data) VALUES (?, ?)");
const selectStrokes = db.prepare("SELECT data FROM strokes WHERE room = ? ORDER BY id ASC");
const deleteStrokes = db.prepare("DELETE FROM strokes WHERE room = ?");

// Cap per-room strokes: keep newest 5000 after insertion
const capStrokes = db.prepare(`
  DELETE FROM strokes
  WHERE room = ?
    AND id NOT IN (
      SELECT id FROM strokes WHERE room = ? ORDER BY id DESC LIMIT 5000
    )
`);

// ---------- In-memory live session state ----------
// Per-room: { users: Map<socketId, UserInfo> }
const rooms = new Map();

function getOrCreateRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, { users: new Map() });
  }
  return rooms.get(roomId);
}

const USER_HUES = [210, 0, 120, 270, 30, 180, 300, 60];

// ---------- Next.js ----------
const app = next({ dev, hostname, port });
const handler = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer(handler);

  const io = new Server(httpServer, {
    cors: { origin: "*" },
  });

  io.on("connection", (socket) => {
    let currentRoom = null;
    let userInfo = null;

    socket.on("join-room", ({ roomId, name }) => {
      currentRoom = roomId;
      const room = getOrCreateRoom(roomId);

      const slotIndex = room.users.size % USER_HUES.length;
      userInfo = {
        id: socket.id,
        name: name || `Artist ${room.users.size + 1}`,
        hue: USER_HUES[slotIndex],
        cursor: { x: 0, y: 0 },
      };

      room.users.set(socket.id, userInfo);
      socket.join(roomId);

      // Load persisted strokes from DB and send to new joiner
      const rows = selectStrokes.all(roomId);
      const strokes = rows.map((r) => JSON.parse(r.data));
      socket.emit("canvas-state", { strokes });

      socket.emit("self-info", userInfo);
      io.to(roomId).emit("users-update", usersArray(room));
      socket.to(roomId).emit("user-joined", { user: userInfo });
    });

    socket.on("draw-stroke", (stroke) => {
      if (!currentRoom) return;
      // Persist to DB
      insertStroke.run(currentRoom, JSON.stringify(stroke));
      capStrokes.run(currentRoom, currentRoom);
      // Broadcast to other clients in room
      socket.to(currentRoom).emit("draw-stroke", stroke);
    });

    socket.on("cursor-move", ({ x, y }) => {
      if (!currentRoom || !userInfo) return;
      userInfo.cursor = { x, y };
      socket.to(currentRoom).emit("cursor-update", {
        id: socket.id, x, y, hue: userInfo.hue, name: userInfo.name,
      });
    });

    socket.on("clear-canvas", () => {
      if (!currentRoom) return;
      deleteStrokes.run(currentRoom);
      io.to(currentRoom).emit("clear-canvas");
    });

    socket.on("disconnect", () => {
      if (!currentRoom) return;
      const room = rooms.get(currentRoom);
      if (!room) return;
      room.users.delete(socket.id);
      io.to(currentRoom).emit("user-left", { id: socket.id });
      io.to(currentRoom).emit("users-update", usersArray(room));
      if (room.users.size === 0) rooms.delete(currentRoom);
    });
  });

  httpServer.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
  });
});

function usersArray(room) {
  return Array.from(room.users.values());
}
