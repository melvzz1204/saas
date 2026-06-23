import app from "./src/app.js";
import connectDB from "./src/config/db.js";
import { createServer } from "http";
import { Server } from "socket.io";

const PORT = process.env.PORT || 5000;
connectDB();

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: [
      "http://localhost:3000",
      "http://127.0.0.1:5500",
      "http://localhost:5500",
      "http://localhost:5173",
    ], // Added fallback variations
    methods: ["GET", "POST", "PATCH"],
    credentials: true,
  },
  transports: ["websocket", "polling"],
});
global.io = io;

app.use((req, res, next) => {
  req.io = io;
  next();
});

io.on("connection", (socket) => {
  console.log(
    `🔌 New client connected to pipeline socket session: ${socket.id}`,
  );

  socket.on("disconnect", () => {
    console.log("❌ Client disconnected from server socket instance.");
  });
});

// 🎯 THE FIX: Listen using httpServer, NOT app.listen!
const server = httpServer.listen(PORT, () => {
  console.log(
    `🚀 Server is blasting off on port ${PORT} in ${process.env.NODE_ENV || "development"} mode (WebSockets Enabled)`,
  );
});

// Handle unhandled promise rejections
process.on("unhandledRejection", (err) => {
  console.error(`💥 Unhandled Rejection: ${err.message}`);
  server.close(() => process.exit(1));
});
