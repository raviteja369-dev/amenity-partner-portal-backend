import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "..", ".env"), override: true });

export const PORT = Number(process.env.PORT) || 5000;
export const IS_DEV = process.env.NODE_ENV === "development";

const DEFAULT_ORIGINS = [
  "http://localhost:3000",
  "https://amenity-partner-portal-frontend.vercel.app",
  "https://partner.amenityforge.com",
];

export const CLIENT_ORIGINS = [
  ...new Set([
    ...DEFAULT_ORIGINS,
    ...(process.env.CLIENT_URL || "").split(",").map((s) => s.trim()).filter(Boolean),
  ]),
];

export const CLIENT_URL = CLIENT_ORIGINS[0];
export const JWT_SECRET = process.env.JWT_SECRET;
export const MONGO_URI = process.env.MONGO_URI || process.env.MONGO_URL;

function dbNameFromUri(uri) {
  const match = uri?.match(/\.mongodb\.net\/([^/?]+)/i) || uri?.match(/mongodb(?:\+srv)?:\/\/[^/]+\/([^/?]+)/i);
  return match?.[1] || "school-connect";
}

export const DB_NAME = process.env.DB_NAME || dbNameFromUri(MONGO_URI);
export const RESET_DB = process.env.RESET_DB === "true";
export const ACCESS_MIN = 60 * 24;
export const JWT_ALG = "HS256";
export const BRANDS = ["eduosa", "c-forgia", "facilo"];

if (!MONGO_URI) throw new Error("Set MONGO_URI in backend/.env");
if (!JWT_SECRET) throw new Error("Set JWT_SECRET in backend/.env");
