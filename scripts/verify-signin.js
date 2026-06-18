/**
 * Verify all demo sign-in accounts. Run: npm run verify-signin
 * (backend must be running on port 5000)
 */
const API = "http://localhost:5000/api";
const accounts = [
  { label: "Admin", email: "admin@partnerportal.com", password: "Admin@123", expectRole: "admin" },
  { label: "Partner Eduosa", email: "aarav@eduosa.in", password: "Partner@123", expectRole: "partner" },
  { label: "Partner C-Forgia", email: "priya@cforgia.in", password: "Partner@123", expectRole: "partner" },
  { label: "Partner Facilo", email: "rahul@facilo.in", password: "Partner@123", expectRole: "partner" },
];

async function check(label, email, password, expectRole) {
  const r = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const text = await r.text();
  if (r.status !== 200) {
    console.log(`FAIL ${label}: ${r.status} ${text}`);
    return false;
  }
  const data = JSON.parse(text);
  const ok = data.user?.role === expectRole && data.token?.length > 20;
  console.log(ok ? `OK   ${label} (${data.user.email})` : `FAIL ${label}: bad response`);
  return ok;
}

async function main() {
  console.log("Checking sign-in at", API);
  let pass = 0;
  for (const a of accounts) {
    if (await check(a.label, a.email, a.password, a.expectRole)) pass++;
  }
  console.log(`\n${pass}/${accounts.length} accounts OK`);
  process.exit(pass === accounts.length ? 0 : 1);
}

main().catch((e) => {
  console.error("Cannot reach backend. Start it first: npm start");
  console.error(e.message);
  process.exit(1);
});
