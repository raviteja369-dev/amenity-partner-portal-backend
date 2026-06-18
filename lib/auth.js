import jwt from "jsonwebtoken";
import { getDb } from "./db.js";
import { JWT_ALG, JWT_SECRET, ACCESS_MIN, IS_DEV } from "./config.js";
import { httpError, stripUser } from "./utils.js";

export function setAuthCookie(res, token) {
  res.cookie("access_token", token, {
    httpOnly: true,
    secure: !IS_DEV,
    sameSite: IS_DEV ? "lax" : "none",
    maxAge: ACCESS_MIN * 60 * 1000,
    path: "/",
  });
}

export function clearAuthCookie(res) {
  res.clearCookie("access_token", { path: "/" });
}

export async function currentUser(req, res, next) {
  let token = req.cookies?.access_token;
  if (!token) {
    const h = req.headers.authorization || "";
    if (h.startsWith("Bearer ")) token = h.slice(7);
  }
  if (!token) return httpError(res, 401, "Not authenticated");

  try {
    const payload = jwt.verify(token, JWT_SECRET, { algorithms: [JWT_ALG] });
    const db = getDb();
    const user = await db.collection("users").findOne({ id: payload.sub });
    if (!user) return httpError(res, 401, "User not found");
    req.user = stripUser(user);
    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") return httpError(res, 401, "Token expired");
    return httpError(res, 401, "Invalid token");
  }
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") return httpError(res, 403, "Admin access required");
  next();
}

export function requirePartner(req, res, next) {
  if (req.user?.role !== "partner") return httpError(res, 403, "Partner access required");
  next();
}
