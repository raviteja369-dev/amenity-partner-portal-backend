import { getDb } from "./db.js";
import { hashPw, verifyPw, nowIso, newId } from "./utils.js";
import { resetDatabase, seedFresh } from "./resetDb.js";
import { RESET_DB } from "./config.js";

export async function seedAdminAndSamples() {
  if (RESET_DB) {
    console.log("RESET_DB=true — wiping and re-seeding database...");
    await resetDatabase();
    return;
  }

  const db = getDb();
  const adminEmail = (process.env.ADMIN_EMAIL || "admin@partnerportal.com").toLowerCase();
  const adminPw = process.env.ADMIN_PASSWORD || "Admin@123";

  const admin = await db.collection("users").findOne({ email: adminEmail });
  if (!admin) {
    await db.collection("users").insertOne({
      id: newId(),
      email: adminEmail,
      password_hash: hashPw(adminPw),
      name: "Portal Admin",
      role: "admin",
      brand: null,
      created_at: nowIso(),
    });
    console.log(`Seeded admin ${adminEmail}`);
  } else if (!verifyPw(adminPw, admin.password_hash)) {
    await db.collection("users").updateOne(
      { email: adminEmail },
      { $set: { password_hash: hashPw(adminPw) } }
    );
  }

  const partnerCount = await db.collection("partners").countDocuments({});
  if (partnerCount > 0) return;

  await seedFresh();
}
