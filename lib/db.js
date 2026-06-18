import { MongoClient } from "mongodb";
import { MONGO_URI, DB_NAME } from "./config.js";

let client;
let db;

export async function connectDb() {
  client = new MongoClient(MONGO_URI);
  await client.connect();
  await client.db("admin").command({ ping: 1 });
  db = client.db(DB_NAME);
  await db.collection("users").createIndex("email", { unique: true });
  await db.collection("partners").createIndex("id", { unique: true });
  await db.collection("partners").createIndex("brand");
  await db.collection("leads").createIndex("partner_id");
  await db.collection("leads").createIndex("brand");
  return db;
}

export function getDb() {
  if (!db) throw new Error("Database not connected");
  return db;
}

export async function closeDb() {
  if (client) await client.close();
}

export { DB_NAME };
