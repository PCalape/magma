const { createServer } = require("http");
const { Server } = require("socket.io");
const next = require("next");

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME || "localhost";
const port = parseInt(process.env.PORT || "3000", 10);

const app = next({ dev, hostname, port });
const handler = app.getRequestHandler();

// Per-room state: { strokes: DrawStroke[], users: Map<socketId, UserInfo> }
const rooms = new Map();

function getOrCreateRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, { strokes: [], users: new Map() });
  }
  return rooms.get(roomId);
}

// Assign a distinct hue per user slot in the room (for cursor color)
const USER_HUES = [210, 0, 120, 270, 30, 180, 300, 60];

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

      // Send existing canvas state to the new joiner
      socket.emit("canvas-state", { strokes: room.strokes });

      // Send current user list
      socket.emit("self-info", userInfo);
      io.to(roomId).emit("users-update", usersArray(room));

      socket.to(roomId).emit("user-joined", { user: userInfo });
    });

    socket.on("draw-stroke", (stroke) => {
      if (!currentRoom) return;
      const room = rooms.get(currentRoom);
      if (!room) return;
      room.strokes.push(stroke);
      // Cap stored strokes to prevent unbounded memory growth
      if (room.strokes.length > 5000) room.strokes.splice(0, 1000);
      socket.to(currentRoom).emit("draw-stroke", stroke);
    });

    socket.on("cursor-move", ({ x, y }) => {
      if (!currentRoom || !userInfo) return;
      userInfo.cursor = { x, y };
      socket.to(currentRoom).emit("cursor-update", { id: socket.id, x, y, hue: userInfo.hue, name: userInfo.name });
    });

    socket.on("clear-canvas", () => {
      if (!currentRoom) return;
      const room = rooms.get(currentRoom);
      if (!room) return;
      room.strokes = [];
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
