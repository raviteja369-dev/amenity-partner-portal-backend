import { getDb } from "./db.js";
import { hashPw, nowIso, newId } from "./utils.js";

const COLLECTIONS = ["users", "partners", "leads", "clients", "payments"];

export async function resetDatabase() {
  const db = getDb();
  const existing = (await db.listCollections().toArray()).map((c) => c.name);
  for (const name of COLLECTIONS) {
    if (existing.includes(name)) {
      await db.collection(name).drop();
      console.log(`Dropped collection: ${name}`);
    }
  }
  await seedFresh();
}

export async function seedFresh() {
  const db = getDb();
  const adminEmail = (process.env.ADMIN_EMAIL || "admin@partnerportal.com").toLowerCase();
  const adminPw = process.env.ADMIN_PASSWORD || "Admin@123";
  const ts = nowIso();

  await db.collection("users").insertOne({
    id: newId(),
    email: adminEmail,
    password_hash: hashPw(adminPw),
    name: "Portal Admin",
    role: "admin",
    brand: null,
    created_at: ts,
  });
  console.log(`Created admin: ${adminEmail} / ${adminPw}`);

  const samples = [
    { name: "Aarav Mehta", email: "aarav@eduosa.in", password: "Partner@123", city: "Mumbai", area: "Andheri West", pin_code: "400053", brand: "eduosa", phone: "+91 98200 11111" },
    { name: "Priya Sharma", email: "priya@cforgia.in", password: "Partner@123", city: "Bengaluru", area: "Indiranagar", pin_code: "560038", brand: "c-forgia", phone: "+91 98200 22222" },
    { name: "Rahul Iyer", email: "rahul@facilo.in", password: "Partner@123", city: "Pune", area: "Koregaon Park", pin_code: "411001", brand: "facilo", phone: "+91 98200 33333" },
  ];

  for (const s of samples) {
    const uid = newId();
    const pid = newId();
    await db.collection("users").insertOne({
      id: uid,
      email: s.email.toLowerCase(),
      password_hash: hashPw(s.password),
      name: s.name,
      role: "partner",
      brand: s.brand,
      partner_id: pid,
      created_at: ts,
    });
    await db.collection("partners").insertOne({
      id: pid,
      user_id: uid,
      name: s.name,
      email: s.email.toLowerCase(),
      phone: s.phone,
      city: s.city,
      area: s.area,
      pin_code: s.pin_code,
      brand: s.brand,
      created_at: ts,
    });
    const schools = [
      ["Delhi Public School", "Premier CBSE school", `Plot 5, Sector 24, ${s.city}`, "Pilot Program", 120000, [1, 2, 3, 4, 5], "client", "paid"],
      ["St. Xavier's High", "Catholic mission school", `MG Road, ${s.city}`, "Annual Subscription", 80000, [6, 7, 8], "client", "unpaid"],
      ["Greenfield Academy", "Progressive curriculum", `Lakeview Drive, ${s.city}`, "Pilot Program", 45000, [9, 10], "lead", "unpaid"],
    ];
    for (const sc of schools) {
      await db.collection("leads").insertOne({
        id: newId(),
        partner_id: pid,
        brand: s.brand,
        school_name: sc[0],
        description: sc[1],
        address: sc[2],
        target_title: sc[3],
        deal_value: Number(sc[4]),
        target_classes: sc[5],
        status: sc[6],
        payment_status: sc[7],
        created_at: ts,
        converted_at: sc[6] === "client" ? ts : null,
      });
    }
  }
  console.log("Seeded 3 partners + 9 leads");
}
