import app from "./src/app.js";
import connectDB from "./src/config/db.js";
import { seedDefaultServices } from "./src/services/defaultService.js";
import { createServer } from "http";
import { Server } from "socket.io";

const PORT = process.env.PORT || 5000;

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

  // 🎯 Listen for the frontend joining the room
  socket.on("join_patient_room", (patientId) => {
    socket.join(patientId);
    console.log(
      `👤 Patient successfully joined live tracking room: ${patientId}`,
    );
  });

  socket.on("disconnect", () => {
    console.log("❌ Client disconnected from server socket instance.");
  });
});

let server;

// 🚀 Async Initialization: Connect DB -> Auto-Seed -> Listen
const startServer = async () => {
  try {
    // 1. Establish MongoDB connection
    await connectDB();

    // 2. Automatically seed default clinic treatments if missing
    await seedDefaultServices();

    // 3. Listen using httpServer (HTTP + WebSockets)
    server = httpServer.listen(PORT, () => {
      console.log(
        `🚀 Server is blasting off on port ${PORT} in ${
          process.env.NODE_ENV || "development"
        } mode (WebSockets Enabled)`,
      );
    });
  } catch (error) {
    console.error(`💥 Failed to initialize server: ${error.message}`);
    process.exit(1);
  }
};

startServer();

// Handle unhandled promise rejections
process.on("unhandledRejection", (err) => {
  console.error(`💥 Unhandled Rejection: ${err.message}`);
  if (server) {
    server.close(() => process.exit(1));
  } else {
    process.exit(1);
  }
});
