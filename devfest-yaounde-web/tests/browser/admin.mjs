import puppeteer from "puppeteer-core";
const BASE = process.env.BASE_URL ?? "http://localhost:4399";
let pass = 0;
const fails = [];
const ok = (n, c, d = "") => {
  if (c) {
    pass++;
    console.log(`PASS ${n}`);
  } else {
    fails.push(n);
    console.log(`FAIL ${n} ${d}`);
  }
};
const code = async (path, init) => (await fetch(`${BASE}${path}`, init)).status;

try {
  // ============ the gate, from outside a browser ============
  ok(
    "1 the dashboard is not reachable without a session",
    (await code("/en/admin")) === 404,
  );
  ok("2 nor in the other locale", (await code("/fr/admin")) === 404);
  ok(
    "3 a forged session cookie changes nothing",
    (await code("/en/admin", {
      headers: { Cookie: "sb-access-token=forged; sb-refresh-token=forged" },
    })) === 404,
  );
  ok(
    "4 and there is no client flag to flip",
    (await code("/en/admin", {
      headers: { Cookie: "isAdmin=true; admin=1; role=organiser" },
    })) === 404,
  );

  const body = await (await fetch(`${BASE}/en/admin`)).text();
  ok(
    "5 the refusal leaks no dashboard data",
    !/settled revenue|badge_code|deposit_id|attendee_email|discount_codes/i.test(
      body,
    ),
  );
  ok(
    "6 and does not confirm the route by name",
    !body.includes("Admin ·"),
    "the title still names it",
  );

  // ============ the organiser APIs the dashboard writes through ============
  ok(
    "7 the order-status write refuses a stranger",
    [401, 403].includes(
      await code("/api/orders/00000000-0000-0000-0000-000000000000/status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "delivered" }),
      }),
    ),
  );
  ok(
    "8 the check-in endpoint refuses a stranger",
    [401, 403].includes(
      await code("/api/check-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ badgeCode: "DFY-AAAAA-BBBBB" }),
      }),
    ),
  );
  ok(
    "9 the moderation queue refuses a stranger",
    [401, 403, 404].includes(await code("/api/dp/gallery/pending")),
  );
  ok(
    "9b the refund-request tracker refuses a stranger",
    [401, 403].includes(
      await code("/api/admin/refund-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "tickets",
          reference: "x",
          requesterName: "x",
          requesterEmail: "x@example.com",
          reason: "x",
        }),
      }),
    ),
  );

  // ---- promoting / demoting admins (PHASE23 §E): the highest-stakes write ----
  const roleBody = JSON.stringify({
    userId: "00000000-0000-4000-8000-000000000000",
    action: "promote",
    confirmEmail: "someone@example.com",
  });
  const roleReq = (extra = {}) => ({
    method: "POST",
    headers: { "Content-Type": "application/json", ...extra },
    body: roleBody,
  });
  ok(
    "9c the role-management endpoint refuses a stranger",
    (await code("/api/admin/organisers", roleReq())) === 403,
  );
  ok(
    "9d ...and forged session / admin cookies change nothing",
    (await code(
      "/api/admin/organisers",
      roleReq({
        Cookie: "sb-access-token=forged; isAdmin=true; role=organiser",
      }),
    )) === 403,
  );
  const cross = await fetch(
    `${BASE}/api/admin/organisers`,
    roleReq({ Origin: "https://evil.example" }),
  );
  ok(
    "9e ...a cross-site request is refused before any session is read",
    cross.status === 403 && (await cross.json()).error === "cross_origin",
  );
  ok(
    "9f ...and a body that is not JSON is refused",
    (await code("/api/admin/organisers", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: roleBody,
    })) === 400,
  );
  ok(
    "9g ...GET is not a thing it does",
    [404, 405].includes(await code("/api/admin/organisers")),
  );

  // ============ not advertised ============
  const sitemap = await (await fetch(`${BASE}/sitemap.xml`)).text();
  ok("10 admin is absent from the sitemap", !sitemap.includes("admin"));
  const robotsMeta = /<meta name="robots"[^>]*noindex/i.test(body);
  ok(
    "11 and carries noindex even on the refusal",
    robotsMeta,
    "no noindex meta",
  );

  const b = await puppeteer.launch({
    executablePath: process.env.CHROME ?? "/usr/bin/google-chrome",
    headless: "new",
    args: ["--no-sandbox"],
  });
  const p = await b.newPage();
  await p.setViewport({ width: 1280, height: 900 });
  await p.goto(`${BASE}/en`, { waitUntil: "networkidle2" });
  await new Promise((r) => setTimeout(r, 2200));
  const links = await p.evaluate(() =>
    [...document.querySelectorAll("a[href]")].map((a) =>
      a.getAttribute("href"),
    ),
  );
  ok(
    "12 nothing on the public site links to it",
    !links.some((h) => (h ?? "").includes("admin")),
  );
  await p.close();
  await b.close();
} catch (err) {
  fails.push(`threw: ${err.message}`);
  console.log("FAIL threw", err);
}

console.log(`\nverify-admin: ${pass} passed, ${fails.length} failures`);
if (fails.length) console.log(fails.join("\n"));
process.exitCode = fails.length > 0 ? 1 : 0;
