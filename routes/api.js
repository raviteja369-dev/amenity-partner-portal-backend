import { Router } from "express";
import { getDb } from "../lib/db.js";
import { currentUser, requireAdmin, requirePartner, setAuthCookie, clearAuthCookie } from "../lib/auth.js";
import { hashPw, verifyPw, makeToken, httpError, omitId, nowIso, newId, sumPaid } from "../lib/utils.js";

const router = Router();

// ----- Auth -----
router.post("/auth/login", async (req, res) => {
  const email = (req.body.email || "").toLowerCase().trim();
  const password = req.body.password;
  const db = getDb();
  const user = await db.collection("users").findOne({ email });
  if (!user || !verifyPw(password, user.password_hash)) {
    return httpError(res, 401, "Invalid email or password");
  }
  const token = makeToken(user.id, user.role);
  setAuthCookie(res, token);
  res.json({
    user: { id: user.id, email: user.email, name: user.name, role: user.role, brand: user.brand ?? null },
    token,
  });
});

router.post("/auth/logout", (req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

router.get("/auth/me", currentUser, (req, res) => {
  res.json({
    id: req.user.id,
    email: req.user.email,
    name: req.user.name,
    role: req.user.role,
    brand: req.user.brand ?? null,
  });
});

// ----- Partners -----
router.get("/partners", currentUser, requireAdmin, async (req, res) => {
  const { brand, city, area, search } = req.query;
  const q = {};
  if (brand) q.brand = brand;
  if (city) q.city = { $regex: city, $options: "i" };
  if (area) q.area = { $regex: area, $options: "i" };
  if (search) q.name = { $regex: search, $options: "i" };

  const db = getDb();
  const docs = await db.collection("partners").find(q, { projection: { _id: 0 } }).sort({ created_at: -1 }).limit(1000).toArray();
  for (const d of docs) {
    d.leads_count = await db.collection("leads").countDocuments({ partner_id: d.id });
    d.clients_count = await db.collection("leads").countDocuments({ partner_id: d.id, status: "client" });
    d.total_revenue = await sumPaid(db, d.id);
  }
  res.json(docs);
});

router.post("/partners", currentUser, requireAdmin, async (req, res) => {
  const body = req.body;
  const email = (body.email || "").toLowerCase().trim();
  const db = getDb();
  if (await db.collection("users").findOne({ email })) {
    return httpError(res, 400, "Email already in use");
  }
  const userId = newId();
  const partnerId = newId();
  const ts = nowIso();
  await db.collection("users").insertOne({
    id: userId,
    email,
    password_hash: hashPw(body.password),
    name: body.name,
    role: "partner",
    brand: body.brand,
    partner_id: partnerId,
    created_at: ts,
  });
  const partner = {
    id: partnerId,
    user_id: userId,
    name: body.name,
    email,
    phone: body.phone || "",
    city: body.city,
    area: body.area,
    pin_code: body.pin_code,
    brand: body.brand,
    created_at: ts,
  };
  await db.collection("partners").insertOne(partner);
  res.json(partner);
});

router.put("/partners/:partner_id", currentUser, requireAdmin, async (req, res) => {
  const updates = Object.fromEntries(Object.entries(req.body).filter(([, v]) => v != null));
  if (!Object.keys(updates).length) return httpError(res, 400, "No updates provided");

  const db = getDb();
  const result = await db.collection("partners").updateOne({ id: req.params.partner_id }, { $set: updates });
  if (!result.matchedCount) return httpError(res, 404, "Partner not found");

  const userUpdates = {};
  if (updates.name) userUpdates.name = updates.name;
  if (updates.brand) userUpdates.brand = updates.brand;
  if (Object.keys(userUpdates).length) {
    await db.collection("users").updateMany({ partner_id: req.params.partner_id }, { $set: userUpdates });
  }
  const doc = await db.collection("partners").findOne({ id: req.params.partner_id }, { projection: { _id: 0 } });
  res.json(doc);
});

router.delete("/partners/:partner_id", currentUser, requireAdmin, async (req, res) => {
  const db = getDb();
  const p = await db.collection("partners").findOne({ id: req.params.partner_id });
  if (!p) return httpError(res, 404, "Partner not found");
  await db.collection("partners").deleteOne({ id: req.params.partner_id });
  await db.collection("users").deleteMany({ partner_id: req.params.partner_id });
  await db.collection("leads").deleteMany({ partner_id: req.params.partner_id });
  res.json({ ok: true });
});

router.get("/partners/me", currentUser, requirePartner, async (req, res) => {
  const db = getDb();
  const p = await db.collection("partners").findOne({ user_id: req.user.id }, { projection: { _id: 0 } });
  if (!p) return httpError(res, 404, "Partner profile not found");
  p.leads_count = await db.collection("leads").countDocuments({ partner_id: p.id });
  p.clients_count = await db.collection("leads").countDocuments({ partner_id: p.id, status: "client" });
  p.total_revenue = await sumPaid(db, p.id);
  res.json(p);
});

// ----- Leads -----
async function assertLeadOwner(leadId, user) {
  const db = getDb();
  const lead = await db.collection("leads").findOne({ id: leadId });
  if (!lead) return { error: [404, "Lead not found"] };
  if (user.role === "partner") {
    const p = await db.collection("partners").findOne({ user_id: user.id });
    if (!p || lead.partner_id !== p.id) return { error: [403, "Not your lead"] };
  }
  return { lead };
}

router.get("/leads", currentUser, async (req, res) => {
  const { partner_id, brand, status, payment_status } = req.query;
  const q = {};
  const db = getDb();

  if (req.user.role === "partner") {
    const p = await db.collection("partners").findOne({ user_id: req.user.id });
    if (!p) return res.json([]);
    q.partner_id = p.id;
  } else {
    if (partner_id) q.partner_id = partner_id;
    if (brand) q.brand = brand;
  }
  if (status) q.status = status;
  if (payment_status) q.payment_status = payment_status;

  const docs = await db.collection("leads").find(q, { projection: { _id: 0 } }).sort({ created_at: -1 }).limit(2000).toArray();
  const partnerIds = [...new Set(docs.map((d) => d.partner_id))];
  const partners = {};
  if (partnerIds.length) {
    const plist = await db.collection("partners").find({ id: { $in: partnerIds } }, { projection: { _id: 0 } }).toArray();
    for (const p of plist) partners[p.id] = p;
  }
  for (const d of docs) {
    const p = partners[d.partner_id];
    d.partner_name = p?.name || "—";
    d.partner_city = p?.city || "—";
  }
  res.json(docs);
});

router.post("/leads", currentUser, requirePartner, async (req, res) => {
  const body = req.body;
  const classes = body.target_classes || [];
  if (!classes.length || classes.some((c) => c < 1 || c > 12)) {
    return httpError(res, 400, "target_classes must be between 1 and 12");
  }
  const db = getDb();
  const p = await db.collection("partners").findOne({ user_id: req.user.id });
  if (!p) return httpError(res, 404, "Partner profile missing");

  const lead = {
    id: newId(),
    partner_id: p.id,
    brand: p.brand,
    school_name: body.school_name,
    description: body.description || "",
    address: body.address,
    target_title: body.target_title,
    deal_value: Number(body.deal_value),
    target_classes: [...new Set(classes)].sort((a, b) => a - b),
    status: "lead",
    payment_status: "unpaid",
    created_at: nowIso(),
    converted_at: null,
  };
  await db.collection("leads").insertOne(lead);
  res.json(omitId(lead));
});

router.put("/leads/:lead_id", currentUser, async (req, res) => {
  const { error } = await assertLeadOwner(req.params.lead_id, req.user);
  if (error) return httpError(res, error[0], error[1]);

  const updates = Object.fromEntries(Object.entries(req.body).filter(([, v]) => v != null));
  if (updates.target_classes) {
    if (updates.target_classes.some((c) => c < 1 || c > 12)) {
      return httpError(res, 400, "target_classes must be between 1 and 12");
    }
    updates.target_classes = [...new Set(updates.target_classes)].sort((a, b) => a - b);
  }
  const db = getDb();
  await db.collection("leads").updateOne({ id: req.params.lead_id }, { $set: updates });
  const doc = await db.collection("leads").findOne({ id: req.params.lead_id }, { projection: { _id: 0 } });
  res.json(doc);
});

router.post("/leads/:lead_id/convert", currentUser, async (req, res) => {
  const { error } = await assertLeadOwner(req.params.lead_id, req.user);
  if (error) return httpError(res, error[0], error[1]);
  const db = getDb();
  await db.collection("leads").updateOne(
    { id: req.params.lead_id },
    { $set: { status: "client", converted_at: nowIso() } }
  );
  const doc = await db.collection("leads").findOne({ id: req.params.lead_id }, { projection: { _id: 0 } });
  res.json(doc);
});

router.put("/leads/:lead_id/payment", currentUser, async (req, res) => {
  const result = await assertLeadOwner(req.params.lead_id, req.user);
  if (result.error) return httpError(res, result.error[0], result.error[1]);
  if (result.lead.status !== "client") {
    return httpError(res, 400, "Lead must be converted to client before setting payment");
  }
  const db = getDb();
  await db.collection("leads").updateOne(
    { id: req.params.lead_id },
    { $set: { payment_status: req.body.payment_status } }
  );
  const doc = await db.collection("leads").findOne({ id: req.params.lead_id }, { projection: { _id: 0 } });
  res.json(doc);
});

router.delete("/leads/:lead_id", currentUser, async (req, res) => {
  const { error } = await assertLeadOwner(req.params.lead_id, req.user);
  if (error) return httpError(res, error[0], error[1]);
  await getDb().collection("leads").deleteOne({ id: req.params.lead_id });
  res.json({ ok: true });
});

// ----- Dashboard -----
router.get("/dashboard/admin", currentUser, requireAdmin, async (req, res) => {
  const { brand } = req.query;
  const qPartners = brand ? { brand } : {};
  const qLeads = brand ? { brand } : {};
  const db = getDb();

  const total_partners = await db.collection("partners").countDocuments(qPartners);
  const total_leads = await db.collection("leads").countDocuments(qLeads);
  const total_clients = await db.collection("leads").countDocuments({ ...qLeads, status: "client" });

  const paid = await db.collection("leads").aggregate([
    { $match: { ...qLeads, status: "client", payment_status: "paid" } },
    { $group: { _id: null, total: { $sum: "$deal_value" } } },
  ]).toArray();
  const total_revenue = paid.length ? Number(paid[0].total) : 0;

  const raw = await db.collection("leads").aggregate([
    { $match: qLeads },
    {
      $group: {
        _id: "$partner_id",
        leads: { $sum: 1 },
        clients: { $sum: { $cond: [{ $eq: ["$status", "client"] }, 1, 0] } },
        revenue: {
          $sum: {
            $cond: [
              { $and: [{ $eq: ["$status", "client"] }, { $eq: ["$payment_status", "paid"] }] },
              "$deal_value",
              0,
            ],
          },
        },
      },
    },
  ]).toArray();

  const pmap = {};
  const plist = await db.collection("partners").find(qPartners, { projection: { _id: 0 } }).toArray();
  for (const p of plist) pmap[p.id] = p;

  const by_partner = raw
    .filter((r) => pmap[r._id])
    .map((r) => {
      const p = pmap[r._id];
      return {
        partner_id: r._id,
        partner_name: p.name,
        city: p.city,
        area: p.area,
        brand: p.brand,
        leads: r.leads,
        clients: r.clients,
        revenue: Number(r.revenue),
      };
    })
    .sort((a, b) => b.leads - a.leads || b.clients - a.clients);

  const by_area_raw = await db.collection("leads").aggregate([
    { $match: qLeads },
    { $lookup: { from: "partners", localField: "partner_id", foreignField: "id", as: "p" } },
    { $unwind: "$p" },
    {
      $group: {
        _id: "$p.area",
        leads: { $sum: 1 },
        clients: { $sum: { $cond: [{ $eq: ["$status", "client"] }, 1, 0] } },
      },
    },
    { $sort: { leads: -1 } },
  ]).toArray();
  const by_area = by_area_raw.map((r) => ({ area: r._id || "Unknown", leads: r.leads, clients: r.clients }));

  const by_brand_raw = await db.collection("leads").aggregate([
    {
      $group: {
        _id: "$brand",
        leads: { $sum: 1 },
        clients: { $sum: { $cond: [{ $eq: ["$status", "client"] }, 1, 0] } },
      },
    },
  ]).toArray();
  const by_brand = by_brand_raw.map((r) => ({ brand: r._id, leads: r.leads, clients: r.clients }));

  res.json({
    kpis: { total_partners, total_leads, total_clients, total_revenue },
    by_partner,
    by_area,
    by_brand,
  });
});

router.get("/dashboard/partner", currentUser, requirePartner, async (req, res) => {
  const db = getDb();
  const p = await db.collection("partners").findOne({ user_id: req.user.id }, { projection: { _id: 0 } });
  if (!p) return httpError(res, 404, "Partner profile not found");

  const leads = await db.collection("leads").countDocuments({ partner_id: p.id });
  const clients = await db.collection("leads").countDocuments({ partner_id: p.id, status: "client" });

  const paid = await db.collection("leads").aggregate([
    { $match: { partner_id: p.id, status: "client", payment_status: "paid" } },
    { $group: { _id: null, total: { $sum: "$deal_value" } } },
  ]).toArray();
  const revenue = paid.length ? Number(paid[0].total) : 0;

  const pend = await db.collection("leads").aggregate([
    { $match: { partner_id: p.id, status: "client", payment_status: "unpaid" } },
    { $group: { _id: null, total: { $sum: "$deal_value" } } },
  ]).toArray();
  const pending = pend.length ? Number(pend[0].total) : 0;

  res.json({
    profile: p,
    kpis: { total_leads: leads, total_clients: clients, total_revenue: revenue, pending_revenue: pending },
  });
});

// ----- Public landing stats (no auth) -----
const LANDING_BRANDS = new Set(["eduosa", "c-forgia", "facilo"]);

router.get("/stats/landing", async (req, res) => {
  const brand = String(req.query.brand || "").toLowerCase();
  if (!LANDING_BRANDS.has(brand)) {
    return httpError(res, 400, "Invalid brand. Use eduosa, c-forgia, or facilo.");
  }

  const db = getDb();
  const qPartners = { brand };
  const qLeads = { brand };

  const total_partners = await db.collection("partners").countDocuments(qPartners);
  const total_leads = await db.collection("leads").countDocuments(qLeads);
  const total_clients = await db.collection("leads").countDocuments({ ...qLeads, status: "client" });

  const paid = await db.collection("leads").aggregate([
    { $match: { ...qLeads, status: "client", payment_status: "paid" } },
    { $group: { _id: null, total: { $sum: "$deal_value" } } },
  ]).toArray();
  const total_revenue = paid.length ? Number(paid[0].total) : 0;

  const pendingAgg = await db.collection("leads").aggregate([
    { $match: { ...qLeads, status: "client", payment_status: "unpaid" } },
    { $group: { _id: null, total: { $sum: "$deal_value" } } },
  ]).toArray();
  const pending_revenue = pendingAgg.length ? Number(pendingAgg[0].total) : 0;

  const monthlyRaw = await db.collection("leads").aggregate([
    { $match: qLeads },
    { $project: { month: { $substr: ["$created_at", 0, 7] } } },
    { $group: { _id: "$month", leads: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]).toArray();

  const monthly = monthlyRaw.slice(-7).map((r) => ({
    month: r._id,
    leads: r.leads,
  }));

  const conversion_rate = total_leads ? Math.round((total_clients / total_leads) * 100) : 0;

  res.json({
    brand,
    kpis: {
      total_partners,
      total_leads,
      total_clients,
      total_revenue,
      pending_revenue,
      conversion_rate,
    },
    monthly,
  });
});

export default router;
