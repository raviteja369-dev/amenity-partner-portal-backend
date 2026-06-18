/**
 * Full API smoke test — run with backend up: npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "crypto";

const BASE = (process.env.REACT_APP_BACKEND_URL || "http://localhost:5000").replace(/\/$/, "");
const API = `${BASE}/api`;

const ADMIN = { email: "admin@partnerportal.com", password: "Admin@123" };
const PARTNER_EDUOSA = { email: "aarav@eduosa.in", password: "Partner@123" };
const PARTNER_CFORGIA = { email: "priya@cforgia.in", password: "Partner@123" };

async function login(creds) {
  const r = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(creds),
  });
  const text = await r.text();
  assert.equal(r.status, 200, `login ${creds.email}: ${text}`);
  return JSON.parse(text);
}

function hdr(token) {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

describe("CORS preflight", () => {
  it("allows localhost:3001", async () => {
    const r = await fetch(`${API}/auth/login`, {
      method: "OPTIONS",
      headers: {
        Origin: "http://localhost:3001",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type",
      },
    });
    const allow = r.headers.get("access-control-allow-origin");
    assert.ok(
      allow === "http://localhost:3001" || allow === "*",
      `expected 3001, got ${allow}`
    );
  });
});

describe("Auth", () => {
  it("admin login + me", async () => {
    const { token, user } = await login(ADMIN);
    assert.equal(user.role, "admin");
    const me = await fetch(`${API}/auth/me`, { headers: hdr(token) });
    assert.equal(me.status, 200);
    assert.equal((await me.json()).role, "admin");
  });

  it("partner login", async () => {
    const { user } = await login(PARTNER_EDUOSA);
    assert.equal(user.role, "partner");
    assert.equal(user.brand, "eduosa");
  });

  it("invalid login → 401", async () => {
    const r = await fetch(`${API}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "x@x.com", password: "bad" }),
    });
    assert.equal(r.status, 401);
  });

  it("logout", async () => {
    const { token } = await login(ADMIN);
    const r = await fetch(`${API}/auth/logout`, { method: "POST", headers: hdr(token) });
    assert.equal(r.status, 200);
  });
});

describe("Admin routes", () => {
  it("partners list", async () => {
    const { token } = await login(ADMIN);
    const r = await fetch(`${API}/partners`, { headers: hdr(token) });
    assert.equal(r.status, 200);
    const data = await r.json();
    assert.ok(data.length >= 3);
  });

  it("leads list", async () => {
    const { token } = await login(ADMIN);
    const r = await fetch(`${API}/leads`, { headers: hdr(token) });
    assert.equal(r.status, 200);
    assert.ok((await r.json()).length >= 9);
  });

  it("dashboard", async () => {
    const { token } = await login(ADMIN);
    const r = await fetch(`${API}/dashboard/admin`, { headers: hdr(token) });
    assert.equal(r.status, 200);
    const d = await r.json();
    assert.ok(d.kpis.total_partners >= 3);
  });

  it("partner blocked from admin dashboard", async () => {
    const { token } = await login(PARTNER_EDUOSA);
    const r = await fetch(`${API}/dashboard/admin`, { headers: hdr(token) });
    assert.equal(r.status, 403);
  });
});

describe("Partner routes", () => {
  it("partner dashboard", async () => {
    const { token } = await login(PARTNER_EDUOSA);
    const r = await fetch(`${API}/dashboard/partner`, { headers: hdr(token) });
    assert.equal(r.status, 200);
    const d = await r.json();
    assert.equal(d.profile.name, "Aarav Mehta");
    assert.equal(d.kpis.total_revenue, 120000);
  });

  it("partner leads CRUD flow", async () => {
    const { token } = await login(PARTNER_CFORGIA);
    const body = {
      school_name: `TEST ${randomUUID().slice(0, 6)}`,
      description: "d",
      address: "a",
      target_title: "Pilot",
      deal_value: 50000,
      target_classes: [1, 2, 3],
    };
    const create = await fetch(`${API}/leads`, {
      method: "POST",
      headers: hdr(token),
      body: JSON.stringify(body),
    });
    assert.equal(create.status, 200);
    const lead = await create.json();
    assert.equal(lead.status, "lead");

    const convert = await fetch(`${API}/leads/${lead.id}/convert`, {
      method: "POST",
      headers: hdr(token),
    });
    assert.equal(convert.status, 200);
    assert.equal((await convert.json()).status, "client");

    const pay = await fetch(`${API}/leads/${lead.id}/payment`, {
      method: "PUT",
      headers: hdr(token),
      body: JSON.stringify({ payment_status: "paid" }),
    });
    assert.equal(pay.status, 200);

    const del = await fetch(`${API}/leads/${lead.id}`, { method: "DELETE", headers: hdr(token) });
    assert.equal(del.status, 200);
  });
});
