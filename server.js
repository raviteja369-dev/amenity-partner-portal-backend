import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { PORT, CLIENT_ORIGINS, IS_DEV } from "./lib/config.js";
import { connectDb, closeDb, DB_NAME } from "./lib/db.js";
import { seedAdminAndSamples } from "./lib/seed.js";
import apiRouter from "./routes/api.js";

const app = express();

const corsOptions = IS_DEV
  ? { origin: true, credentials: true }
  : {
      origin(origin, callback) {
        if (!origin || CLIENT_ORIGINS.includes(origin)) callback(null, true);
        else callback(null, false);
      },
      credentials: true,
    };

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
app.use(express.json());
app.use(cookieParser());
app.use("/api", apiRouter);

async function start() {
  try {
    await connectDb();
    console.log(`Connected to MongoDB database: ${DB_NAME}`);
    await seedAdminAndSamples();
    app.listen(PORT, () => {
      console.log(`Partner Portal API running on http://localhost:${PORT}`);
      console.log(`CORS origins: ${CLIENT_ORIGINS.join(", ")}${IS_DEV ? " (+ any in dev)" : ""}`);
    });
  } catch (err) {
    console.error("MongoDB connection failed:", err.message);
    process.exit(1);
  }
}

process.on("SIGINT", async () => {
  await closeDb();
  process.exit(0);
});

start();
