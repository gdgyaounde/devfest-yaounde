/**
 * Tests for the money path.
 *
 * Scope: the pure logic — pricing, badge codes, callback verification,
 * catalog rules. Anything needing Supabase or the PawaPay API is exercised
 * through the runbook (docs/guides/payments-runbook.md), not here.
 *
 * Run with `npm test`.
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createHash,
  generateKeyPairSync,
  sign as cryptoSign,
} from "node:crypto";

import { normalizeMetadata } from "@/lib/pawapay/metadata";
import {
  assertBadgeSecretConfigured,
  badgeCode,
  badgeCodesFor,
  verifyBadgeCode,
} from "@/lib/security/badge-code";
import {
  assertClaimSecretConfigured,
  claimToken,
  verifyClaimToken,
} from "@/lib/security/claim-token";
import { feeInclusiveAmount, transactionFeeAmount } from "@/lib/payments/fees";
import { verifyCallback } from "@/lib/pawapay/verify";
import {
  finalise,
  quoteTickets,
  quoteCart,
  quoteTierCounts,
  type DiscountRow,
} from "@/lib/payments/pricing";
import { refundAcknowledgment } from "@/lib/payments/terms";
import ticketTiersJson from "@/data/ticket-tiers.json";
import type { TicketTier } from "@/data/types";

const ticketTiers = ticketTiersJson as TicketTier[];
import {
  ticketCheckoutSchema,
  shopCheckoutSchema,
  fulfilmentRequestSchema,
} from "@/lib/payments/schemas";
import {
  CHECKOUT_ERRORS,
  CheckoutError,
  isDiscountFailure,
} from "@/lib/payments/errors";
import { isDiscountFailure as clientIsDiscountFailure } from "@/lib/checkout-client";
import {
  renderOrderReceipt,
  renderTicketClaim,
  renderTicketReceipt,
} from "@/lib/email/templates";
import type { PaymentIntentRow } from "@/lib/payments/intents";
import {
  allProducts,
  declaredStock,
  findProduct,
  findTier,
  isValidVariant,
  isPurchasable,
  sellableTiers,
  variantCapacities,
  variantKey,
} from "@/lib/payments/catalog";
import { dpFileName } from "@/lib/dp/compose";
import { shareCaption } from "@/lib/dp/share";
import {
  EVENT,
  eventDateParts,
  eventDates,
  eventHasEnded,
  eventJsonLd,
  formatEventDates,
  organizationJsonLd,
  PAST_GALLERY_YEAR,
  withinPostEventRevalidateWindow,
} from "@/lib/event";
import { dateForDay } from "@/lib/calendar";
import { layoutCard, PAD, PLATE_INSET } from "@/lib/dp/geometry";
import { ALL_STICKERS, TEXT_STICKERS, stickerName } from "@/lib/dp/stickers";
import { galleryEnabled, GALLERY_MAX_EDGE } from "@/lib/dp/gallery";
import {
  csvCell,
  toCsv,
  parseCsv,
  dryRun,
  looksLikeFormula,
} from "@/lib/admin/csv";
import {
  hashToken,
  mintDeletionToken,
  normaliseImage,
  tokensMatch,
  MAX_EDGE,
  MAX_BYTES,
} from "@/lib/dp/gallery-server";
import { galleryConsentText } from "@/lib/dp/gallery-consent";
import {
  DEFAULT_RETENTION_DAYS,
  purgeExpiredCards,
} from "@/lib/dp/gallery-retention";
import { dealColumns } from "@/lib/dp/wall-layout";

const DEPOSIT = "11111111-2222-3333-4444-555555555555";

before(() => {
  process.env.BADGE_CODE_SECRET = "test-secret-that-is-comfortably-long-enough";
  process.env.CLAIM_TOKEN_SECRET =
    "another-test-secret-comfortably-long-enough";
});

after(() => {
  delete process.env.BADGE_CODE_SECRET;
  delete process.env.CLAIM_TOKEN_SECRET;
});

/** Helper: assert a promise rejects with a specific checkout error code. */
async function rejectsWith(promise: Promise<unknown>, code: string) {
  await assert.rejects(promise, (err: unknown) => {
    assert.ok(
      err instanceof CheckoutError,
      `expected CheckoutError, got ${err}`,
    );
    assert.equal(err.code, code);
    return true;
  });
}

describe("badge codes", () => {
  it("are deterministic, so a replayed callback regenerates the same code", () => {
    assert.equal(badgeCode(DEPOSIT, 1), badgeCode(DEPOSIT, 1));
  });

  it("differ per attendee and per deposit", () => {
    assert.notEqual(badgeCode(DEPOSIT, 1), badgeCode(DEPOSIT, 2));
    assert.notEqual(
      badgeCode(DEPOSIT, 1),
      badgeCode("99999999-2222-3333-4444-555555555555", 1),
    );
  });

  it("use an unambiguous alphabet and a readable shape", () => {
    const code = badgeCode(DEPOSIT, 1);
    assert.match(code, /^DFY-[0-9A-HJ-NP-TV-Z]{5}-[0-9A-HJ-NP-TV-Z]{5}$/);
    // I, L, O and U are excluded so nothing is misread off a phone screen.
    assert.ok(!/[ILOU]/.test(code.slice(4)));
  });

  it("generate one code per attendee, in order", () => {
    const codes = badgeCodesFor(DEPOSIT, 3);
    assert.equal(codes.length, 3);
    assert.deepEqual(
      codes,
      [1, 2, 3].map((i) => badgeCode(DEPOSIT, i)),
    );
    assert.equal(new Set(codes).size, 3);
  });

  it("verify only against the right deposit and position", () => {
    const code = badgeCode(DEPOSIT, 2);
    assert.ok(verifyBadgeCode(code, DEPOSIT, 2));
    assert.ok(!verifyBadgeCode(code, DEPOSIT, 1));
    assert.ok(!verifyBadgeCode("DFY-AAAAA-AAAAA", DEPOSIT, 2));
  });

  it("are refused at checkout time when the secret is unusable", () => {
    const saved = process.env.BADGE_CODE_SECRET;

    // An EMPTY value must fail exactly like an absent one — both describe a
    // deployment that cannot issue a ticket, and the failure has to surface
    // before a payment page exists rather than after the buyer has paid.
    process.env.BADGE_CODE_SECRET = "";
    assert.throws(assertBadgeSecretConfigured, /BADGE_CODE_SECRET/);

    delete process.env.BADGE_CODE_SECRET;
    assert.throws(assertBadgeSecretConfigured, /BADGE_CODE_SECRET/);

    process.env.BADGE_CODE_SECRET = "too-short";
    assert.throws(assertBadgeSecretConfigured, /BADGE_CODE_SECRET/);

    process.env.BADGE_CODE_SECRET = saved;
    assert.doesNotThrow(assertBadgeSecretConfigured);
  });

  it("refuse to run without a strong secret", () => {
    const saved = process.env.BADGE_CODE_SECRET;
    process.env.BADGE_CODE_SECRET = "short";
    assert.throws(() => badgeCode(DEPOSIT, 1), /BADGE_CODE_SECRET/);
    process.env.BADGE_CODE_SECRET = saved;
  });
});

describe("ticket claim tokens", () => {
  const TICKET_A = "aaaaaaaa-2222-3333-4444-555555555555";
  const TICKET_B = "bbbbbbbb-2222-3333-4444-555555555555";

  it("are deterministic for the same ticket", () => {
    assert.equal(claimToken(TICKET_A), claimToken(TICKET_A));
  });

  it("differ per ticket", () => {
    assert.notEqual(claimToken(TICKET_A), claimToken(TICKET_B));
  });

  it("verify only against the right ticket", () => {
    const token = claimToken(TICKET_A);
    assert.ok(verifyClaimToken(token, TICKET_A));
    assert.ok(!verifyClaimToken(token, TICKET_B));
  });

  it("reject a tampered or unrelated token", () => {
    assert.ok(!verifyClaimToken("not-a-real-token", TICKET_A));
    assert.ok(!verifyClaimToken(claimToken(TICKET_A) + "x", TICKET_A));
  });

  it("use a different secret from badge codes — rotating one never touches the other", () => {
    // Same ticket id used as both a deposit id (badge codes) and a ticket id
    // (claim tokens) on purpose: if the two ever shared a key, the two
    // strings would collide by construction.
    assert.notEqual(badgeCode(TICKET_A, 1), claimToken(TICKET_A));
  });

  it("are refused at checkout time when the secret is unusable", () => {
    const saved = process.env.CLAIM_TOKEN_SECRET;

    process.env.CLAIM_TOKEN_SECRET = "";
    assert.throws(assertClaimSecretConfigured, /CLAIM_TOKEN_SECRET/);

    delete process.env.CLAIM_TOKEN_SECRET;
    assert.throws(assertClaimSecretConfigured, /CLAIM_TOKEN_SECRET/);

    process.env.CLAIM_TOKEN_SECRET = "too-short";
    assert.throws(assertClaimSecretConfigured, /CLAIM_TOKEN_SECRET/);

    process.env.CLAIM_TOKEN_SECRET = saved;
    assert.doesNotThrow(assertClaimSecretConfigured);
  });
});

describe("the 1.5% transaction fee, rounded up to the next 50 XAF", () => {
  // The brief's formula, written out independently in exact BigInt integer
  // arithmetic, so the implementation is checked against something that
  // shares none of its floating-point behaviour.
  const reference = (base: number) => {
    const n = BigInt(base) * BigInt(1015);
    const d = BigInt(50000);
    return Number(((n + d - BigInt(1)) / d) * BigInt(50));
  };

  it("matches the worked examples from the brief", () => {
    assert.equal(feeInclusiveAmount(2000), 2050); // 2030 -> up
    assert.equal(feeInclusiveAmount(5000), 5100); // 5075 -> up
    assert.equal(feeInclusiveAmount(10000), 10150); // already a multiple of 50
  });

  it("leaves a figure that already lands on a multiple of 50 unchanged", () => {
    // 10000 * 1.015 = 10150 exactly; the ceiling must not push it to 10200.
    assert.equal(feeInclusiveAmount(10000), 10150);
    assert.equal(feeInclusiveAmount(20000), 20300);
    assert.equal(feeInclusiveAmount(50000), 50750);
  });

  it("rounds UP, never to the nearest — 1000 -> 1015 -> 1050, not 1000", () => {
    assert.equal(feeInclusiveAmount(1000), 1050);
    assert.equal(feeInclusiveAmount(3600), 3700); // 3654 -> up
    assert.equal(feeInclusiveAmount(100), 150); // 101.5 -> up
  });

  it("is zero on a zero base — a genuinely free ticket stays free", () => {
    assert.equal(feeInclusiveAmount(0), 0);
    assert.equal(transactionFeeAmount(0), 0);
  });

  it("agrees with the exact BigInt reference for every base in a wide range", () => {
    for (let base = 0; base <= 60000; base++) {
      assert.equal(feeInclusiveAmount(base), reference(base), `base ${base}`);
    }
    // Round admin-style prices well past that, on a coarser step.
    for (let base = 60000; base <= 5_000_000; base += 250) {
      assert.equal(feeInclusiveAmount(base), reference(base), `base ${base}`);
    }
  });

  it("always returns a multiple of 50, at least base + 1.5%, and under 50 above it", () => {
    for (const base of [1, 3, 7, 33, 101, 999, 12345, 30000, 999999]) {
      const out = feeInclusiveAmount(base);
      assert.equal(out % 50, 0, `${out} is not a multiple of 50`);
      assert.ok(
        out >= base * 1.015 - 1e-9,
        `${out} under base+1.5% for ${base}`,
      );
      assert.ok(out < base * 1.015 + 50, `${out} rounded up by 50 or more`);
    }
  });

  it("transactionFeeAmount is always exactly the difference the price adds", () => {
    // 1.5% AND the round-up together, so a summary's rows can't drift from
    // the charged total.
    for (const base of [0, 1, 100, 1015, 2000, 30000, 999999]) {
      assert.equal(transactionFeeAmount(base), feeInclusiveAmount(base) - base);
      assert.equal(base + transactionFeeAmount(base), feeInclusiveAmount(base));
    }
  });

  it("a tiny post-discount remainder still costs at least 50 XAF, and 0 stays 0", () => {
    // Documented consequence of rounding UP (ADR 0068): 10 XAF left after a
    // discount is charged 50, not 10. A fully-discounted order is still free.
    assert.equal(feeInclusiveAmount(10), 50);
    assert.equal(feeInclusiveAmount(0), 0);
  });
});

describe("pawapay metadata", () => {
  it("normalises the array-of-single-key-objects shape", () => {
    assert.deepEqual(
      normalizeMetadata([{ userId: "u1" }, { kind: "tickets" }]),
      {
        userId: "u1",
        kind: "tickets",
      },
    );
  });

  it("normalises the fieldName/fieldValue shape", () => {
    assert.deepEqual(
      normalizeMetadata([{ fieldName: "userId", fieldValue: "u1" }]),
      { userId: "u1" },
    );
  });

  it("normalises a flat record, and survives junk", () => {
    assert.deepEqual(normalizeMetadata({ a: 1 }), { a: "1" });
    assert.deepEqual(normalizeMetadata(null), {});
    assert.deepEqual(normalizeMetadata("nonsense"), {});
  });
});

describe("callback verification", () => {
  const url = new URL("https://example.com/api/payments/pawapay/callback");
  const body = JSON.stringify({ depositId: DEPOSIT });

  it("skips every check and never rejects when nothing is configured", () => {
    const report = verifyCallback(
      { method: "POST", url, headers: new Headers() },
      body,
    );
    assert.equal(report.reject, false);
    assert.equal(report.ip, "skipped");
    assert.equal(report.signature, "skipped");
  });

  it("accepts a correct Content-Digest", () => {
    // sha-256 of the body, base64 — computed the same way the sender would.
    const digest = createHash("sha256").update(body, "utf8").digest("base64");
    const report = verifyCallback(
      {
        method: "POST",
        url,
        headers: new Headers({ "content-digest": `sha-256=:${digest}:` }),
      },
      body,
    );
    assert.equal(report.digest, "pass");
    assert.equal(report.reject, false);
  });

  it("flags a Content-Digest that does not match the body", () => {
    const report = verifyCallback(
      {
        method: "POST",
        url,
        headers: new Headers({ "content-digest": "sha-256=:AAAA:" }),
      },
      body,
    );
    assert.equal(report.digest, "fail");
  });

  it("monitors rather than rejects while enforcement is off", () => {
    process.env.PAWAPAY_CALLBACK_IPS = "203.0.113.7";
    process.env.PAWAPAY_ENFORCE_IP = "false";
    const report = verifyCallback(
      {
        method: "POST",
        url,
        headers: new Headers({ "x-forwarded-for": "198.51.100.4" }),
      },
      body,
    );
    assert.equal(report.ip, "fail");
    assert.equal(report.reject, false, "monitor mode must never reject");
    assert.ok(report.reasons[0].includes("monitor only"));
    delete process.env.PAWAPAY_CALLBACK_IPS;
    delete process.env.PAWAPAY_ENFORCE_IP;
  });

  it("rejects a non-allow-listed IP once enforcement is on", () => {
    process.env.PAWAPAY_CALLBACK_IPS = "203.0.113.7";
    process.env.PAWAPAY_ENFORCE_IP = "true";
    const report = verifyCallback(
      {
        method: "POST",
        url,
        headers: new Headers({
          "x-forwarded-for": "198.51.100.4, 203.0.113.7",
        }),
      },
      body,
    );
    // Only the FIRST hop is the real client; a spoofed tail must not rescue it.
    assert.equal(report.ip, "fail");
    assert.equal(report.reject, true);
    delete process.env.PAWAPAY_CALLBACK_IPS;
    delete process.env.PAWAPAY_ENFORCE_IP;
  });

  it("verifies a real signature, and rebuilds the base behind a relay", () => {
    // PawaPay signs ECDSA P-256 with the raw r||s encoding.
    const { privateKey, publicKey } = generateKeyPairSync("ec", {
      namedCurve: "P-256",
    });

    // The address PawaPay was given — a relay in front of this app.
    const RELAY_AUTHORITY = "abc123.execute-api.us-east-1.amazonaws.com";
    const RELAY_PATH = "/prod/api/webhooks/pawapay/deposits";

    const created = Math.floor(Date.now() / 1000);
    const params = `("@method" "@authority" "@path");created=${created};keyid="k1"`;
    const base = [
      `"@method": POST`,
      `"@authority": ${RELAY_AUTHORITY}`,
      `"@path": ${RELAY_PATH}`,
      `"@signature-params": ${params}`,
    ].join(String.fromCharCode(10));

    const signature = cryptoSign("sha256", Buffer.from(base, "utf8"), {
      key: privateKey,
      dsaEncoding: "ieee-p1363",
    });

    process.env.PAWAPAY_CALLBACK_PUBLIC_KEY = publicKey
      .export({ type: "spki", format: "pem" })
      .toString();

    const headers = new Headers({
      "signature-input": `sig1=${params}`,
      signature: `sig1=:${signature.toString("base64")}:`,
    });
    // The request as WE receive it: our own host and path, not the relay's.
    const received = {
      method: "POST",
      url: new URL("https://devfest.example/api/payments/pawapay/callback"),
      headers,
    };

    // Without the override the base is rebuilt from our address, so a
    // perfectly valid signature cannot verify.
    delete process.env.PAWAPAY_SIGNATURE_AUTHORITY;
    delete process.env.PAWAPAY_SIGNATURE_PATH;
    assert.equal(verifyCallback(received, body).signature, "fail");

    // Told what PawaPay actually signed, it verifies.
    process.env.PAWAPAY_SIGNATURE_AUTHORITY = RELAY_AUTHORITY;
    process.env.PAWAPAY_SIGNATURE_PATH = RELAY_PATH;
    const report = verifyCallback(received, body);
    assert.equal(report.signature, "pass");
    assert.equal(report.replay, "pass", "a fresh signature is not a replay");
    assert.equal(report.reject, false);

    delete process.env.PAWAPAY_SIGNATURE_AUTHORITY;
    delete process.env.PAWAPAY_SIGNATURE_PATH;
    delete process.env.PAWAPAY_CALLBACK_PUBLIC_KEY;
  });

  it("accepts the allow-listed IP as the first forwarded hop", () => {
    process.env.PAWAPAY_CALLBACK_IPS = "203.0.113.7";
    process.env.PAWAPAY_ENFORCE_IP = "true";
    const report = verifyCallback(
      {
        method: "POST",
        url,
        headers: new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }),
      },
      body,
    );
    assert.equal(report.ip, "pass");
    assert.equal(report.reject, false);
    delete process.env.PAWAPAY_CALLBACK_IPS;
    delete process.env.PAWAPAY_ENFORCE_IP;
  });
});

describe("catalog rules", () => {
  it("keeps the free tier at zero", () => {
    assert.equal(findTier("haikyu")?.priceXAF, 0);
  });

  it("treats venue-only and sold-out as not purchasable online", () => {
    assert.equal(isPurchasable(findProduct("mug-community")!), false);
    assert.equal(isPurchasable(findProduct("tote-bag")!), false);
    assert.equal(isPurchasable(findProduct("sticker-pack")!), true);
  });

  it("requires a size on a product that offers sizes", () => {
    const tee = findProduct("tee-edition")!;
    assert.equal(isValidVariant(tee, undefined), false);
    assert.equal(isValidVariant(tee, { size: "M", color: "Noir" }), true);
    assert.equal(isValidVariant(tee, { size: "XXXL" }), false);
    assert.equal(isValidVariant(tee, { size: "M", color: "Fuchsia" }), false);
  });

  it("accepts no variant on a product that has none", () => {
    assert.equal(isValidVariant(findProduct("sticker-pack")!, undefined), true);
  });
});

describe("rounded pricing across the real catalogue and a discount", () => {
  const line = (amount: number) => ({
    productId: "x",
    name: { en: "x", fr: "x" },
    quantity: 1,
    unitAmount: amount,
    lineAmount: amount,
  });
  const percent = (value: number): DiscountRow => ({
    code: "TEST",
    kind: "percent",
    value,
    applies_to: "both",
    max_redemptions: null,
    redeemed_count: 0,
    expires_at: null,
    active: true,
  });
  const fixed = (value: number): DiscountRow => ({
    ...percent(0),
    kind: "fixed",
    value,
  });

  it("every ticket tier is charged exactly the price its card displays", async () => {
    for (const tier of ticketTiers.filter(
      (t) => t.priceXAF > 0 && !t.rsvpExternal,
    )) {
      // The card shows feeInclusiveAmount(priceXAF) (TicketCheckout); the
      // charge is the server's basket. They must be the same number.
      const displayed = feeInclusiveAmount(tier.priceXAF);
      const basket = await quoteTierCounts([{ tierId: tier.id, quantity: 1 }]);
      assert.equal(basket.charged, displayed, tier.id);
      assert.equal(displayed % 50, 0, `${tier.id} not a multiple of 50`);
      assert.equal(basket.subtotal, tier.priceXAF, "base stays untouched");
    }
  });

  it("every shop product is charged exactly the price its card displays", async () => {
    for (const product of allProducts().filter(isPurchasable)) {
      const displayed = feeInclusiveAmount(product.priceXAF);
      const variant = product.variants
        ? {
            size: product.variants.size?.[0],
            color: product.variants.color?.[0],
          }
        : undefined;
      const basket = await quoteCart([
        { productId: product.id, quantity: 1, variant },
      ]);
      assert.equal(basket.charged, displayed, product.id);
      assert.equal(displayed % 50, 0, `${product.id} not a multiple of 50`);
    }
  });

  it("applies the discount to the BASE, then fee and rounding to what is left", () => {
    // 5000 base, 10% off -> net 4500 -> 4567.5 -> up to 4600.
    const basket = finalise([line(5000)], percent(10));
    assert.equal(basket.subtotal, 5000);
    assert.equal(basket.discountAmount, 500);
    assert.equal(basket.net, 4500);
    assert.equal(basket.charged, 4600);
    assert.equal(basket.feeAmount, 100);
    assert.equal(basket.net + basket.feeAmount, basket.charged);
    // The other order (round the sticker first, then take 10% off it) would
    // give 5100 - 510 = 4590 — a different number, and not what is charged.
    assert.notEqual(basket.charged, 5100 - Math.floor((5100 * 10) / 100));
  });

  it("a fully discounted order stays free; a tiny remainder costs 50", () => {
    assert.equal(finalise([line(5000)], fixed(5000)).charged, 0);
    assert.equal(finalise([line(5000)], fixed(4990)).charged, 50);
  });

  it("rounds the whole basket once, not each unit — never above the sum of the sticker prices", () => {
    // 3 x 2000 = 6000 -> 6090 -> 6100, versus 3 x 2050 = 6150 if each unit
    // were rounded on its own. ADR 0068 records this as the intended rule.
    const basket = finalise(
      [{ ...line(6000), quantity: 3, unitAmount: 2000 }],
      null,
    );
    assert.equal(basket.charged, 6100);
    assert.ok(basket.charged <= 3 * feeInclusiveAmount(2000));
  });
});

describe("server-side pricing", () => {
  it("prices tickets from the catalog, one per attendee", async () => {
    const basket = await quoteTickets([
      {
        tierId: "sonnet",
        name: "Ada Nkeng",
        email: "ada@example.com",
        apparelSize: "M",
      },
      {
        tierId: "sonnet",
        name: "Ben Fouda",
        email: "ben@example.com",
        apparelSize: "L",
      },
    ]);
    const sonnet = findTier("sonnet")!.priceXAF;
    assert.equal(basket.lines.length, 1, "same tier collapses to one line");
    assert.equal(basket.lines[0].quantity, 2);
    assert.equal(basket.subtotal, sonnet * 2, "subtotal stays base, fee-free");
    assert.equal(basket.net, sonnet * 2, "no discount, so net equals subtotal");
    assert.equal(basket.feeAmount, transactionFeeAmount(sonnet * 2));
    assert.equal(basket.charged, feeInclusiveAmount(sonnet * 2));
    assert.equal(
      basket.charged,
      basket.net + basket.feeAmount,
      "charged is always net plus the fee, nothing else",
    );
    assert.equal(basket.currency, "XAF");
  });

  it("refuses a tier whose RSVP is delegated off-site", async () => {
    // haikyu carries rsvpExternal: the community platform enforces one free
    // RSVP per person. Without a server check, a direct POST would mint
    // unlimited free tickets with valid badge codes and bypass that entirely.
    const free = findTier("haikyu")!;
    assert.equal(free.rsvpExternal, true, "fixture assumption");
    assert.equal(free.priceXAF, 0, "fixture assumption");

    await rejectsWith(
      quoteTickets([
        { tierId: "haikyu", name: "Ada Nkeng", email: "ada@example.com" },
      ]),
      CHECKOUT_ERRORS.TIER_RSVP_EXTERNAL,
    );
  });

  it("has no tier that is both free and sold here", () => {
    // This used to assert that haikyu checked out at 0 XAF. It no longer can:
    // the free pass became `rsvpExternal` when the RSVP moved to the community
    // platform, so nothing purchasable costs nothing.
    //
    // The zero-charge path in `startCheckout` is still live and still needed —
    // a 100%-off discount reaches it — which is why `fulfilFreeIntent` stays.
    // It just cannot be reached through a tier price any more.
    const sellableFree = sellableTiers().filter(
      (tier) => tier.priceXAF === 0 && !tier.rsvpExternal,
    );
    assert.deepEqual(
      sellableFree.map((tier) => tier.id),
      [],
      "a free, non-external tier would need the checkout path re-tested",
    );
  });

  it("ignores any price the caller tries to smuggle in", async () => {
    const basket = await quoteTickets([
      // The extra fields are not in the schema and must not reach the total.
      {
        tierId: "sonnet",
        name: "Ada Nkeng",
        email: "ada@example.com",
        apparelSize: "M",
        priceXAF: 1,
        lineAmount: 1,
      } as never,
    ]);
    assert.equal(
      basket.charged,
      feeInclusiveAmount(findTier("sonnet")!.priceXAF),
    );
  });

  it("demands an apparel size on an apparel tier", async () => {
    await rejectsWith(
      quoteTickets([
        { tierId: "sonnet", name: "Ada Nkeng", email: "ada@example.com" },
      ]),
      CHECKOUT_ERRORS.APPAREL_SIZE_REQUIRED,
    );
  });

  it("rejects an unknown tier and an empty basket", async () => {
    await rejectsWith(
      quoteTickets([
        { tierId: "nope", name: "Ada Nkeng", email: "ada@example.com" },
      ]),
      CHECKOUT_ERRORS.UNKNOWN_TIER,
    );
    await rejectsWith(quoteTickets([]), CHECKOUT_ERRORS.EMPTY_BASKET);
  });

  it("caps an order at ten tickets", async () => {
    const many = Array.from({ length: 11 }, (_, i) => ({
      tierId: "haikyu",
      name: `Person ${i}`,
      email: `p${i}@example.com`,
    }));
    await rejectsWith(
      quoteTickets(many),
      CHECKOUT_ERRORS.ATTENDEE_COUNT_MISMATCH,
    );
  });

  it("prices a shop cart, and multiplies by quantity", async () => {
    const basket = await quoteCart([
      { productId: "sticker-pack", quantity: 3 },
    ]);
    assert.equal(
      basket.charged,
      feeInclusiveAmount(findProduct("sticker-pack")!.priceXAF * 3),
    );
    assert.equal(basket.lines[0].quantity, 3);
  });

  it("refuses a sold-out or venue-only product", async () => {
    await rejectsWith(
      quoteCart([{ productId: "tote-bag", quantity: 1 }]),
      CHECKOUT_ERRORS.PRODUCT_UNAVAILABLE,
    );
    await rejectsWith(
      quoteCart([{ productId: "mug-community", quantity: 1 }]),
      CHECKOUT_ERRORS.PRODUCT_UNAVAILABLE,
    );
  });

  it("refuses an invalid variant and an out-of-range quantity", async () => {
    await rejectsWith(
      quoteCart([
        { productId: "tee-edition", quantity: 1, variant: { size: "XXXL" } },
      ]),
      CHECKOUT_ERRORS.INVALID_VARIANT,
    );
    await rejectsWith(
      quoteCart([{ productId: "sticker-pack", quantity: 99 }]),
      CHECKOUT_ERRORS.INVALID_BODY,
    );
  });
});

describe("event structured data", () => {
  it("stays silent while the dates are unconfirmed", () => {
    // startDate is REQUIRED by schema.org. An Event block without one is
    // invalid data that Search Console reports, and inventing a date would
    // publish a wrong one to every crawler that read it.
    assert.equal(eventDates([]), null);
    assert.equal(eventJsonLd("fr", "x", []), null);
  });

  it("switches itself on the moment a date lands", () => {
    const data = eventJsonLd("en", "Two days in Yaoundé", ["2026-11-14"]);
    assert.ok(data, "a dated event must produce a block");
    assert.equal(data!["@type"], "Event");
    assert.equal(data!.startDate, "2026-11-14T09:00:00");
    assert.equal(data!.endDate, "2026-11-14T18:00:00");
    assert.ok(String(data!.url).endsWith("/en"));
  });

  it("spans non-consecutive days without claiming the gap", () => {
    // The real shape: 21 and 28 November, a week apart. The outer range is
    // the whole span, because that IS when the event starts and ends — but
    // on its own it reads as one continuous eight-day event, so each real
    // day is listed as a subEvent.
    const data = eventJsonLd("en", "x", ["2026-11-21", "2026-11-28"]);
    assert.equal(data!.startDate, "2026-11-21T09:00:00");
    assert.equal(data!.endDate, "2026-11-28T18:00:00");
    const sub = (data as { subEvent?: { startDate: string }[] }).subEvent;
    assert.equal(sub?.length, 2);
    assert.equal(sub![0].startDate, "2026-11-21T09:00:00");
    assert.equal(sub![1].startDate, "2026-11-28T09:00:00");
  });

  it("writes the dates the way a person says them, not as a range", () => {
    // The bug this pins is a STRING one, and it shipped in an email somebody
    // who has paid reads: "21–22 November 2026". A dash means "through", and
    // these two Saturdays are a week apart — so a dash claims an eight-day
    // event. An ampersand says what is true.
    assert.equal(
      formatEventDates("en", ["2026-11-21", "2026-11-28"]),
      "21 & 28 November 2026",
    );
    assert.equal(
      formatEventDates("fr", ["2026-11-21", "2026-11-28"]),
      "21 et 28 novembre 2026",
    );
  });

  it("names the month once when the days share one, and twice when they do not", () => {
    assert.equal(formatEventDates("en", ["2026-11-21"]), "21 November 2026");
    assert.equal(
      formatEventDates("en", ["2026-11-28", "2026-12-05"]),
      "28 November & 5 December 2026",
    );
    assert.equal(
      formatEventDates("fr", ["2026-11-21", "2026-11-28", "2026-11-29"]),
      "21, 28 et 29 novembre 2026",
    );
  });

  it("says nothing rather than a bare year when there are no dates", () => {
    assert.equal(formatEventDates("en", []), null);
  });

  it("splits the dates into a loud value and a quiet caption", () => {
    // The hero sets these as a figure: "21 & 28" big, "November 2026" under
    // it. Same information as `formatEventDates`, cut for that shape.
    assert.deepEqual(eventDateParts("en", ["2026-11-21", "2026-11-28"]), {
      value: "21 & 28",
      caption: "November 2026",
    });
    assert.deepEqual(eventDateParts("fr", ["2026-11-21", "2026-11-28"]), {
      value: "21 et 28",
      caption: "novembre 2026",
    });
  });

  it("keeps the months in the value when the days span two of them", () => {
    // Bare days would read as "28 & 5", which is not a date anybody can
    // parse — so that case promotes the whole thing and drops to the year.
    assert.deepEqual(eventDateParts("en", ["2026-11-28", "2026-12-05"]), {
      value: "28 November & 5 December 2026",
      caption: "2026",
    });
  });

  it("has no figure to set when there are no dates", () => {
    assert.equal(eventDateParts("en", []), null);
  });

  it("does not add a subEvent list for a single-day event", () => {
    const data = eventJsonLd("en", "x", ["2026-11-21"]);
    assert.equal((data as { subEvent?: unknown }).subEvent, undefined);
  });

  it("uses only the confirmed November 21 date", () => {
    assert.equal(dateForDay(1), "2026-11-21");
    assert.equal(dateForDay(2), null);
    assert.equal(EVENT.days, 1);
  });

  it("always describes the organiser, since none of that is speculative", () => {
    const org = organizationJsonLd();
    assert.equal(org["@type"], "Organization");
    assert.equal(org.name, "GDG Yaoundé");
    assert.ok(org.url.startsWith("https://"));
  });

  it("PAST_GALLERY_YEAR is one edition back from the confirmed one", () => {
    assert.equal(PAST_GALLERY_YEAR, EVENT.year - 1);
  });
});

describe("whether the event has ended (ADR 0058)", () => {
  const DATES = ["2026-11-21", "2026-11-28"] as const;
  // 18:00 is Yaoundé local time (WAT, UTC+1, no DST) — the real closing
  // instant is therefore 17:00 UTC, not 18:00 UTC.
  const END_MS = new Date("2026-11-28T18:00:00+01:00").getTime();

  it("is false with time to spare", () => {
    assert.equal(eventHasEnded(new Date("2026-11-21T09:00:00Z"), DATES), false);
  });

  it("is false right up to the final second", () => {
    assert.equal(eventHasEnded(new Date(END_MS - 1000), DATES), false);
  });

  it("flips true at the exact closing instant, and stays true after", () => {
    assert.equal(eventHasEnded(new Date(END_MS), DATES), true);
    assert.equal(eventHasEnded(new Date(END_MS + 86_400_000), DATES), true);
  });

  it("is false with no confirmed dates — never reads as 'always ended'", () => {
    assert.equal(eventHasEnded(new Date("2099-01-01T00:00:00Z"), []), false);
  });

  it("bounds the cron's forced revalidation to the day right after closing", () => {
    assert.equal(
      withinPostEventRevalidateWindow(new Date(END_MS), DATES),
      true,
      "the exact closing instant is inside the window",
    );
    assert.equal(
      withinPostEventRevalidateWindow(new Date(END_MS + 1000), DATES),
      true,
      "a moment after closing is inside the window",
    );
    assert.equal(
      withinPostEventRevalidateWindow(new Date(END_MS - 1000), DATES),
      false,
      "still running is not inside the window",
    );
    assert.equal(
      withinPostEventRevalidateWindow(
        new Date(END_MS + 24 * 60 * 60 * 1000 + 1000),
        DATES,
      ),
      false,
      "more than a day later, the one-way switch has already flipped and needs no more forcing",
    );
  });

  it("never opens a revalidation window with no confirmed dates", () => {
    assert.equal(withinPostEventRevalidateWindow(new Date(), []), false);
  });
});

describe("dp stickers", () => {
  it("keeps every word sticker to one hashtag token", () => {
    for (const sticker of TEXT_STICKERS) {
      for (const locale of ["fr", "en"] as const) {
        const text = sticker.text[locale];
        assert.ok(text.startsWith("#"), `${sticker.id}/${locale}: ${text}`);
        // A hashtag breaks at the first space, so a multi-word phrase would
        // silently post as one word plus loose text.
        assert.ok(
          !/\s/.test(text),
          `${sticker.id}/${locale} has a space: ${text}`,
        );
      }
    }
  });

  it("gives every sticker a distinct id", () => {
    const ids = ALL_STICKERS.map((s) => s.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  it("names every sticker in both languages", () => {
    for (const sticker of ALL_STICKERS) {
      for (const locale of ["fr", "en"] as const) {
        assert.ok(stickerName(sticker.id, locale).length > 0);
      }
    }
  });
});

describe("dp community wall", () => {
  it("is dark in these tests unless the flag is set", () => {
    // next.config defaults the flag on for a Next.js build (ADR 0033). These
    // tests run outside that, so the helper still sees process.env as-is.
    assert.equal(process.env.NEXT_PUBLIC_DP_GALLERY, undefined);
    assert.equal(galleryEnabled(), false);
  });

  it("uploads a thumbnail, not the download", () => {
    assert.ok(GALLERY_MAX_EDGE < 1080);
  });
});

describe("admin csv safety", () => {
  it("neutralises every character a spreadsheet would execute", () => {
    // The nickname field is free text typed by strangers, and it ends up in
    // an organiser's Excel. OWASP CSV injection.
    for (const attack of [
      '=HYPERLINK("http://evil","Click")',
      "+1+1",
      "-2+3",
      "@SUM(A1:A9)",
      "\tcmd",
      "\rcmd",
    ]) {
      const cell = csvCell(attack);
      assert.ok(
        cell.startsWith("'") || cell.startsWith("\"'"),
        `not neutralised: ${JSON.stringify(cell)}`,
      );
    }
  });

  it("quotes before it can hide the formula marker", () => {
    // Order matters: quoting first would bury the leading `=` behind a quote
    // and the check would stop matching.
    const cell = csvCell('=1+1,"x"');
    assert.ok(cell.includes("'=1+1"), cell);
    assert.ok(cell.startsWith('"'), cell);
  });

  it("leaves ordinary values alone", () => {
    assert.equal(csvCell("Ada Nkeng"), "Ada Nkeng");
    assert.equal(csvCell(2000), "2000");
    assert.equal(csvCell(null), "");
    assert.equal(csvCell("with, comma"), '"with, comma"');
  });

  it("round-trips quoted fields, doubled quotes and embedded newlines", () => {
    const csv = toCsv(["a", "b"], [['say "hi"', "two\nlines"]]);
    const parsed = parseCsv(csv);
    assert.deepEqual(parsed.headers, ["a", "b"]);
    assert.deepEqual(parsed.rows, [['say "hi"', "two\nlines"]]);
  });

  it("reports every problem in a sheet, not just the first", () => {
    const csv = "id,name\n,Ada\nb2,\nb3,=cmd()";
    const result = dryRun(parseCsv(csv), [
      { column: "id", required: true },
      { column: "name", required: true, maxLength: 10 },
    ]);
    assert.equal(result.rows.length, 3);
    // missing id, missing name, and a formula — three separate rows
    assert.ok(result.issues.length >= 3, JSON.stringify(result.issues));
    assert.ok(result.issues.some((i) => /formula/.test(i.problem)));
    // Row numbers are 1-based WITH the header, so they match the spreadsheet.
    assert.equal(result.issues[0].row, 2);
  });

  it("names columns it does not know and required ones it cannot find", () => {
    const result = dryRun(parseCsv("id,nickname\nx,y"), [
      { column: "id", required: true },
      { column: "name", required: true },
    ]);
    assert.deepEqual(result.missingColumns, ["name"]);
    assert.deepEqual(result.unknownColumns, ["nickname"]);
  });

  it("flags formulas on the way in as well as out", () => {
    assert.ok(looksLikeFormula("=1+1"));
    assert.ok(!looksLikeFormula("Ada"));
  });
});

describe("dp card geometry", () => {
  it("decreases nested radii by exactly the padding between them", () => {
    for (const ratio of ["1:1", "3:4"] as const) {
      const l = layoutCard(1080, ratio);
      // The standard nested-radius rule: outer = inner + padding. Matching
      // radii at every level is what makes concentric rounded shapes look
      // wrong, so this is a correctness property, not a preference.
      assert.ok(
        l.radius.card > l.radius.photo && l.radius.photo > l.radius.plate,
        `radii must decrease inward: ${JSON.stringify(l.radius)}`,
      );
      assert.ok(Math.abs(l.radius.card - l.radius.photo - PAD * 1080) < 0.51);
      assert.ok(
        Math.abs(l.radius.photo - l.radius.plate - PLATE_INSET * 1080) < 0.51,
      );
      assert.ok(l.radius.plate > 0, "no corner may be sharp");
    }
  });

  it("centres the photo on the card, in both directions", () => {
    for (const ratio of ["1:1", "3:4"] as const) {
      const l = layoutCard(1080, ratio);
      const right = l.width - (l.photo.x + l.photo.w);
      const bottom = l.height - (l.photo.y + l.photo.h);
      assert.ok(
        Math.abs(l.photo.x - right) < 0.51,
        `left ${l.photo.x} vs right ${right}`,
      );
      assert.ok(
        Math.abs(l.photo.y - bottom) < 0.51,
        `top ${l.photo.y} vs bottom ${bottom}`,
      );
    }
  });

  it("keeps the plate inside the photo, on the same centreline", () => {
    const l = layoutCard(1080, "1:1");
    const plateCentre = l.plate.x + l.plate.w / 2;
    assert.ok(Math.abs(plateCentre - l.width / 2) < 0.51);
    assert.ok(l.plate.x >= l.photo.x);
    assert.ok(l.plate.y + l.plate.h <= l.photo.y + l.photo.h + 0.51);
  });

  it("makes a tall card taller without changing its margins or type", () => {
    const square = layoutCard(1080, "1:1");
    const tall = layoutCard(1080, "3:4");
    assert.equal(tall.height, 1440);
    // Every length is a fraction of WIDTH, so a 3:4 card keeps the same
    // margins and the same type size and simply gets a taller photo.
    assert.equal(square.photo.x, tall.photo.x);
    assert.equal(square.plate.h, tall.plate.h);
    assert.ok(tall.photo.h > square.photo.h);
  });
});

describe("dp generator helpers", () => {
  it("builds a safe filename from any nickname", () => {
    assert.equal(dpFileName("Ada Nkeng"), "devfest-yaounde-ada-nkeng.png");
    assert.equal(dpFileName("  "), "devfest-yaounde-devfest.png");
    assert.equal(
      dpFileName("../../etc/passwd"),
      "devfest-yaounde-etcpasswd.png",
    );
    assert.ok(!dpFileName("Ada/Nkeng").includes("/"));
  });

  it("writes a share caption in both languages", () => {
    const fr = shareCaption("fr");
    const en = shareCaption("en");
    assert.ok(fr.includes("#DevFestYaounde"));
    assert.ok(en.includes("#DevFestYaounde"));
    assert.notEqual(fr, en, "the two locales must not share one string");
  });

  it("points the caption at the generator, with hashtags and @gdgyaounde", () => {
    for (const caption of [shareCaption("fr"), shareCaption("en")]) {
      assert.ok(
        caption.includes("/dp-generator"),
        "the CTA has to name the page people are being sent to",
      );
      assert.ok(caption.includes("@gdgyaounde"));
      assert.ok(caption.includes("#DevFestYaounde"));
    }
  });
});

describe("refund acknowledgment as evidence", () => {
  it("is required by both checkout schemas", () => {
    const ticket = {
      attendees: [
        {
          tierId: "sonnet",
          name: "Ada Nkeng",
          email: "ada@example.com",
          apparelSize: "M",
        },
      ],
      contact: { email: "ada@example.com" },
      locale: "fr",
    };
    // A body without the acknowledgment is refused outright — the checkbox
    // used to gate only the button, so a direct POST simply skipped it.
    assert.equal(ticketCheckoutSchema.safeParse(ticket).success, false);
    assert.equal(
      ticketCheckoutSchema.safeParse({ ...ticket, acceptedTerms: true })
        .success,
      true,
    );

    // `false` is not "declined and continue" — it is refused like an absence.
    assert.equal(
      ticketCheckoutSchema.safeParse({ ...ticket, acceptedTerms: false })
        .success,
      false,
    );

    const shop = {
      cart: [{ productId: "sticker-pack", quantity: 1 }],
      contact: { email: "ada@example.com" },
      locale: "en",
    };
    assert.equal(shopCheckoutSchema.safeParse(shop).success, false);
    assert.equal(
      shopCheckoutSchema.safeParse({ ...shop, acceptedTerms: true }).success,
      true,
    );
  });

  it("records the wording the screen actually showed, per kind and locale", () => {
    // Tickets and goods carry different terms, and always did: a ticket is
    // not refundable at all, goods can be replaced when they arrive wrong.
    // Storing the ticket wording against a shop order would be false evidence.
    const ticketsFr = refundAcknowledgment("tickets", "fr");
    const ticketsEn = refundAcknowledgment("tickets", "en");
    const shopFr = refundAcknowledgment("shop", "fr");

    assert.notEqual(
      ticketsFr,
      ticketsEn,
      "each locale records its own wording",
    );
    assert.notEqual(ticketsFr, shopFr, "tickets and goods differ");
    for (const text of [ticketsFr, ticketsEn, shopFr]) {
      assert.ok(text.trim().length > 10, "wording must be the real sentence");
    }
  });

  it("fails loudly rather than recording a placeholder", () => {
    assert.throws(
      () => refundAcknowledgment("tickets", "de" as never),
      /refund acknowledgment copy/,
    );
  });
});

describe("buyer-requested fulfilment", () => {
  const base = {
    cart: [{ productId: "sticker-pack", quantity: 1 }],
    acceptedTerms: true as const,
    contact: { email: "ada@example.com" },
    locale: "fr" as const,
  };

  it("is optional — an order without a preference is still valid", () => {
    assert.equal(shopCheckoutSchema.safeParse(base).success, true);
  });

  it("accepts the two methods organisers already write", () => {
    // `shipping`, not `delivery`: PATCH /api/orders/:id/status has used these
    // two words since 0001, and two vocabularies for one column would drift.
    for (const method of ["pickup", "shipping"]) {
      assert.equal(
        shopCheckoutSchema.safeParse({ ...base, fulfilment: { method } })
          .success,
        true,
        method,
      );
    }
    assert.equal(
      shopCheckoutSchema.safeParse({ ...base, fulfilment: { method: "drone" } })
        .success,
      false,
    );
  });

  it("bounds the note instead of taking whatever is pasted in", () => {
    assert.equal(
      fulfilmentRequestSchema.safeParse({
        method: "shipping",
        note: "x".repeat(300),
      }).success,
      true,
    );
    assert.equal(
      fulfilmentRequestSchema.safeParse({
        method: "shipping",
        note: "x".repeat(301),
      }).success,
      false,
    );
  });

  it("is not offered on the ticket flow", () => {
    // Nothing is delivered for a ticket, and startCheckout drops the field
    // for that kind anyway — so the schema should not invite it either.
    const parsed = ticketCheckoutSchema.safeParse({
      attendees: [
        {
          tierId: "sonnet",
          name: "Ada Nkeng",
          email: "ada@example.com",
          apparelSize: "M",
        },
      ],
      acceptedTerms: true,
      contact: { email: "ada@example.com" },
      locale: "fr",
      fulfilment: { method: "shipping" },
    });
    assert.equal(parsed.success, true, "unknown keys are stripped, not fatal");
    assert.ok(
      !("fulfilment" in (parsed.success ? parsed.data : {})),
      "a fulfilment sent with tickets must not survive parsing",
    );
  });
});

describe("per-variant stock", () => {
  it("keys a combination the same way everywhere", () => {
    // The JSON, the SQL and the UI all count under this string. Two spellings
    // of one combination would silently split a stock figure in half.
    assert.equal(
      variantKey("tee-edition", { size: "M", color: "Noir" }),
      "tee-edition|M|Noir",
    );
    assert.equal(variantKey("sticker-pack"), "sticker-pack||");
    assert.equal(
      variantKey("tee-edition", { size: "M" }),
      variantKey("tee-edition", { size: "M", color: undefined }),
    );
  });

  it("only caps the combinations the catalog names", () => {
    const caps = variantCapacities();
    assert.equal(typeof caps["tee-edition|M|Noir"], "number");
    // A product with no variants and no stock entry stays unlimited.
    assert.equal(caps["sticker-pack||"], undefined);
    assert.equal(declaredStock("sticker-pack"), undefined);
  });

  it("refuses an order larger than a combination ever had", async () => {
    // XXL/Blanc is stocked at 0 — the fixture's deliberately sold-out size.
    assert.equal(
      declaredStock("tee-edition", { size: "XXL", color: "Blanc" }),
      0,
    );

    await rejectsWith(
      quoteCart([
        {
          productId: "tee-edition",
          quantity: 1,
          variant: { size: "XXL", color: "Blanc" },
        },
      ]),
      CHECKOUT_ERRORS.VARIANT_SOLD_OUT,
    );
  });

  it("still prices a combination that has room", async () => {
    const basket = await quoteCart([
      {
        productId: "tee-edition",
        quantity: 2,
        variant: { size: "M", color: "Noir" },
      },
    ]);
    assert.equal(
      basket.charged,
      feeInclusiveAmount(findProduct("tee-edition")!.priceXAF * 2),
    );
  });

  it("leaves an unstocked product unlimited", async () => {
    const basket = await quoteCart([
      { productId: "sticker-pack", quantity: 10 },
    ]);
    assert.equal(basket.lines[0].quantity, 10);
  });
});

describe("ticket ownership", () => {
  const attendee = (over = {}) => ({
    tierId: "sonnet",
    name: "Ada Nkeng",
    email: "ada@example.com",
    apparelSize: "M",
    ...over,
  });
  const order = (attendees: unknown[]) => ({
    attendees,
    acceptedTerms: true as const,
    contact: { email: "ada@example.com" },
    locale: "fr" as const,
  });

  it("accepts an order where nobody claims a ticket", () => {
    // Buying for other people only is normal — a team lead, a parent.
    assert.equal(
      ticketCheckoutSchema.safeParse(order([attendee()])).success,
      true,
    );
  });

  it("records the one the buyer kept", () => {
    const parsed = ticketCheckoutSchema.safeParse(
      order([attendee({ isSelf: true }), attendee({ name: "Ben Fouda" })]),
    );
    assert.equal(parsed.success, true);
    assert.equal(parsed.success && parsed.data.attendees[0].isSelf, true);
    assert.equal(parsed.success && parsed.data.attendees[1].isSelf, undefined);
  });

  it("refuses two, because you can only be one person", () => {
    // The screen prevents it by unsetting the others, so a body with two is
    // either a bug or hand-written — either way it should not be stored.
    assert.equal(
      ticketCheckoutSchema.safeParse(
        order([attendee({ isSelf: true }), attendee({ isSelf: true })]),
      ).success,
      false,
    );
  });
});

describe("community wall", () => {
  it("keeps only a hash of the takedown token", () => {
    const { token, hash } = mintDeletionToken();
    // The token is returned to the browser once; the row keeps this instead,
    // for the same reason a password is never stored in the clear.
    assert.notEqual(token, hash);
    assert.equal(hash, hashToken(token));
    assert.match(hash, /^[0-9a-f]{64}$/);
    assert.ok(token.length >= 30, "a guessable token is not proof of anything");
  });

  it("matches a token only against its own hash", () => {
    const a = mintDeletionToken();
    const b = mintDeletionToken();
    assert.ok(tokensMatch(hashToken(a.token), a.hash));
    assert.ok(!tokensMatch(hashToken(b.token), a.hash));
    // Different lengths must not throw — timingSafeEqual would.
    assert.ok(!tokensMatch("short", a.hash));
  });

  it("mints a different token every time", () => {
    const seen = new Set(
      Array.from({ length: 50 }, () => mintDeletionToken().token),
    );
    assert.equal(seen.size, 50);
  });

  it("records the wording the person was actually shown", () => {
    // Not taken from the request: this record is what says someone agreed to
    // their FACE being public, so a forged body must not be able to write it.
    const fr = galleryConsentText("fr");
    const en = galleryConsentText("en");
    assert.notEqual(fr, en);
    for (const text of [fr, en]) assert.ok(text.trim().length > 20);
  });

  it("fails loudly on a missing translation rather than storing a blank", () => {
    assert.throws(
      () => galleryConsentText("de" as never),
      /gallery consent copy/,
    );
  });

  it("caps the server side above what the client sends", () => {
    // The client downscales to 640; the server refuses anything over 800, so
    // a hand-rolled upload cannot smuggle a full-resolution face in.
    //
    // The DIMENSION cap is the control that matters and it has not moved.
    // The byte cap did: it used to be 400 KB, which was fine while the client
    // sent JPEG, and became a trap when the wall moved to WebP — a browser
    // that cannot encode WebP from a canvas falls back to PNG, and a 640px
    // PNG of a photograph is comfortably over it. Bytes bound the request;
    // pixels bound what can be stored, and pixels are what a smuggled
    // full-resolution face would need.
    assert.ok(MAX_EDGE >= GALLERY_MAX_EDGE);
    assert.ok(MAX_BYTES <= 2 * 1024 * 1024, "byte cap must stay bounded");
  });

  it("stays dark until the flag is set", () => {
    const saved = process.env.NEXT_PUBLIC_DP_GALLERY;
    delete process.env.NEXT_PUBLIC_DP_GALLERY;
    assert.equal(galleryEnabled(), false);
    process.env.NEXT_PUBLIC_DP_GALLERY = "1";
    assert.equal(galleryEnabled(), true);
    if (saved === undefined) delete process.env.NEXT_PUBLIC_DP_GALLERY;
    else process.env.NEXT_PUBLIC_DP_GALLERY = saved;
  });
});

describe("wall retention", () => {
  it("keeps a wall up for a full edition cycle, not forever", () => {
    // 200 days: an edition's wall is still there months later, and faces from
    // one year are gone before the next-but-one comes round.
    assert.equal(DEFAULT_RETENTION_DAYS, 200);
    assert.ok(DEFAULT_RETENTION_DAYS > 180, "must outlast the event itself");
    assert.ok(DEFAULT_RETENTION_DAYS < 730, "must not become indefinite");
  });

  it("does nothing at all while the wall is switched off", async () => {
    // No flag means no wall, so a purge would be touching a table nobody is
    // using — and would need database access this test has no business having.
    const saved = process.env.NEXT_PUBLIC_DP_GALLERY;
    delete process.env.NEXT_PUBLIC_DP_GALLERY;
    const report = await purgeExpiredCards();
    assert.deepEqual(report, { expired: 0, errors: 0 });
    if (saved !== undefined) process.env.NEXT_PUBLIC_DP_GALLERY = saved;
  });
});

describe("quoting a basket before paying for it", () => {
  it("prices tier counts exactly as it prices the attendees they stand for", async () => {
    // The claim in pricing.ts is that the preview and the real checkout run
    // the SAME arithmetic. Two functions that both work out a ticket total
    // eventually disagree, and the one shown disagreeing with the one charged
    // is the worst possible pairing — so assert they agree.
    const fromAttendees = await quoteTickets([
      {
        tierId: "sonnet",
        name: "Ada Nkeng",
        email: "ada@example.com",
        apparelSize: "M",
      },
      {
        tierId: "sonnet",
        name: "Ben Fouda",
        email: "ben@example.com",
        apparelSize: "L",
      },
    ]);
    const fromCounts = await quoteTierCounts([
      { tierId: "sonnet", quantity: 2 },
    ]);

    assert.equal(fromCounts.subtotal, fromAttendees.subtotal);
    assert.equal(fromCounts.charged, fromAttendees.charged);
    assert.equal(fromCounts.currency, fromAttendees.currency);
    assert.deepEqual(
      fromCounts.lines.map((l) => [l.productId, l.quantity, l.lineAmount]),
      fromAttendees.lines.map((l) => [l.productId, l.quantity, l.lineAmount]),
    );
  });

  it("does not reopen the off-site RSVP bypass through the preview", async () => {
    // The quote path is new reachable surface. If it skipped this check, a
    // direct POST could price free tickets the site does not sell — and the
    // check that matters is the one on every path, not on the old one.
    await rejectsWith(
      quoteTierCounts([{ tierId: "haikyu", quantity: 1 }]),
      CHECKOUT_ERRORS.TIER_RSVP_EXTERNAL,
    );
  });

  it("refuses an empty basket rather than quoting zero", async () => {
    await rejectsWith(quoteTierCounts([]), CHECKOUT_ERRORS.EMPTY_BASKET);
  });

  it("caps a preview at the same order size as a real checkout", async () => {
    await rejectsWith(
      quoteTierCounts([{ tierId: "sonnet", quantity: 11 }]),
      CHECKOUT_ERRORS.ATTENDEE_COUNT_MISMATCH,
    );
  });

  it("refuses a tier flagged sold out, even with capacity remaining", async () => {
    // `soldOut` is a separate admin flag from `quantityAvailable` — an admin
    // can pull a tier off sale for reasons the counter doesn't know about.
    // Flip it on a tier that otherwise has plenty of room, and restore it
    // immediately after: this JSON module is the same object `loadTiers()`
    // falls back to, shared across the whole suite.
    const tier = ticketTiers.find((t) => t.id === "opus")!;
    const original = tier.soldOut;
    tier.soldOut = true;
    try {
      await rejectsWith(
        quoteTierCounts([{ tierId: "opus", quantity: 1 }]),
        CHECKOUT_ERRORS.TIER_SOLD_OUT,
      );
    } finally {
      tier.soldOut = original;
    }
  });

  it("keeps the client and server lists of discount failures in step", () => {
    // checkout-client.ts mirrors this list rather than importing it, to keep
    // a server module out of the browser bundle. A mirror nobody checks is a
    // mirror that drifts, so this is the check.
    const codes = [
      CHECKOUT_ERRORS.DISCOUNT_INVALID,
      CHECKOUT_ERRORS.DISCOUNT_EXPIRED,
      CHECKOUT_ERRORS.DISCOUNT_EXHAUSTED,
      CHECKOUT_ERRORS.DISCOUNT_NOT_APPLICABLE,
    ];
    for (const code of codes) {
      assert.equal(isDiscountFailure(code), true, `server: ${code}`);
      assert.equal(clientIsDiscountFailure(code), true, `client: ${code}`);
    }
    for (const code of [
      CHECKOUT_ERRORS.RATE_LIMITED,
      CHECKOUT_ERRORS.TIER_SOLD_OUT,
      CHECKOUT_ERRORS.SERVER_ERROR,
    ]) {
      assert.equal(isDiscountFailure(code), false, `server: ${code}`);
      assert.equal(clientIsDiscountFailure(code), false, `client: ${code}`);
    }
  });
});

describe("receipt emails", () => {
  /** A fulfilled ticket order, as the templates receive it. */
  function ticketIntent(
    overrides: Partial<PaymentIntentRow> = {},
  ): PaymentIntentRow {
    return {
      deposit_id: "11111111-2222-3333-4444-555555555555",
      user_id: "user-1",
      kind: "tickets",
      status: "activated",
      charged_amount: 3600,
      net_amount: 3600,
      currency: "XAF",
      discount_code: "GDG-2026",
      discount_amount: 400,
      line_items: [
        {
          productId: "sonnet",
          name: { fr: "SONNET", en: "SONNET" },
          quantity: 2,
          unitAmount: 2000,
          lineAmount: 4000,
        },
      ],
      attendees: null,
      contact: { email: "ada@example.com" },
      locale: "fr",
      failure_code: null,
      terms_text: null,
      terms_accepted_at: null,
      fulfilment: null,
      created_at: new Date().toISOString(),
      activated_at: new Date().toISOString(),
      ...overrides,
    } as PaymentIntentRow;
  }

  const tickets = [
    {
      attendeeName: "Ada Nkeng",
      tierId: "sonnet",
      badgeCode: "DFY-ABCDE-FGHIJ",
      apparelSize: "M",
      tierName: "SONNET",
      tierLabel: "Pass étudiant",
      perks: ["Accès à toutes les conférences", "Le t-shirt de l'édition"],
    },
  ];

  it("uses the admin date in both receipt formats", () => {
    const email = renderTicketReceipt(ticketIntent({ locale: "en" }), tickets, [
      "2026-11-14",
    ]);
    assert.match(email.html, /14 November 2026/);
    assert.match(email.text, /14 November 2026/);
    assert.doesNotMatch(email.text, /21 November|28 November/);
  });

  it("carries every ticket detail the sales page promised", () => {
    const email = renderTicketReceipt(ticketIntent(), tickets);
    for (const fragment of [
      "Ada Nkeng",
      "DFY-ABCDE-FGHIJ",
      "SONNET",
      "Pass étudiant",
      "Le t-shirt de l&#x27;édition".replace("&#x27;", "'"),
      "M",
    ]) {
      assert.ok(email.html.includes(fragment), `HTML is missing ${fragment}`);
      assert.ok(
        email.text.includes(fragment),
        `text part is missing ${fragment}`,
      );
    }
  });

  it("states what was deducted, not just what was charged", () => {
    // The whole point of the checkout change: a buyer should never have to
    // work out the discount themselves from two other numbers.
    const email = renderTicketReceipt(ticketIntent(), tickets);
    // `\D?` for the thousands separator: fr-CM groups with a NARROW no-break
    // space (U+202F), not the space you get from a keyboard.
    assert.ok(email.html.includes("GDG-2026"), "code missing");
    assert.match(email.html, /4\D?000/, "subtotal missing");
    assert.match(email.html, /-400/, "deduction missing");
    assert.match(email.html, /3\D?600/, "total missing");
    assert.match(email.text, /-400\D?XAF/, "text deduction missing");
  });

  it("shows no discount rows when there was no discount", () => {
    const email = renderTicketReceipt(
      ticketIntent({ discount_code: null, discount_amount: 0 }),
      tickets,
    );
    assert.ok(!email.html.includes("Sous-total"), "subtotal shown needlessly");
    assert.ok(!email.text.includes("Réduction"), "discount row leaked");
  });

  it("shows the transaction fee as its own line, on the post-discount base — not folded into the subtotal", () => {
    // net_amount (3600) is the base AFTER the 400 discount, so the true base
    // subtotal is 4000 (net + discount) — NOT charged_amount (3700) + discount,
    // which would double-count the fee. charged_amount is feeInclusiveAmount
    // of net_amount: 3600 * 1.015 = 3654, rounded up to the next 50 = 3700,
    // so the fee line is 100.
    const email = renderTicketReceipt(
      ticketIntent({
        net_amount: 3600,
        discount_amount: 400,
        charged_amount: feeInclusiveAmount(3600),
      }),
      tickets,
    );
    assert.equal(feeInclusiveAmount(3600), 3700);
    assert.match(email.html, /4\D?000/, "true base subtotal missing");
    assert.match(email.html, /-400/, "deduction missing");
    assert.ok(
      email.html.includes("Frais de transaction"),
      "fee row label missing",
    );
    assert.match(
      email.html,
      /Frais de transaction[^<]*<\/td>\s*<td[^>]*>\s*100\D/,
      "fee amount missing",
    );
    assert.match(email.html, /3\D?700/, "fee-inclusive total missing");
    assert.match(
      email.text,
      /Frais de transaction[^\n]*100/,
      "text fee missing",
    );
  });

  it("the support link in the footer arrives with a subject and a friendly opening", () => {
    for (const locale of ["fr", "en"] as const) {
      const email = renderTicketReceipt(ticketIntent({ locale }), tickets);
      const href = /href="(mailto:[^"]+)"/.exec(email.html)?.[1];
      assert.ok(href, `${locale}: no mailto link in the footer`);
      const url = new URL(href.replace(/&amp;/g, "&"));
      const subject = url.searchParams.get("subject") ?? "";
      const body = url.searchParams.get("body") ?? "";
      assert.ok(subject.length > 10, `${locale}: subject ${subject}`);
      assert.ok(body.includes("\r\n"), `${locale}: body has line breaks`);
      // Names this email and carries the order reference, so whoever answers
      // can find it.
      assert.ok(
        body.includes(ticketIntent({ locale }).deposit_id),
        `${locale}: reference missing`,
      );
    }
  });

  it("hides the fee row when it computes to zero, same rule as the discount row", () => {
    // net_amount 0 (a fully-discounted order) means transactionFeeAmount(0)
    // is 0 by construction — nothing to itemise.
    const email = renderTicketReceipt(
      ticketIntent({ net_amount: 0, discount_amount: 4000, charged_amount: 0 }),
      tickets,
    );
    assert.ok(
      !email.html.includes("Frais de transaction"),
      "fee row shown on a zero fee",
    );
  });

  it("escapes an attendee name rather than rendering it as markup", () => {
    // The name is typed by a buyer and lands in HTML. It is also printed on a
    // badge, so it is not sanitised at the source — it has to be escaped here.
    const email = renderTicketReceipt(ticketIntent(), [
      { ...tickets[0], attendeeName: '<img src=x onerror="alert(1)">' },
    ]);
    assert.ok(!email.html.includes("<img src=x"), "raw markup rendered");
    assert.ok(email.html.includes("&lt;img"), "not escaped");
  });

  it("speaks the language the order was placed in", () => {
    const fr = renderTicketReceipt(ticketIntent({ locale: "fr" }), tickets);
    const en = renderTicketReceipt(ticketIntent({ locale: "en" }), tickets);
    assert.ok(fr.subject.includes("Ta place"), fr.subject);
    assert.ok(en.subject.includes("You're in"), en.subject);
    assert.notEqual(fr.html, en.html);
  });

  it("records the buyer's fulfilment choice on a shop receipt", () => {
    const email = renderOrderReceipt(
      ticketIntent({
        kind: "shop",
        fulfilment: { method: "shipping", note: "Bastos, après 18h" },
      }),
    );
    assert.ok(email.html.includes("Livraison souhaitée"));
    assert.ok(email.html.includes("Bastos, après 18h"));
    assert.ok(email.text.includes("Bastos, après 18h"));
  });
});

describe("ticket claim emails", () => {
  const claim = {
    locale: "fr" as const,
    attendeeName: "Bruno Fotso",
    badgeCode: "DFY-ABCDE-FGHIJ",
    tierName: "SONNET",
    tierLabel: "Pass étudiant",
    claimUrl: "https://devfest.gdgyaounde.com/fr/account/claim/t1/tok1",
  };

  it("carries the attendee's name, badge code and claim link", () => {
    const email = renderTicketClaim(claim);
    for (const fragment of [
      "Bruno Fotso",
      "DFY-ABCDE-FGHIJ",
      "SONNET",
      claim.claimUrl,
    ]) {
      assert.ok(email.html.includes(fragment), `HTML is missing ${fragment}`);
      assert.ok(
        email.text.includes(fragment),
        `text part is missing ${fragment}`,
      );
    }
  });

  it("escapes an attendee name rather than rendering it as markup", () => {
    const email = renderTicketClaim({
      ...claim,
      attendeeName: '<img src=x onerror="alert(1)">',
    });
    assert.ok(!email.html.includes("<img src=x"), "raw markup rendered");
    assert.ok(email.html.includes("&lt;img"), "not escaped");
  });

  it("speaks the language the ticket was bought in", () => {
    const fr = renderTicketClaim({ ...claim, locale: "fr" });
    const en = renderTicketClaim({ ...claim, locale: "en" });
    assert.ok(fr.subject.includes("attend"), fr.subject);
    assert.ok(en.subject.includes("waiting"), en.subject);
    assert.notEqual(fr.html, en.html);
  });

  it("works without a tier name or label — still a real message, not a blank one", () => {
    const email = renderTicketClaim({
      locale: "en",
      attendeeName: "Bruno Fotso",
      badgeCode: "DFY-ABCDE-FGHIJ",
      claimUrl: claim.claimUrl,
    });
    assert.ok(email.html.includes("Bruno Fotso"));
    assert.ok(email.html.includes("DFY-ABCDE-FGHIJ"));
  });
});

describe("wall cards keep their transparency, not a black hole", () => {
  /**
   * The regression this guards shipped twice, differently.
   *
   * A generated card has fully transparent corners (geometry.ts). JPEG has no
   * alpha, so the first version composited them onto BLACK and every face on
   * the wall got a black frame. The fix flattened onto paper instead — which
   * removed the black but baked #F0F0F0 into the card, so the corners were a
   * pale rectangle on any other background.
   *
   * WebP carries alpha. The guarantee is no longer "the corners are the right
   * colour", it is "the corners have no colour at all", and that is what this
   * asserts now.
   */
  it("re-encodes to WebP with the transparent corners intact", async () => {
    const sharp = (await import("sharp")).default;

    // Opaque red in the middle, fully transparent at the corners — the shape
    // of every card the generator produces.
    const size = 64;
    const raw = Buffer.alloc(size * size * 4, 0);
    for (let y = 16; y < 48; y++) {
      for (let x = 16; x < 48; x++) {
        const i = (y * size + x) * 4;
        raw[i] = 200;
        raw[i + 3] = 255;
      }
    }
    const png = await sharp(raw, {
      raw: { width: size, height: size, channels: 4 },
    })
      .png()
      .toBuffer();

    const out = await normaliseImage(new Blob([new Uint8Array(png)]));

    const meta = await sharp(out).metadata();
    assert.equal(meta.format, "webp", "stored format");
    assert.equal(meta.hasAlpha, true, "alpha channel dropped");

    const { data, info } = await sharp(out)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const alphaAt = (x: number, y: number) =>
      data[(y * info.width + x) * info.channels + 3];

    for (const [x, y] of [
      [1, 1],
      [info.width - 2, 1],
      [1, info.height - 2],
      [info.width - 2, info.height - 2],
    ]) {
      assert.ok(
        alphaAt(x, y) < 20,
        `corner ${x},${y} came back opaque — the transparency was composited away`,
      );
    }
    // And the middle is still there, so this is not passing by producing an
    // empty image.
    assert.ok(alphaAt(info.width >> 1, info.height >> 1) > 200, "centre lost");
  });
});

describe("dealing cards into the wall's columns", () => {
  const deck = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      id: `card-${i}`,
      nickname: `person-${i}`,
      imageUrl: `https://example.test/${i}.webp`,
    }));

  it("never gives a column one card on repeat when the deck has several", () => {
    // The shipped version indexed `cards[(c + i * columnCount) % length]`,
    // which for three cards in three columns reduces to `c % 3 === c`: every
    // column was one person, forever. That is what was on the live wall.
    for (const columnCount of [3, 4, 6, 7, 8]) {
      for (const size of [2, 3, 4, 6, 8, 12]) {
        const columns = dealColumns(deck(size), columnCount);
        for (const [index, column] of columns.entries()) {
          const distinct = new Set(column.map((card) => card.id)).size;
          assert.equal(
            distinct,
            Math.min(size, column.length),
            `column ${index} of ${columnCount} with a deck of ${size} showed ${distinct} distinct cards`,
          );
        }
      }
    }
  });

  it("deals the columns differently from one another", () => {
    // Otherwise the wall is one sheet scrolling, which is what it looked like.
    const columns = dealColumns(deck(6), 5);
    const signatures = columns.map((column) =>
      column
        .slice(0, 6)
        .map((card) => card.id)
        .join(","),
    );
    assert.equal(
      new Set(signatures).size,
      signatures.length,
      "two columns were dealt the same order",
    );
  });

  it("is stable across renders, so hydration cannot mismatch", () => {
    // Seeded, not Math.random(): the server and the browser must build the
    // same wall or React throws.
    const cards = deck(5);
    assert.deepEqual(dealColumns(cards, 4), dealColumns(cards, 4));
  });

  it("survives an empty deck", () => {
    assert.deepEqual(dealColumns([], 3), [[], [], []]);
  });
});
