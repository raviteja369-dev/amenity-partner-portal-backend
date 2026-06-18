/**
 * API regression tests — run against a live server:
 *   REACT_APP_BACKEND_URL=http://localhost:5000 node --test tests/api.test.js
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

const BASE = (process.env.REACT_APP_BACKEND_URL || "http://localhost:5000").replace(/\/$/, "");
const API = `${BASE}/api`;

const ADMIN = { email: "admin@partnerportal.com", password: "Admin@123" };
const PARTNER = { email: "aarav@eduosa.in", password: "Partner@123" };

async function login(creds) {
  const r = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(creds),
  });
  assert.equal(r.status, 200, `login failed: ${await r.text()}`);
  return r.json();
}

function hdr(token) {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

describe("Auth", () => {
  it("login admin", async () => {
    const { user, token } = await login(ADMIN);
    assert.equal(user.role, "admin");
    assert.ok(token.length > 20);
  });

  it("login partner", async () => {
    const { user } = await login(PARTNER);
    assert.equal(user.role, "partner");
    assert.equal(user.brand, "eduosa");
  });

  it("rejects invalid login", async () => {
    const r = await fetch(`${API}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "nobody@x.com", password: "bad" }),
    });
    assert.equal(r.status, 401);
  });

  it("me requires auth", async () => {
    const r = await fetch(`${API}/auth/me`);
    assert.equal(r.status, 401);
  });
});

describe("Partners", () => {
  it("lists seeded partners", async () => {
    const { token } = await login(ADMIN);
    const r = await fetch(`${API}/partners`, { headers: hdr(token) });
    assert.equal(r.status, 200);
    const data = await r.json();
    assert.ok(data.length >= 3);
    assert.ok(data[0].leads_count !== undefined);
  });
});

describe("Dashboard", () => {
  it("admin dashboard kpis", async () => {
    const { token } = await login(ADMIN);
    const r = await fetch(`${API}/dashboard/admin`, { headers: hdr(token) });
    assert.equal(r.status, 200);
    const d = await r.json();
    assert.ok(d.kpis.total_partners >= 3);
    assert.ok(Array.isArray(d.by_partner));
  });
});
