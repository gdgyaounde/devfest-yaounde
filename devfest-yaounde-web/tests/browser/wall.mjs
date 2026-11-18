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

/** Where each column's track currently sits. */
const offsets = (p) =>
  p.evaluate(() =>
    [...document.querySelectorAll(".wall-column > div")].map((t) => {
      const m = /translate3d\(0px,\s*(-?[\d.]+)px/.exec(
        t.style.transform || "",
      );
      return m ? Number(m[1]) : null;
    }),
  );

try {
  const p = await b.newPage();
  await p.setViewport({ width: 1440, height: 860 });
  await p.goto(`${BASE}/en/wall`, { waitUntil: "networkidle2" });
  await wait(2400); // let the preloader clear

  // ---------------- chrome ----------------
  const chrome = await p.evaluate(() => {
    const header = document.querySelector("header");
    const r = header.getBoundingClientRect();
    const banner = header.querySelector('[class*="bg-primary"]');
    return {
      headerBottom: Math.round(r.bottom),
      headerTop: Math.round(r.top),
      vh: window.innerHeight,
      dismissButtons: [...header.querySelectorAll("button")].filter((x) =>
        /dismiss|fermer/i.test(x.getAttribute("aria-label") ?? ""),
      ).length,
      bannerText: banner?.textContent?.trim() ?? "",
      footer: !!document.querySelector("footer"),
      footerShown: document.querySelector("footer")
        ? getComputedStyle(document.querySelector("footer")).display !== "none"
        : false,
    };
  });
  ok(
    "1 the bar sits at the bottom on this page",
    chrome.vh - chrome.headerBottom < 40 && chrome.headerTop > chrome.vh / 2,
    JSON.stringify(chrome),
  );
  ok(
    "2 the announcement cannot be dismissed here",
    chrome.dismissButtons === 0,
  );
  ok(
    "3 the bar thanks the community rather than selling anything",
    /community/i.test(chrome.bannerText) &&
      !/get tickets|grab your|shop now|make yours/i.test(chrome.bannerText),
    chrome.bannerText.slice(0, 80),
  );
  ok(
    "4 the footer is not in the way of a page that cannot scroll",
    chrome.footerShown === false,
  );

  // ---------------- no page scroll ----------------
  await p.mouse.move(720, 400);
  await p.mouse.wheel({ deltaY: 1200 });
  await wait(300);
  ok(
    "5 the page itself does not scroll",
    (await p.evaluate(() => window.scrollY)) === 0,
    String(await p.evaluate(() => window.scrollY)),
  );

  // ---------------- the wall itself ----------------
  const shape = await p.evaluate(() => {
    const cols = [...document.querySelectorAll(".wall-column")];
    const rects = cols.map((c) => c.getBoundingClientRect());
    const tilt = getComputedStyle(
      document.querySelector(".wall-tilt"),
    ).transform;
    const fade = getComputedStyle(document.querySelector("[data-dp-wall]"));
    return {
      columns: cols.length,
      firstLeft: Math.round(rects[0].left),
      lastRight: Math.round(rects[rects.length - 1].right),
      vw: window.innerWidth,
      tilt,
      mask: fade.maskImage || fade.webkitMaskImage,
    };
  });
  ok("6 it fits several columns", shape.columns >= 6, String(shape.columns));
  ok(
    "7 the edge columns run off both sides",
    shape.firstLeft < -40 && shape.lastRight > shape.vw + 40,
    `left=${shape.firstLeft} right=${shape.lastRight} vw=${shape.vw}`,
  );
  ok(
    "8 the whole wall is tilted",
    shape.tilt !== "none" && shape.tilt.startsWith("matrix"),
    shape.tilt,
  );
  ok(
    "9 the edge fade is a mask, not a painted gradient",
    /gradient/.test(shape.mask ?? ""),
    String(shape.mask).slice(0, 60),
  );

  // ---------------- motion ----------------
  const a = await offsets(p);
  await wait(900);
  const c = await offsets(p);
  const moved = a.map((v, i) => (v === null || c[i] === null ? 0 : c[i] - v));
  ok(
    "10 the columns are moving",
    moved.filter((d) => Math.abs(d) > 3).length >= shape.columns - 1,
    JSON.stringify(moved.map((n) => Math.round(n))),
  );
  const up = moved.filter((d) => d < -3).length;
  const down = moved.filter((d) => d > 3).length;
  ok(
    "11 they alternate direction",
    up > 0 && down > 0,
    `up=${up} down=${down}`,
  );
  ok(
    "12 slowly enough to read a card as it passes",
    moved.every((d) => Math.abs(d) < 60),
    JSON.stringify(moved.map((n) => Math.round(n))),
  );

  // ---------------- hover ----------------
  const target = await p.evaluate(() => {
    const inside = (r) => {
      const cx = r.x + r.width / 2,
        cy = r.y + r.height / 2;
      return cx > 350 && cx < window.innerWidth - 350 && cy > 220 && cy < 620;
    };
    const tiles = [...document.querySelectorAll(".wall-tile")].filter((t) =>
      inside(t.getBoundingClientRect()),
    );
    const t = tiles[0];
    if (!t) return null;
    const r = t.getBoundingClientRect();
    const column = [...document.querySelectorAll(".wall-column")].findIndex(
      (c) => c.contains(t),
    );
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, column };
  });
  ok("13 there is a card to point at", target !== null);
  await p.mouse.move(target.x, target.y);
  await wait(700);
  const duringA = await offsets(p);
  await wait(700);
  const duringB = await offsets(p);
  ok(
    "14 pointing at a card stops its column",
    Math.abs(duringB[target.column] - duringA[target.column]) < 1.5,
    `${duringA[target.column]} -> ${duringB[target.column]}`,
  );
  ok(
    "15 the other columns keep moving",
    duringB.filter(
      (v, i) => i !== target.column && Math.abs(v - duringA[i]) > 3,
    ).length >= 3,
  );

  const spot = await p.evaluate(() => {
    const lit = document.querySelector(".wall-tile.is-spotlit");
    const dim = [...document.querySelectorAll(".wall-tile.is-dimmed")];
    if (!lit) return null;
    const t = getComputedStyle(lit).transform;
    const sameColumn = [
      ...lit.closest(".wall-column").querySelectorAll(".wall-tile.is-dimmed"),
    ].length;
    return {
      transform: t,
      dimmed: dim.length,
      dimmedInSameColumn: sameColumn,
      dimOpacity: dim[0] ? Number(getComputedStyle(dim[0]).opacity) : 1,
      litOpacity: Number(getComputedStyle(lit).opacity),
    };
  });
  ok(
    "16 the hovered card is scaled and rotated",
    spot &&
      spot.transform.startsWith("matrix") &&
      spot.transform !== "matrix(1, 0, 0, 1, 0, 0)",
    spot?.transform,
  );
  ok(
    "17 everything else is dimmed",
    spot && spot.dimmed > 10 && spot.dimOpacity < 0.5,
    `${spot?.dimmed} dimmed at ${spot?.dimOpacity}`,
  );
  ok(
    "18 including the still cards in its own column",
    spot && spot.dimmedInSameColumn > 0,
    String(spot?.dimmedInSameColumn),
  );
  ok("19 and the hovered one is not", spot && spot.litOpacity > 0.95);

  /* Off the wall entirely, which means the bottom bar — the wall covers every
     other pixel, so moving to a "blank" corner just hovers a different card
     and the spotlight correctly follows. */
  const barY = await p.evaluate(() =>
    Math.round(
      document.querySelector("header").getBoundingClientRect().top + 40,
    ),
  );
  await p.mouse.move(720, barY);
  await wait(600);
  const afterA = await offsets(p);
  await wait(700);
  ok(
    "20 moving away starts the column again",
    Math.abs((await offsets(p))[target.column] - afterA[target.column]) > 3,
  );
  ok(
    "21 and nothing stays dimmed once the pointer is off the wall",
    (await p.evaluate(
      () => document.querySelectorAll(".wall-tile.is-dimmed").length,
    )) === 0,
    String(
      await p.evaluate(
        () => document.querySelectorAll(".wall-tile.is-dimmed").length,
      ),
    ),
  );

  // ---------------- this round's edits ----------------
  const edits = await p.evaluate(() => {
    const tiles = [...document.querySelectorAll(".wall-tile")];
    const col = document.querySelector(".wall-column");
    const ratios = new Set(
      tiles.map((t) => {
        const img = t.querySelector("img");
        const r = img.getBoundingClientRect();
        return Math.abs(r.width - r.height) < 4 ? "square" : "tall";
      }),
    );
    return {
      captions: document.querySelectorAll(".wall-tile figcaption").length,
      columnOverflow: getComputedStyle(col).overflow,
      cardWidth: Math.round(tiles[0]?.getBoundingClientRect().width ?? 0),
      ratios: [...ratios],
      altHasName:
        (tiles[0]?.querySelector("img")?.getAttribute("alt") ?? "").length > 3,
    };
  });
  ok("21b no names are printed under the cards", edits.captions === 0);
  ok(
    "21c the name still reaches assistive tech through the alt",
    edits.altHasName,
  );
  ok(
    "21d the cards are big enough to be somebody's face",
    edits.cardWidth > 230,
    `${edits.cardWidth}px`,
  );
  ok(
    "21e the wall mixes square and tall cards",
    edits.ratios.length === 2,
    edits.ratios.join(","),
  );
  ok(
    "21f a column no longer clips its own cards",
    edits.columnOverflow !== "hidden",
    edits.columnOverflow,
  );

  /* The bug: a spotlit card scaled up and its enlarged edges were sliced off
     by the column. Its painted box must now exceed the column's width. */
  const lift = await p.evaluate(() => {
    const tiles = [...document.querySelectorAll(".wall-tile")].filter((t) => {
      const r = t.getBoundingClientRect();
      const cx = r.x + r.width / 2,
        cy = r.y + r.height / 2;
      return cx > 350 && cx < window.innerWidth - 350 && cy > 220 && cy < 620;
    });
    const t = tiles[0];
    if (!t) return null;
    const r = t.getBoundingClientRect();
    return {
      x: r.x + r.width / 2,
      y: r.y + r.height / 2,
      w: r.width,
      colW: t.closest(".wall-column").getBoundingClientRect().width,
    };
  });
  if (lift) {
    await p.mouse.move(lift.x, lift.y);
    await wait(600);
    const grown = await p.evaluate(() => {
      const el = document.querySelector(".wall-tile.is-spotlit");
      const r = el.getBoundingClientRect();
      return { w: r.width, z: Number(getComputedStyle(el).zIndex) };
    });
    /* The wall is rotated, so a bounding box is an axis-aligned envelope and
       comparing a tile's width to its column's is not meaningful. What IS
       meaningful: the card really grows, and (21f) nothing clips it. */
    ok(
      "21g the spotlit card actually grows rather than being cropped in place",
      grown.w > lift.w + 8,
      `${Math.round(lift.w)} -> ${Math.round(grown.w)}`,
    );
    ok("21h and paints above the other columns", grown.z >= 5, String(grown.z));
    await p.mouse.move(
      720,
      await p.evaluate(() =>
        Math.round(
          document.querySelector("header").getBoundingClientRect().top + 40,
        ),
      ),
    );
    await wait(500);
  }

  // ---------------- the cards are honest ----------------
  const honest = await p.evaluate(() => ({
    notice: document.body.innerText,
    imgs: [...document.querySelectorAll(".wall-tile img")].length,
    placeholderSrc: [...document.querySelectorAll(".wall-tile img")].every(
      (i) => i.getAttribute("src").startsWith("/placeholders/"),
    ),
    duplicatesHidden:
      [...document.querySelectorAll('.wall-tile[aria-hidden="true"]')].length >
      0,
  }));
  ok(
    "22 it says on screen that these are not real people",
    /not real people/i.test(honest.notice),
  );
  ok(
    "23 every card is a placeholder asset",
    honest.placeholderSrc && honest.imgs > 20,
  );
  ok(
    "24 the looping duplicates are hidden from assistive tech",
    honest.duplicatesHidden,
  );

  // ---------------- not indexed ----------------
  const head = await p.evaluate(() => ({
    robots: document.querySelector('meta[name="robots"]')?.content ?? "",
  }));
  ok(
    "25 the wall is noindex — consent to be on it is not consent to be in a search result",
    /noindex/.test(head.robots),
    head.robots,
  );
  const sitemap = await (await fetch(`${BASE}/sitemap.xml`)).text();
  ok("26 and it is absent from the sitemap", !sitemap.includes("/wall"));
  await p.close();

  // ---------------- French ----------------
  const fr = await b.newPage();
  await fr.setViewport({ width: 1440, height: 860 });
  await fr.goto(`${BASE}/fr/wall`, { waitUntil: "networkidle2" });
  await wait(2400);
  const frText = await fr.evaluate(() => document.body.innerText);
  ok(
    "27 the French wall is translated",
    /communauté/i.test(frText) && /pas de vraies personnes/i.test(frText),
  );
  ok(
    "28 no English leaks in",
    !/not real people|for the community/i.test(frText),
  );
  await fr.close();

  // ---------------- reduced motion ----------------
  const calm = await b.newPage();
  await calm.setViewport({ width: 1440, height: 860 });
  await calm.emulateMediaFeatures([
    { name: "prefers-reduced-motion", value: "reduce" },
  ]);
  await calm.goto(`${BASE}/en/wall`, { waitUntil: "networkidle2" });

  await wait(2400);
  const calmA = await offsets(calm);
  await wait(900);
  const calmB = await offsets(calm);
  ok(
    "29 reduced motion: nothing drifts",
    calmA.every((v) => v === null) || calmA.every((v, i) => v === calmB[i]),
    JSON.stringify(calmA.slice(0, 4)),
  );
  /* The WALL scrolls, not the window: the page is a viewport-tall box and the
     wall inside it is the scroll container. What matters is that the rest of
     the cards can be reached at all. */
  const reach = await calm.evaluate(() => {
    const w = document.querySelector("[data-dp-wall]");
    return {
      overflow: getComputedStyle(w).overflowY,
      scrollable: w.scrollHeight - w.clientHeight,
    };
  });
  ok(
    "30 the wall becomes an ordinary scrollable list",
    reach.overflow === "auto" && reach.scrollable > 400,
    JSON.stringify(reach),
  );
  await calm.mouse.move(720, 400);
  await calm.mouse.wheel({ deltaY: 900 });
  await wait(400);
  ok(
    "30b and a wheel actually reaches the rest of the cards",
    (await calm.evaluate(
      () => document.querySelector("[data-dp-wall]").scrollTop,
    )) > 100,
    String(
      await calm.evaluate(
        () => document.querySelector("[data-dp-wall]").scrollTop,
      ),
    ),
  );
  await calm.close();
} catch (err) {
  fails.push(`threw: ${err.message}`);
  console.log("FAIL threw", err);
} finally {
  await b.close();
}

console.log(`\nverify-wall: ${pass} passed, ${fails.length} failures`);
if (fails.length) console.log(fails.join("\n"));
process.exitCode = fails.length > 0 ? 1 : 0;
