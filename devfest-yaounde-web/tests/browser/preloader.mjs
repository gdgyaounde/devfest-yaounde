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
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({
  executablePath: process.env.CHROME ?? "/usr/bin/google-chrome",
  headless: "new",
  args: ["--no-sandbox"],
});

try {
  // ---------- it is in the FIRST HTML, not painted after hydration ----------
  const html = await (await fetch(`${BASE}/fr`)).text();
  ok(
    "1 the loader is server-rendered, so there is no flash of the page first",
    html.includes("data-preloader"),
  );

  const p = await b.newPage();
  await p.setViewport({ width: 1440, height: 900 });
  await p.goto(`${BASE}/fr`, { waitUntil: "domcontentloaded" });

  const shot = () =>
    p.evaluate(() => {
      const el = document.querySelector("[data-preloader]");
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const svgText = el.querySelector("text");
      const canvas = el.querySelector("canvas");
      return {
        w: Math.round(r.width),
        h: Math.round(r.height),
        vw: window.innerWidth,
        vh: window.innerHeight,
        bg: cs.backgroundColor,
        opacity: cs.opacity,
        text: svgText?.textContent ?? null,
        fill: svgText?.getAttribute("fill") ?? null,
        textLength: svgText?.getAttribute("textLength") ?? null,
        svgW: Math.round(
          el.querySelector("svg")?.getBoundingClientRect().width ?? 0,
        ),
        hasCanvas: !!canvas,
        focusable: el.querySelectorAll(
          'a,button,input,[tabindex]:not([tabindex="-1"])',
        ).length,
        ariaHidden: el.getAttribute("aria-hidden"),
        bodyOverflow: getComputedStyle(document.body).overflow,
        htmlOverflow: getComputedStyle(document.documentElement).overflow,
      };
    });

  const early = await shot();
  ok(
    "2 it covers the whole viewport",
    early && early.w === early.vw && early.h === early.vh,
    JSON.stringify(early),
  );
  ok(
    "3 the line fills ~80% of the width",
    early && early.svgW / early.vw > 0.75 && early.svgW / early.vw < 0.85,
    `${early?.svgW}/${early?.vw}`,
  );
  ok(
    "4 the width is pinned so the scramble cannot make it jitter",
    early?.textLength === "98",
  );
  ok("5 the text is ink, not the theme colour", early?.fill === "#1E1E1E");
  ok("6 there is a dot canvas behind it", early?.hasCanvas === true);
  ok("7 nothing in it can take focus", early?.focusable === 0);
  ok("8 assistive tech walks straight past it", early?.ariaHidden === "true");
  /* Checked at FIRST PAINT, before hydration — the CSS lock has to hold on
     its own, because `lockScroll()` does not run until the effect does
     (measured ~120ms later). A scripted `window.scrollBy` bypasses
     `overflow: hidden`, so the honest test is a real wheel event. */
  ok(
    "9 the page cannot scroll underneath, from the very first paint",
    early?.bodyOverflow === "hidden" && early?.htmlOverflow === "hidden",
    `body=${early?.bodyOverflow} html=${early?.htmlOverflow}`,
  );
  await p.mouse.move(700, 450);
  await p.mouse.wheel({ deltaY: 900 });
  await wait(250);
  ok(
    "9b and a real wheel gesture moves nothing",
    (await p.evaluate(() => window.scrollY)) === 0,
    String(await p.evaluate(() => window.scrollY)),
  );

  // ---------- the scramble actually runs, and loops ----------
  const samples = [];
  for (let i = 0; i < 12; i++) {
    samples.push((await shot())?.text);
    await wait(70);
  }
  const churned = samples.filter((s) => s && s !== "DevFest Yaoundé").length;
  ok(
    "10 the wordmark is churning, not sitting still",
    churned >= 3,
    JSON.stringify(samples.slice(0, 6)),
  );

  // ---------- it leaves, and quickly ----------
  const start = Date.now();
  await p.waitForFunction(() => !document.querySelector("[data-preloader]"), {
    timeout: 6000,
  });
  const took = Date.now() - start;
  ok(
    "11 it gets out of the way inside two seconds",
    took < 2000,
    `${took}ms after first paint`,
  );
  // The node goes on commit; the effect cleanup that releases the lock runs
  // just after it, so give React the tick rather than racing the flush.
  await wait(120);
  ok(
    "12 and hands scrolling back",
    await p.evaluate(
      () =>
        getComputedStyle(document.body).overflow !== "hidden" &&
        getComputedStyle(document.documentElement).overflow !== "hidden",
    ),
    await p.evaluate(
      () =>
        `${getComputedStyle(document.body).overflow}/${getComputedStyle(document.documentElement).overflow}`,
    ),
  );
  await p.mouse.wheel({ deltaY: 500 });
  await wait(250);
  ok(
    "12b no inline lock is left behind on <html> or <body>",
    await p.evaluate(
      () =>
        document.body.style.overflow === "" &&
        document.documentElement.style.overflow === "",
    ),
    await p.evaluate(
      () =>
        `body="${document.body.style.overflow}" html="${document.documentElement.style.overflow}"`,
    ),
  );
  await p.mouse.wheel({ deltaY: 500 });
  await wait(250);
  ok(
    "12c and the page really does scroll again",
    (await p.evaluate(() => window.scrollY)) > 0,
    String(await p.evaluate(() => window.scrollY)),
  );
  ok(
    "13 the page underneath is intact",
    await p.evaluate(() => !!document.querySelector("#main-content h1")),
  );

  // ---------- theme ----------
  await p.evaluate(() => localStorage.setItem("devfest-theme", "green"));
  await p.goto(`${BASE}/fr`, { waitUntil: "domcontentloaded" });
  const themed = await shot();
  ok(
    "14 the wash follows the saved theme",
    themed && themed.bg !== early.bg,
    `${early?.bg} -> ${themed?.bg}`,
  );
  ok(
    "15 but the text stays ink whatever the theme",
    themed?.fill === "#1E1E1E",
  );
  await p.evaluate(() => localStorage.removeItem("devfest-theme"));

  // ---------- first load only ----------
  await p.goto(`${BASE}/fr`, { waitUntil: "networkidle2" });
  await wait(2200);
  await p.evaluate(() => {
    const link = [...document.querySelectorAll("a")].find((a) =>
      /\/fr\/faqs$/.test(a.getAttribute("href") ?? ""),
    );
    link?.click();
  });
  await wait(900);
  ok(
    "16 a client navigation does not show it again",
    (await p.evaluate(() => !document.querySelector("[data-preloader]"))) &&
      (await p.evaluate(() => location.pathname)).includes("/faqs"),
    await p.evaluate(() => location.pathname),
  );
  await p.close();

  // ---------- reduced motion ----------
  const calm = await b.newPage();
  await calm.setViewport({ width: 1440, height: 900 });
  await calm.emulateMediaFeatures([
    { name: "prefers-reduced-motion", value: "reduce" },
  ]);
  await calm.goto(`${BASE}/fr`, { waitUntil: "domcontentloaded" });
  const calmText = [];
  for (let i = 0; i < 8; i++) {
    calmText.push(
      await calm.evaluate(
        () =>
          document.querySelector("[data-preloader] text")?.textContent ?? null,
      ),
    );
    await wait(70);
  }
  ok(
    "17 reduced motion never scrambles the wordmark",
    calmText.every((t) => t === null || t === "DevFest Yaoundé"),
    JSON.stringify(calmText),
  );
  const dotsA = await calm.evaluate(
    () =>
      document.querySelector("[data-preloader] canvas")?.toDataURL() ?? null,
  );
  await wait(500);
  const dotsB = await calm.evaluate(
    () =>
      document.querySelector("[data-preloader] canvas")?.toDataURL() ?? null,
  );
  ok("18 and the dot field does not drift", dotsA !== null && dotsA === dotsB);
  const calmStart = Date.now();
  await calm.waitForFunction(
    () => !document.querySelector("[data-preloader]"),
    { timeout: 6000 },
  );
  ok("19 it is still brief with reduced motion", Date.now() - calmStart < 2000);
  /* THE CASE THE LOCK BUG WOULD HAVE BROKEN. With nothing to paper over a
     lock left behind, this is a direct check: if the page does not scroll
     here, it does not scroll at all. */
  await wait(150);
  await calm.mouse.move(700, 450);
  await calm.mouse.wheel({ deltaY: 600 });
  await wait(300);
  ok(
    "19b and the page scrolls afterwards",
    (await calm.evaluate(() => window.scrollY)) > 0,
    String(await calm.evaluate(() => window.scrollY)),
  );
  await calm.close();

  // ---------- the dots really do move otherwise ----------
  const moving = await b.newPage();
  await moving.setViewport({ width: 1440, height: 900 });
  await moving.goto(`${BASE}/fr`, { waitUntil: "domcontentloaded" });
  const a = await moving.evaluate(() =>
    document.querySelector("[data-preloader] canvas")?.toDataURL(),
  );
  await wait(420);
  const c = await moving.evaluate(() =>
    document.querySelector("[data-preloader] canvas")?.toDataURL(),
  );
  ok("20 the highlight drifts across the dot field", a && c && a !== c);
  await moving.close();
} catch (err) {
  fails.push(`threw: ${err.message}`);
  console.log("FAIL threw", err);
} finally {
  await b.close();
}

console.log(`\nverify-preloader: ${pass} passed, ${fails.length} failures`);
if (fails.length) console.log(fails.join("\n"));
process.exitCode = fails.length > 0 ? 1 : 0;
