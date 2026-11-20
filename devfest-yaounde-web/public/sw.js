// DevFest Yaoundé — offline agenda service worker (PHASE22 §F, ADR 0066, ADR 0088)
//
// STRICT ALLOWLIST. Only Schedule, Speakers, Team and FAQs are ever cached,
// in both locales — the eight pathnames in ALLOWED_PATHS below and nothing
// else. Tickets, Shop, checkout, payments, /account and /admin are NEVER
// intercepted by this file: every request to any of them falls straight
// through to the network, exactly as if this service worker did not exist.
// That is not a performance choice to relax later — it is the one thing
// this file must never get wrong. A stale ticket price, a cached checkout
// step, or a payment page served from yesterday is a real-money bug, not a
// rough UX edge, and the only way to guarantee it can't happen is to never
// let those requests reach this file's cache logic AT ALL, rather than
// trust a cache-invalidation rule to catch it later.
//
// ADR 0088 adds three things, none of which widens that rule:
//   1. SAVE THE AGENDA: the page can ask this worker (a "precache" message)
//      to download the four pages of a locale NOW, plus the scripts, styles,
//      fonts and photos those pages use, instead of waiting for each page to
//      be visited. The only URLs fetched are the allowlisted pages and the
//      assets found inside them.
//   2. THE FRONT DOOR: opening the site's home page (the installed app's
//      start URL) while offline redirects to the cached Schedule instead of
//      the browser's error page. Only the home page; nothing else falls back.
//   3. PHOTOS: the optimiser's resized images for those pages are cached, and
//      offline any size of a cached photo is served for any other size.
//
// Written by hand rather than through a caching library: the exact set of
// cached routes is the entire point, and auditing a short allowlist is
// safer than auditing a general-purpose library's config surface for this
// specific guarantee.

const CACHE_NAME = "devfest-offline-v2";
const LOCALES = ["en", "fr"];
const DEFAULT_LOCALE = "fr";
const OFFLINE_PAGES = ["schedule", "speakers", "team", "faqs"];

/** Exact pathnames this worker may ever cache. Nothing else, ever. */
const ALLOWED_PATHS = new Set(
  LOCALES.flatMap((locale) =>
    OFFLINE_PAGES.map((page) => `/${locale}/${page}`),
  ),
);

/**
 * The volunteer backup list's page shell (ADR 0090), the ONE staff page kept
 * for offline use. It is a data-free shell — the roster is fetched into the
 * phone and drawn client-side — and a visitor who is not staff gets a 404 for
 * it, which is never cached (only successful responses are).
 */
const STAFF_OFFLINE_PATHS = new Set(
  LOCALES.map((locale) => `/${locale}/volunteer/backup`),
);

/** The home page in either locale — the only other URL given an offline answer. */
const HOME_PATHS = new Set(["/", "/en", "/en/", "/fr", "/fr/"]);

/** Public files the allowed pages draw (speaker photos, sponsor logos, brand). */
const PUBLIC_ASSET_PREFIXES = ["/speakers/", "/sponsors/", "/logo/"];

self.addEventListener("install", () => {
  // Take over immediately rather than waiting for every open tab to close —
  // there is no versioned data here that an old tab could disagree with,
  // only a cache of public pages.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

function isStaticAsset(pathname) {
  // Next's own build output — content-hashed filenames, immutable once
  // built. Safe to cache broadly: this is shared code and CSS with no page
  // content or per-visitor data of its own, the same bundle every visitor
  // gets regardless of which page they're on.
  return pathname.startsWith("/_next/static/");
}

function isPublicAsset(pathname) {
  return PUBLIC_ASSET_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

/**
 * The optimiser's resized photos (`/_next/image?url=…&w=…&q=…`): cache-first,
 * and when the network is down, ANY cached size of the same source photo
 * stands in for the one asked for — a card that wants 750px is happy with the
 * 640px copy saved earlier, and far better than a hole.
 */
async function imageFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (error) {
    const wanted = new URL(request.url).searchParams.get("url");
    if (wanted) {
      for (const key of await cache.keys()) {
        const u = new URL(key.url);
        if (
          u.pathname === "/_next/image" &&
          u.searchParams.get("url") === wanted
        ) {
          const hit = await cache.match(key);
          if (hit) return hit;
        }
      }
    }
    throw error;
  }
}

/**
 * Serve from cache instantly if there is one, and refresh the cache from
 * the network in the background either way. Offline, the network leg
 * simply fails and the cached copy (if any) is what was already returned.
 *
 * Deliberately NOT cache-first for the four allowed pages: their content
 * (the programme, who's speaking) changes as the event approaches, and an
 * organiser publishing an update should reach anyone with signal on their
 * NEXT visit, not be stuck behind a cache that only ever refreshes when
 * explicitly told to.
 */
async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);
  if (cached) {
    // Let the refresh happen without making this request wait on it.
    network.catch(() => {});
    return cached;
  }
  const fresh = await network;
  return fresh ?? Response.error();
}

/**
 * The home page, online as usual — but if the network is down, send the
 * visitor to the cached Schedule of their language rather than the browser's
 * "no internet" page. Nothing is served stale: it is a redirect to a page
 * that is itself in the allowlist.
 */
async function homeOrSchedule(request) {
  try {
    return await fetch(request);
  } catch (error) {
    const url = new URL(request.url);
    const first = url.pathname.split("/")[1];
    const locale = LOCALES.includes(first) ? first : DEFAULT_LOCALE;
    const cache = await caches.open(CACHE_NAME);
    for (const l of [locale, ...LOCALES.filter((x) => x !== locale)]) {
      const path = `/${l}/schedule`;
      if (await cache.match(path)) {
        return Response.redirect(new URL(path, url.origin).href, 302);
      }
    }
    throw error;
  }
}

// ----------------------------------------------------------- save the agenda

/** Pull the asset URLs a page uses out of its HTML. */
function assetsIn(html, origin) {
  const found = new Set();
  const text = html.replace(/&amp;/g, "&");
  for (const m of text.matchAll(/\/_next\/static\/[^"'\\\s)<>]+/g)) {
    found.add(m[0]);
  }
  for (const prefix of PUBLIC_ASSET_PREFIXES) {
    const re = new RegExp(
      prefix.replace(/\//g, "\\/") + "[^\"'\\\\\\s)<>?]+\\.(?:png|jpe?g|webp|avif|svg)",
      "g",
    );
    for (const m of text.matchAll(re)) found.add(m[0]);
  }
  // Photos go through the optimiser: keep ONE candidate per source photo, the
  // srcset entry nearest 640px, which suits cards on any phone.
  const bySource = new Map();
  for (const m of text.matchAll(/\/_next\/image\?[^"'\\\s<>]+?\s+(\d+)w/g)) {
    const entry = m[0].replace(/\s+\d+w$/, "");
    const width = Number(m[1]);
    const source = new URL(entry, origin).searchParams.get("url");
    if (!source) continue;
    const best = bySource.get(source);
    if (!best || Math.abs(width - 640) < Math.abs(best.width - 640)) {
      bySource.set(source, { entry, width });
    }
  }
  for (const { entry } of bySource.values()) found.add(entry);
  return [...found];
}

/** Fonts and images a stylesheet points at. */
function urlsInCss(css) {
  const found = [];
  for (const m of css.matchAll(/url\((?:"|')?(\/_next\/static\/[^"')]+)/g)) {
    found.push(m[1]);
  }
  return found;
}

async function putIfNeeded(cache, path) {
  if (await cache.match(path)) return true;
  try {
    const response = await fetch(path);
    if (!response.ok) return false;
    await cache.put(path, response.clone());
    return response;
  } catch {
    return false;
  }
}

async function precache(locale, report) {
  const cache = await caches.open(CACHE_NAME);
  const origin = self.location.origin;
  const locales = LOCALES.includes(locale) ? [locale] : [DEFAULT_LOCALE];
  const paths = locales.flatMap((l) => OFFLINE_PAGES.map((p) => `/${l}/${p}`));

  let pages = 0;
  const assets = new Set();
  for (const path of paths) {
    try {
      const response = await fetch(path, { cache: "no-store" });
      if (!response.ok) continue;
      await cache.put(path, response.clone());
      pages++;
      for (const a of assetsIn(await response.text(), origin)) assets.add(a);
    } catch {
      // One page failing must not stop the others.
    }
    report({ type: "progress", done: pages, total: paths.length });
  }

  // Stylesheets reveal fonts: follow them one level.
  const queue = [...assets];
  let done = 0;
  let failed = 0;
  const total = () => queue.length;
  const next = async () => {
    while (queue.length) {
      const path = queue.shift();
      const result = await putIfNeeded(cache, path);
      if (!result) failed++;
      else {
        done++;
        if (result !== true && path.endsWith(".css")) {
          for (const more of urlsInCss(await result.clone().text())) {
            if (!assets.has(more)) {
              assets.add(more);
              queue.push(more);
            }
          }
        }
      }
      report({ type: "progress", done: pages + done, total: paths.length + total() + done });
    }
  };
  await Promise.all([next(), next(), next(), next(), next(), next()]);

  return { ok: pages === paths.length, pages, assets: done, failed };
}

self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || data.type !== "precache") return;
  const port = event.ports && event.ports[0];
  const report = (message) => {
    if (port) port.postMessage(message);
  };
  event.waitUntil(
    precache(data.locale, report)
      .then((result) => report({ type: "done", ...result }))
      .catch(() => report({ type: "done", ok: false, pages: 0, assets: 0, failed: 0 })),
  );
});

// ------------------------------------------------------------------- fetch

self.addEventListener("fetch", (event) => {
  const { request } = event;
  // Never intercept a write, and never intercept a cross-origin request —
  // this file has no business deciding what happens to either.
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (isStaticAsset(url.pathname) || isPublicAsset(url.pathname)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (url.pathname === "/_next/image") {
    event.respondWith(imageFirst(request));
    return;
  }

  if (ALLOWED_PATHS.has(url.pathname) || STAFF_OFFLINE_PATHS.has(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  if (request.mode === "navigate" && HOME_PATHS.has(url.pathname)) {
    event.respondWith(homeOrSchedule(request));
    return;
  }

  // Every other request — tickets, shop, checkout, payments, account,
  // admin, every API route, every other page — is left completely alone.
  // No event.respondWith() call means the browser handles it exactly as
  // if this service worker were not installed.
});
