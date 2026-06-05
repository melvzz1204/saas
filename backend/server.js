import app from "./src/app.js";
import connectDB from "./src/config/db.js";

const PORT = process.env.PORT || 5000;
connectDB();

const server = app.listen(PORT, () => {
  console.log(
    `🚀 Server is blasting off on port ${PORT} in ${process.env.NODE_ENV} mode`,
  );
});

// Handle unhandled promise rejections (e.g., database connection failures)
process.on("unhandledRejection", (err) => {
  console.error(`💥 Unhandled Rejection: ${err.message}`);
  server.close(() => process.exit(1));
});
