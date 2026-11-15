/**
 * Participation terms (ADR 0074): the free-vs-paid rule in the tier data,
 * the migration that carries it to the live row, the consent wording, the
 * FAQs and the pop-up's storage key.
 *
 * Run with `npm test`.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import tiersJson from "@/data/ticket-tiers.json";
import faqsJson from "@/data/faqs.json";
import type { FaqItem, TicketTier } from "@/data/types";
import { collectionSchemas, settingsSchema } from "@/lib/content/schemas";
import { refundAcknowledgment } from "@/lib/payments/terms";
import {
  PARTICIPATION_TERMS_URL,
  TERMS_UPDATED_AT,
  TERMS_VERSION,
} from "@/lib/site-config";
import { termsSeenKey } from "@/lib/use-seen-once";

const FORBIDDEN_FREE =
  /lunch|coffee|food|drink|sticker|badge|lanyard|swag|t-?shirt/i;
const LUNCH = /lunch and coffee breaks/i;
const IDENT = /badge, lanyard, bracelet or similar/i;

function checkRule(tiers: TicketTier[]) {
  for (const tier of tiers) {
    const labels = tier.perks.map((p) => p.label.en);
    if (tier.priceXAF <= 0) {
      for (const label of labels) {
        assert.doesNotMatch(label, FORBIDDEN_FREE, `${tier.id}: "${label}"`);
      }
      assert.equal(tier.swagProductIds, undefined, `${tier.id} swag`);
    } else {
      assert.ok(
        labels.some((l) => LUNCH.test(l)),
        `${tier.id} lists lunch`,
      );
      assert.ok(
        labels.some((l) => IDENT.test(l)),
        `${tier.id} lists an identifier`,
      );
    }
    for (const perk of tier.perks) {
      assert.ok(perk.label.fr.trim() && perk.label.en.trim(), tier.id);
    }
  }
}

describe("the tier data follows the participation terms", () => {
  it("repo fallback: free pass has no food/swag/identifier, paid list both", () => {
    const tiers = tiersJson as TicketTier[];
    assert.equal(
      collectionSchemas["ticket-tiers"].safeParse(tiers).success,
      true,
    );
    checkRule(tiers);
  });
});

describe("migration 0031", () => {
  const sql = readFileSync(
    join(process.cwd(), "supabase/migrations/0031_participation_terms.sql"),
    "utf8",
  );
  const match = sql.match(/\$tiers\$([\s\S]*?)\$tiers\$/);
  const tiers = JSON.parse(match![1]) as TicketTier[];

  it("carries a valid tier payload that follows the rule", () => {
    assert.equal(
      collectionSchemas["ticket-tiers"].safeParse(tiers).success,
      true,
    );
    checkRule(tiers);
  });

  it("keeps the certificate on the free pass (organiser's call)", () => {
    const haikyu = tiers.find((t) => t.id === "haikyu")!;
    assert.ok(
      haikyu.perks.some((p) => /certificate/i.test(p.label.en)),
      "certificate kept",
    );
  });

  it("refuses to overwrite a tier row edited since it was read", () => {
    assert.match(sql, /raise exception/);
    assert.match(sql, /updated_at <> '2026-09-23T16:04:30\.173\+00:00'/);
    assert.match(sql, /editorial_migration_backup/);
  });

  it("only repoints the participation-terms link if it is still GDG's", () => {
    assert.match(
      sql,
      /legal ->> 'participationTermsUrl' = 'https:\/\/gdg\.community\.dev\/participation-terms\/'/,
    );
  });
});

describe("settings: the terms version", () => {
  it("defaults to the on-site page and today's version", () => {
    assert.equal(PARTICIPATION_TERMS_URL, "/terms");
    assert.equal(TERMS_VERSION, "2026-11-15");
    assert.equal(TERMS_UPDATED_AT, "2026-11-15");
  });

  it("accepts a token version and an ISO date", () => {
    assert.equal(
      settingsSchema.safeParse({
        legal: { termsVersion: "2026-11-15", termsUpdatedAt: "2026-11-15" },
      }).success,
      true,
    );
  });

  it("refuses a version that would make an odd storage key", () => {
    assert.equal(
      settingsSchema.safeParse({ legal: { termsVersion: "new terms!" } })
        .success,
      false,
    );
    assert.equal(
      settingsSchema.safeParse({ legal: { termsUpdatedAt: "15/11/2026" } })
        .success,
      false,
    );
  });

  it("keys the pop-up by version", () => {
    assert.equal(termsSeenKey("2026-11-15"), "devfest:terms-seen:2026-11-15");
    assert.notEqual(termsSeenKey("2026-11-15"), termsSeenKey("2026-12-01"));
  });
});

describe("checkout consent references the participation terms", () => {
  it("in both languages, for tickets only", () => {
    assert.match(
      refundAcknowledgment("tickets", "fr"),
      /conditions de participation/,
    );
    assert.match(refundAcknowledgment("tickets", "en"), /participation terms/);
    assert.doesNotMatch(
      refundAcknowledgment("shop", "en"),
      /participation terms/,
    );
  });
});

describe("the FAQs", () => {
  const faqs = faqsJson as FaqItem[];
  const byId = new Map(faqs.map((f) => [f.id, f]));

  it("validate, with unique ids", () => {
    assert.equal(collectionSchemas.faqs.safeParse(faqs).success, true);
  });

  it("include the three new questions, in both languages", () => {
    for (const id of [
      "faq-is-devfest-free",
      "faq-free-pass-food",
      "faq-change-tshirt-size",
    ]) {
      const f = byId.get(id);
      assert.ok(f, id);
      assert.ok(
        f!.question.fr && f!.question.en && f!.answer.fr && f!.answer.en,
      );
    }
  });

  it("link every perk answer to /terms", () => {
    for (const id of [
      "faq-ticket-types",
      "faq-free-ticket",
      "faq-food-venue",
      "faq-shop-without-ticket",
      "faq-ticket-bought-for-friend",
      "faq-is-devfest-free",
      "faq-free-pass-food",
    ]) {
      assert.equal(byId.get(id)?.cta?.href, "/terms", id);
    }
  });

  it("no longer promise food or a badge to the free pass", () => {
    const free = byId.get("faq-free-ticket")!;
    assert.match(free.answer.en, /for paid passes/);
    assert.doesNotMatch(
      byId.get("faq-speak")!.answer.en,
      /open on Sessionize through/,
      "the stale call-for-speakers answer is gone",
    );
  });
});
