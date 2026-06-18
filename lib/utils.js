import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";
import { ACCESS_MIN, JWT_ALG, JWT_SECRET } from "./config.js";

export function nowIso() {
  return new Date().toISOString();
}

export function hashPw(pw) {
  return bcrypt.hashSync(pw, bcrypt.genSaltSync());
}

export function verifyPw(pw, hashed) {
  try {
    return bcrypt.compareSync(pw, hashed);
  } catch {
    return false;
  }
}

export function makeToken(userId, role) {
  const exp = Math.floor(Date.now() / 1000) + ACCESS_MIN * 60;
  return jwt.sign({ sub: userId, role, exp, type: "access" }, JWT_SECRET, { algorithm: JWT_ALG });
}

export function stripUser(doc) {
  if (!doc) return doc;
  const { _id, password_hash, ...rest } = doc;
  return rest;
}

export function omitId(doc) {
  if (!doc) return doc;
  const { _id, ...rest } = doc;
  return rest;
}

export function newId() {
  return randomUUID();
}

export function httpError(res, status, message) {
  return res.status(status).json({ detail: message });
}

export async function sumPaid(db, partnerId) {
  const res = await db
    .collection("leads")
    .aggregate([
      { $match: { partner_id: partnerId, status: "client", payment_status: "paid" } },
      { $group: { _id: null, total: { $sum: "$deal_value" } } },
    ])
    .toArray();
  return res.length ? Number(res[0].total) : 0;
}
