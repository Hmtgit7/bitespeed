import "dotenv/config";
import express from "express";
import path from "path";
import identifyRouter from "./routes/identify";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Serve static files from public folder
app.use(express.static(path.join(__dirname, "../public")));

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", message: "Bitespeed Identity Service is running" });
});

app.use("/", identifyRouter);

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

export default app;
