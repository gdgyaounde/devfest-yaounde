import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const isProduction = process.env.NODE_ENV === "production";

/**
 * Security headers (A05 in .claude/skills/devfest-security).
 *
 * Set here rather than in the proxy so they apply to every response — API
 * routes and static assets included — not only to the pages the locale
 * matcher happens to touch.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // No public page needs any of these. The day-of stations get the camera
  // back on their own routes only — see `headers()` below.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  ...(isProduction
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
      ]
    : []),
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // Next's runtime needs inline/eval for hydration and dev refresh.
      isProduction
        ? "script-src 'self' 'unsafe-inline'"
        : "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      // blob: is the DP generator's own canvas output; data: covers inlined
      // icons. Neither reaches the network.
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      // Supabase auth + database over HTTPS and realtime websockets.
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
      // The PawaPay Payment Page is a full redirect, never an iframe.
      "frame-ancestors 'none'",
      "form-action 'self' https://*.pawapay.io",
      "base-uri 'self'",
      "object-src 'none'",
      ...(isProduction ? ["upgrade-insecure-requests"] : []),
    ].join("; "),
  },
];

/**
 * Where a content photo can come from.
 *
 * Everything uploaded through the dashboard lands in the Supabase `editorial`
 * bucket and is served from that project's own hostname, so the pattern is
 * derived from the URL the app is already configured with rather than typed
 * out a second time — one project, one place to change it.
 *
 * An unset or malformed URL yields an EMPTY list rather than a wildcard.
 * `next/image` then refuses every remote host, which is a broken image in
 * development and the correct failure: the alternative is an open image proxy
 * that will resize anything on the internet at our expense.
 */
function supabaseImagePattern() {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!raw) return [];
  try {
    const { hostname } = new URL(raw);
    return [
      {
        protocol: "https" as const,
        hostname,
        pathname: "/storage/v1/object/public/**",
      },
    ];
  } catch {
    return [];
  }
}

const nextConfig: NextConfig = {
  images: {
    remotePatterns: supabaseImagePattern(),
    // AVIF first, WebP behind it. The optimiser picks per request from the
    // browser's Accept header, so an old browser still gets a JPEG.
    formats: ["image/avif", "image/webp"],
    /*
     * SVG is NOT enabled here, and that is deliberate.
     *
     * `dangerouslyAllowSVG` would let /_next/image serve arbitrary SVG, which
     * can carry script. The placeholder art in `public/placeholders` is SVG,
     * so those are passed through `unoptimized` instead — they are 500 bytes
     * each and an optimiser round-trip would make them slower, not faster.
     * See `ContentImage`.
     */
  },
  allowedDevOrigins: ["http://localhost:3000", "192.168.100.15", "10.34.2.185"],
  // The wall is on (ADR 0033). Only an explicit "0" turns it off — an empty
  // string copied from .env.example would otherwise keep it dark in production.
  env: {
    NEXT_PUBLIC_DP_GALLERY:
      process.env.NEXT_PUBLIC_DP_GALLERY === "0" ? "0" : "1",
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      /*
       * The ONE exception to `camera=()`: the day-of stations (ADR 0078,
       * 0079) read ticket QR codes through the phone camera. Scoped to the
       * staff-only volunteer tree and to this origin (`self`), so every
       * public page still cannot ask.
       * Later entries override earlier ones for the same key (Next's
       * headers docs), which is what makes this narrower rule win here.
       */
      {
        source: "/:locale(fr|en)/volunteer/:path*",
        headers: [
          {
            key: "Permissions-Policy",
            value:
              "camera=(self), microphone=(), geolocation=(), interest-cohort=()",
          },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
