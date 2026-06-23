const { createServer } = require("http");
const { Server } = require("socket.io");
const next = require("next");
const { MongoClient } = require("mongodb");

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME || "localhost";
const port = parseInt(process.env.PORT || "3000", 10);
const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017";
const DB_NAME = "magma";

// ---------- In-memory live session state ----------
const rooms = new Map();
const USER_HUES = [210, 0, 120, 270, 30, 180, 300, 60];

function getOrCreateRoom(roomId) {
  if (!rooms.has(roomId)) rooms.set(roomId, { users: new Map() });
  return rooms.get(roomId);
}

function usersArray(room) {
  return Array.from(room.users.values());
}

// ---------- Bootstrap ----------
async function main() {
  const mongo = new MongoClient(MONGO_URI);
  await mongo.connect();
  console.log("> MongoDB connected");

  const db = mongo.db(DB_NAME);
  const strokes = db.collection("strokes");
  // Index for fast per-room queries
  await strokes.createIndex({ room: 1, _id: 1 });

  const app = next({ dev, hostname, port });
  const handler = app.getRequestHandler();
  await app.prepare();

  const httpServer = createServer(handler);
  const io = new Server(httpServer, { cors: { origin: "*" } });

  io.on("connection", (socket) => {
    let currentRoom = null;
    let userInfo = null;

    socket.on("join-room", async ({ roomId, name }) => {
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

      // Load persisted strokes and send to the new joiner
      const docs = await strokes
        .find({ room: roomId }, { projection: { _id: 0, room: 0 } })
        .sort({ _id: 1 })
        .toArray();
      socket.emit("canvas-state", { strokes: docs });

      socket.emit("self-info", userInfo);
      io.to(roomId).emit("users-update", usersArray(room));
      socket.to(roomId).emit("user-joined", { user: userInfo });
    });

    socket.on("draw-stroke", async (stroke) => {
      if (!currentRoom) return;
      await strokes.insertOne({ room: currentRoom, ...stroke });
      // Cap to newest 5000 strokes per room
      const count = await strokes.countDocuments({ room: currentRoom });
      if (count > 5000) {
        const oldest = await strokes
          .find({ room: currentRoom })
          .sort({ _id: 1 })
          .limit(count - 5000)
          .toArray();
        const ids = oldest.map((d) => d._id);
        await strokes.deleteMany({ _id: { $in: ids } });
      }
      socket.to(currentRoom).emit("draw-stroke", stroke);
    });

    socket.on("cursor-move", ({ x, y }) => {
      if (!currentRoom || !userInfo) return;
      userInfo.cursor = { x, y };
      socket.to(currentRoom).emit("cursor-update", {
        id: socket.id, x, y, hue: userInfo.hue, name: userInfo.name,
      });
    });

    socket.on("clear-canvas", async () => {
      if (!currentRoom) return;
      await strokes.deleteMany({ room: currentRoom });
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
}

main().catch((err) => {
  console.error("Failed to start:", err.message);
  process.exit(1);
});
