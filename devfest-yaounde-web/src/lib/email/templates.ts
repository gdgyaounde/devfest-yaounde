/**
 * Receipt and confirmation emails.
 *
 * Bilingual, because `PAGES.md` §10.2 lists email/receipt templates as
 * content that must exist in both languages. The locale comes from the
 * payment intent, captured at checkout — not from whatever language the
 * server happens to think it is.
 *
 * Tone follows the brand voice: warm, active, a little celebratory. This is
 * the first thing someone reads after paying, so it should not sound like a
 * bank statement.
 *
 * ## Why this is written in tables with inline styles
 *
 * Not nostalgia. Mail clients strip `<style>` blocks, Outlook renders through
 * Word rather than a browser, and flexbox and grid are unreliable across the
 * set of clients a Cameroonian attendee actually uses. So: tables for layout,
 * every rule inline, 600px wide, and a plain-text part that reads properly on
 * its own rather than being an afterthought.
 *
 * ## What it must contain
 *
 * Everything the ticket page promised. Someone who paid should not have to go
 * back to the site to find out what they bought — the tier, what is included,
 * the badge code, the size they chose, and exactly what was deducted and
 * charged. A receipt that omits the detail is a receipt you have to
 * supplement with a support email.
 */
import type { PaymentIntentRow } from "@/lib/payments/intents";
import { mailtoHref } from "@/lib/mailto";
import { CHAPTER_EMAIL, SITE_URL } from "@/lib/site-config";
import { EVENT_DATES } from "@/lib/calendar";
import { formatEventDates } from "@/lib/event";

/**
 * The dates, from the one list that holds them.
 *
 * They used to be typed into the copy table as "21–22 November 2026", which
 * was wrong — and wrong in an email somebody who has PAID reads, and then
 * plans a Saturday around. Derived now, so `EVENT_DATES` is the only place a
 * date can be edited or got wrong.
 *
 * The empty case falls back to the city alone rather than printing nothing
 * around a stray separator.
 */
function eventDate(locale: "fr" | "en", dates: readonly string[]): string {
  return formatEventDates(locale, dates) ?? "";
}

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

type Locale = "fr" | "en";

/**
 * The brand, as a mail client will actually render it.
 *
 * These are the design-system values from `globals.css`, hard-coded because
 * an email cannot read a CSS custom property. Yellow is the DEFAULT theme;
 * the site's swappable themes deliberately do not follow into the inbox — a
 * receipt should look the same in December as it did in September.
 */
const BRAND = {
  yellow: "#F9AB00",
  yellowPastel: "#FFE7A5",
  ink: "#1E1E1E",
  offwhite: "#F0F0F0",
  paper: "#FFFFFF",
  muted: "#4D4D4D",
  hairline: "#E2E2E2",
} as const;

const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const MONO = "'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace";

function locale(intent: PaymentIntentRow): Locale {
  return intent.locale === "en" ? "en" : "fr";
}

/** XAF has no minor unit; group thousands so 35000 reads as 35 000. */
function money(amount: number, l: Locale): string {
  return `${new Intl.NumberFormat(l === "fr" ? "fr-CM" : "en-CM").format(amount)} XAF`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Every string this file renders, in both languages and in one place. */
const COPY = {
  fr: {
    chapter: "GDG Yaoundé",
    edition: "DevFest Yaoundé 2026",
    ticketsSubject: "Ta place est réservée — DevFest Yaoundé 2026",
    orderSubject: "Commande confirmée — DevFest Yaoundé 2026",
    ticketsTitle: "Tu y es.",
    orderTitle: "C'est noté.",
    entryCode: "Code d'entrée",
    entryCodeHint: "C'est ce code qu'on scanne à la porte. Garde-le.",
    included: "Ce qui est compris",
    size: "Taille",
    forWhom: "Au nom de",
    yourTicket: "Ton billet",
    ticketsHeading: "Tes billets",
    orderHeading: "Ta commande",
    subtotal: "Sous-total",
    discount: "Réduction",
    transactionFee:
      "Frais de transaction (1,5 %, arrondi aux 50 XAF supérieurs)",
    totalPaid: "Total payé",
    free: "Offert",
    myTickets: "Voir mes billets",
    pickup: "À récupérer sur place",
    shipping: "Livraison souhaitée",
    fulfilmentNote: "Ta note",
    orderNext:
      "On te préviendra dès que ta commande est prête à être récupérée.",
    venue: "Yaoundé, Cameroun",
    why: "Tu reçois cet e-mail parce que tu as commandé sur",
    contact: "Une question ? Réponds simplement à cet e-mail.",
    ref: "Référence",
    helpSubject: "À propos de mon e-mail DevFest Yaoundé",
    helpHello: "Bonjour l'équipe DevFest Yaoundé,",
    helpAbout: "J'ai besoin d'aide au sujet de cet e-mail :",
    helpAsk: "Ma question :",
    helpThanks: "Merci !",
    claimSubject: "Un billet t'attend — DevFest Yaoundé 2026",
    claimTitle: "Celui-ci est pour toi.",
    claimIntro:
      "Quelqu'un t'a pris une place pour DevFest Yaoundé 2026. Récupère-la sur ton propre compte et c'est réglé — tu t'en serviras pour l'accueil le jour J.",
    claimCta: "Récupérer mon billet",
    claimHint:
      "Tu te connectes avec Google — même compte, pas de nouveau mot de passe.",
  },
  en: {
    chapter: "GDG Yaoundé",
    edition: "DevFest Yaoundé 2026",
    ticketsSubject: "You're in — DevFest Yaoundé 2026",
    orderSubject: "Order confirmed — DevFest Yaoundé 2026",
    ticketsTitle: "You're in.",
    orderTitle: "Got it.",
    entryCode: "Entry code",
    entryCodeHint: "This is what we scan at the door. Keep it.",
    included: "What's included",
    size: "Size",
    forWhom: "For",
    yourTicket: "Your ticket",
    ticketsHeading: "Your tickets",
    orderHeading: "Your order",
    subtotal: "Subtotal",
    discount: "Discount",
    transactionFee: "Transaction fee (1.5%, rounded up to the next 50 XAF)",
    totalPaid: "Total paid",
    free: "Free",
    myTickets: "See my tickets",
    pickup: "Collecting in person",
    shipping: "Delivery requested",
    fulfilmentNote: "Your note",
    orderNext: "We'll let you know as soon as it's ready to collect.",
    venue: "Yaoundé, Cameroon",
    why: "You're getting this because you ordered on",
    contact: "A question? Just reply to this email.",
    ref: "Reference",
    helpSubject: "About my DevFest Yaoundé email",
    helpHello: "Hi DevFest Yaoundé team,",
    helpAbout: "I need a hand with this email:",
    helpAsk: "My question:",
    helpThanks: "Thanks!",
    claimSubject: "A ticket's waiting for you — DevFest Yaoundé 2026",
    claimTitle: "This one's yours.",
    claimIntro:
      "Someone got you a ticket to DevFest Yaoundé 2026. Claim it into your own account and you're all set — you'll use it to check in on the day.",
    claimCta: "Claim my ticket",
    claimHint: "You'll sign in with Google — same account, no new password.",
  },
} as const;

/**
 * The shell every message shares: brand bar, yellow title band, content,
 * footer. One layout, so a second template cannot drift from the first.
 */
function layout(
  l: Locale,
  title: string,
  bodyHtml: string,
  /** The order/payment reference, when there is one — printed in the body too. */
  reference?: string,
): string {
  const c = COPY[l];
  // The support link arrives with a subject and a friendly opening already
  // written, naming THIS email and (for a receipt) its reference, so whoever
  // answers can find the order without a round of "which one?".
  const help = mailtoHref(CHAPTER_EMAIL, {
    subject: `${c.helpSubject} — ${title}`,
    body: [
      c.helpHello,
      "",
      `${c.helpAbout} « ${title} »`,
      ...(reference ? [`${c.ref} : ${reference}`] : []),
      "",
      c.helpAsk,
      "",
      "",
      c.helpThanks,
    ].join("\n"),
  });
  const host = SITE_URL.replace(/^https?:\/\//, "").replace(/\/$/, "");

  return `<!doctype html>
<html lang="${l}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:${BRAND.offwhite};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(title)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.offwhite};padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">

  <!-- Brand bar. The chapter first, the edition second: the chapter is who
       is writing, the edition is what about.

       The mark is an absolute HTTPS URL to a PNG, and it has to be all three
       of those. Mail clients strip data: URIs, most of them will not render
       SVG at all, and a relative path has no origin to resolve against in an
       inbox. The alt text and the wordmark below carry it when images are
       blocked, which for a first message from an unknown sender is common. -->
  <tr><td style="background:${BRAND.ink};border-radius:16px 16px 0 0;padding:18px 28px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
      <td style="padding-right:12px;line-height:0;" valign="middle">
        <img src="${SITE_URL}/logo/d-logo-left.png" width="20" height="23" alt="" style="display:inline-block;vertical-align:middle;border:0;">
        <img src="${SITE_URL}/logo/d-logo-right.png" width="20" height="23" alt="" style="display:inline-block;vertical-align:middle;border:0;">
      </td>
      <td valign="middle">
        <span style="font-family:${MONO};font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:${BRAND.yellow};">${escapeHtml(c.chapter)}</span>
        <span style="font-family:${MONO};font-size:12px;letter-spacing:1.5px;color:${BRAND.offwhite};opacity:.5;">&nbsp;&times;&nbsp;</span>
        <span style="font-family:${MONO};font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:${BRAND.offwhite};">${escapeHtml(c.edition)}</span>
      </td>
    </tr></table>
  </td></tr>

  <!-- Title band. Flat colour, no gradient — DESIGN.md is explicit. -->
  <tr><td style="background:${BRAND.yellow};padding:32px 28px;">
    <h1 style="margin:0;font-family:${FONT};font-size:30px;line-height:1.15;font-weight:800;color:${BRAND.ink};">${escapeHtml(title)}</h1>
  </td></tr>

  <tr><td style="background:${BRAND.paper};padding:28px;">
${bodyHtml}
  </td></tr>

  <tr><td style="background:${BRAND.paper};border-radius:0 0 16px 16px;border-top:1px solid ${BRAND.hairline};padding:22px 28px;">
    <p style="margin:0 0 6px;font-family:${FONT};font-size:13px;line-height:1.6;color:${BRAND.muted};">${escapeHtml(c.contact)}</p>
    <p style="margin:0;font-family:${FONT};font-size:12px;line-height:1.6;color:${BRAND.muted};">
      ${escapeHtml(c.why)} <a href="${SITE_URL}" style="color:${BRAND.ink};font-weight:600;">${escapeHtml(host)}</a>
      &nbsp;·&nbsp; <a href="${escapeHtml(help)}" style="color:${BRAND.ink};">${escapeHtml(CHAPTER_EMAIL)}</a>
    </p>
  </td></tr>

</table>
</td></tr></table>
</body></html>`;
}

/** A pill button. Anchor-with-padding, the only shape every client renders. */
function button(label: string, href: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 0;"><tr><td style="background:${BRAND.yellow};border:2px solid ${BRAND.ink};border-radius:999px;">
<a href="${href}" style="display:inline-block;padding:12px 26px;font-family:${FONT};font-size:15px;font-weight:700;color:${BRAND.ink};text-decoration:none;">${escapeHtml(label)}</a>
</td></tr></table>`;
}

/**
 * The money block. Subtotal and discount appear only when there was one; the
 * transaction fee appears whenever it is non-zero (it is zero exactly when
 * the base, post-discount amount is zero — a free tier, or a 100%-off code —
 * since `transactionFeeAmount(0)` is 0 by construction).
 *
 * `subtotal` is derived from `net_amount + discount_amount`, NOT from
 * `charged_amount + discount_amount` — `charged_amount` includes the fee
 * now, so adding the discount back to it would overstate the base price by
 * the fee amount. `net_amount` is always the fee-free, post-discount base.
 */
function totalsHtml(intent: PaymentIntentRow, l: Locale): string {
  const c = COPY[l];
  const discounted = intent.discount_amount > 0;
  const subtotal = intent.net_amount + intent.discount_amount;
  const feeAmount = intent.charged_amount - intent.net_amount;

  // Nothing was charged and nothing was taken off: there is no money story to
  // tell, and "Total paid: Free" on a free pass reads like a bill for zero.
  // A 100%-discounted order still gets the block — what was deducted is the
  // whole point of it.
  if (intent.charged_amount === 0 && !discounted) return "";

  const row = (label: string, value: string, strong = false) =>
    `<tr>
<td style="padding:6px 0;font-family:${FONT};font-size:${strong ? "16px" : "14px"};${strong ? "font-weight:700;" : ""}color:${strong ? BRAND.ink : BRAND.muted};">${escapeHtml(label)}</td>
<td align="right" style="padding:6px 0;font-family:${MONO};font-size:${strong ? "18px" : "14px"};${strong ? "font-weight:700;" : ""}color:${strong ? BRAND.ink : BRAND.muted};">${escapeHtml(value)}</td>
</tr>`;

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 0;border-top:2px solid ${BRAND.ink};padding-top:8px;">
${discounted ? row(c.subtotal, money(subtotal, l)) : ""}
${
  discounted
    ? row(
        `${c.discount}${intent.discount_code ? ` · ${intent.discount_code}` : ""}`,
        `-${money(intent.discount_amount, l)}`,
      )
    : ""
}
${feeAmount > 0 ? row(c.transactionFee, money(feeAmount, l)) : ""}
${row(c.totalPaid, intent.charged_amount === 0 ? c.free : money(intent.charged_amount, l), true)}
</table>`;
}

function totalsText(intent: PaymentIntentRow, l: Locale): string[] {
  const c = COPY[l];
  const out: string[] = [];
  const feeAmount = intent.charged_amount - intent.net_amount;
  // Same rule as the HTML side, and for the same reason.
  if (intent.charged_amount === 0 && intent.discount_amount === 0) return out;
  if (intent.discount_amount > 0) {
    out.push(
      `${c.subtotal}: ${money(intent.net_amount + intent.discount_amount, l)}`,
    );
    out.push(
      `${c.discount}${intent.discount_code ? ` (${intent.discount_code})` : ""}: -${money(intent.discount_amount, l)}`,
    );
  }
  if (feeAmount > 0) {
    out.push(`${c.transactionFee}: ${money(feeAmount, l)}`);
  }
  out.push(
    `${c.totalPaid}: ${intent.charged_amount === 0 ? c.free : money(intent.charged_amount, l)}`,
  );
  return out;
}

export interface TicketForEmail {
  attendeeName: string;
  tierId: string;
  badgeCode: string;
  /** Chosen at checkout for a tier that includes apparel. */
  apparelSize?: string | null;
  /** The tier's proper name, e.g. "SONNET" — not the slug. */
  tierName?: string;
  /** Sub-title beside the name: "Free pass". Already localised. */
  tierLabel?: string;
  /** What the tier includes, already localised. */
  perks?: string[];
}

/**
 * Sent once, when a ticket order is fulfilled.
 *
 * One card per ticket, because one order can hold several and each has its
 * own badge code. Burying three codes in a paragraph is how somebody arrives
 * at the door with the wrong one.
 */
export function renderTicketReceipt(
  intent: PaymentIntentRow,
  tickets: TicketForEmail[],
  dates: readonly string[] = EVENT_DATES,
): RenderedEmail {
  const l = locale(intent);
  const c = COPY[l];
  const free = intent.charged_amount === 0;

  const subject = c.ticketsSubject;

  const intro = free
    ? l === "fr"
      ? "C'est confirmé — on se voit au DevFest. Tout ce qu'il te faut est là, en bas."
      : "You're confirmed — see you at DevFest. Everything you need is below."
    : l === "fr"
      ? "Paiement reçu, merci ! Tout ce qu'il te faut est là, en bas."
      : "Payment received, thank you! Everything you need is below.";

  const single = tickets.length === 1;

  const cards = tickets
    .map((ticket) => {
      const tierName = ticket.tierName ?? ticket.tierId.toUpperCase();
      const perks = (ticket.perks ?? [])
        .map(
          (perk) =>
            `<tr><td style="padding:2px 0;font-family:${FONT};font-size:13px;line-height:1.5;color:${BRAND.muted};">&bull;&nbsp; ${escapeHtml(perk)}</td></tr>`,
        )
        .join("");

      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px;border:2px solid ${BRAND.ink};border-radius:14px;background:${BRAND.paper};">
<tr><td style="padding:20px;">

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
    <td style="font-family:${MONO};font-size:13px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${BRAND.ink};">${escapeHtml(tierName)}</td>
    ${
      ticket.tierLabel
        ? `<td align="right" style="font-family:${FONT};font-size:12px;color:${BRAND.muted};">${escapeHtml(ticket.tierLabel)}</td>`
        : "<td></td>"
    }
  </tr></table>

  <p style="margin:10px 0 0;font-family:${FONT};font-size:12px;text-transform:uppercase;letter-spacing:.5px;color:${BRAND.muted};">${escapeHtml(c.forWhom)}</p>
  <p style="margin:2px 0 0;font-family:${FONT};font-size:18px;font-weight:700;color:${BRAND.ink};">${escapeHtml(ticket.attendeeName)}</p>

  ${
    ticket.apparelSize
      ? `<p style="margin:8px 0 0;font-family:${FONT};font-size:13px;color:${BRAND.muted};">${escapeHtml(c.size)} : <span style="font-family:${MONO};font-weight:700;color:${BRAND.ink};">${escapeHtml(ticket.apparelSize)}</span></p>`
      : ""
  }

  <!-- The badge code, given the space it deserves: it is the one thing in
       this email somebody has to find again in a hurry, at a door. -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0 0;background:${BRAND.yellowPastel};border-radius:10px;">
  <tr><td style="padding:14px 16px;">
    <p style="margin:0;font-family:${FONT};font-size:11px;text-transform:uppercase;letter-spacing:1px;font-weight:700;color:${BRAND.ink};">${escapeHtml(c.entryCode)}</p>
    <p style="margin:4px 0 0;font-family:${MONO};font-size:22px;font-weight:700;letter-spacing:1.5px;color:${BRAND.ink};">${escapeHtml(ticket.badgeCode)}</p>
  </td></tr></table>

  ${
    perks
      ? `<p style="margin:16px 0 6px;font-family:${FONT};font-size:11px;text-transform:uppercase;letter-spacing:.5px;font-weight:700;color:${BRAND.ink};">${escapeHtml(c.included)}</p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${perks}</table>`
      : ""
  }

</td></tr></table>`;
    })
    .join("");

  const html = layout(
    l,
    c.ticketsTitle,
    `<p style="margin:0 0 8px;font-family:${FONT};font-size:16px;line-height:1.6;color:${BRAND.ink};">${escapeHtml(intro)}</p>
<p style="margin:0 0 24px;font-family:${FONT};font-size:13px;line-height:1.6;color:${BRAND.muted};">${escapeHtml(c.entryCodeHint)}</p>

<p style="margin:0 0 12px;font-family:${FONT};font-size:12px;text-transform:uppercase;letter-spacing:1px;font-weight:700;color:${BRAND.ink};">${escapeHtml(single ? c.yourTicket : c.ticketsHeading)}</p>
${cards}

${totalsHtml(intent, l)}

<p style="margin:20px 0 0;font-family:${FONT};font-size:13px;line-height:1.6;color:${BRAND.muted};">${escapeHtml(eventDate(l, dates))} &nbsp;·&nbsp; ${escapeHtml(c.venue)}</p>

${button(c.myTickets, `${SITE_URL}/${l}/account`)}

<p style="margin:20px 0 0;font-family:${MONO};font-size:11px;color:${BRAND.muted};">${escapeHtml(c.ref)} ${escapeHtml(intent.deposit_id)}</p>`,
    intent.deposit_id,
  );

  const text = [
    `${c.chapter} × ${c.edition}`,
    "",
    c.ticketsTitle,
    intro,
    c.entryCodeHint,
    "",
    single ? c.yourTicket : c.ticketsHeading,
    "",
    ...tickets.flatMap((ticket) => {
      const rows = [
        `  ${ticket.tierName ?? ticket.tierId.toUpperCase()}${ticket.tierLabel ? ` (${ticket.tierLabel})` : ""}`,
        `  ${c.forWhom} : ${ticket.attendeeName}`,
        `  ${c.entryCode} : ${ticket.badgeCode}`,
      ];
      if (ticket.apparelSize) rows.push(`  ${c.size} : ${ticket.apparelSize}`);
      for (const perk of ticket.perks ?? []) rows.push(`    - ${perk}`);
      rows.push("");
      return rows;
    }),
    ...totalsText(intent, l),
    "",
    `${eventDate(l, dates)} — ${c.venue}`,
    `${c.myTickets} : ${SITE_URL}/${l}/account`,
    "",
    `${c.ref} ${intent.deposit_id}`,
    `${c.contact} ${CHAPTER_EMAIL}`,
  ].join("\n");

  return { subject, text, html };
}

/** Sent once, when a shop order is fulfilled. */
export function renderOrderReceipt(intent: PaymentIntentRow): RenderedEmail {
  const l = locale(intent);
  const c = COPY[l];
  const subject = c.orderSubject;

  const intro =
    l === "fr"
      ? "Merci ! Ta commande est enregistrée."
      : "Thank you! Your order is in.";

  const items = intent.line_items.map((line) => {
    const name = line.name[l] ?? line.name.fr;
    const variant = [line.variant?.size, line.variant?.color]
      .filter(Boolean)
      .join(" · ");
    return { name, variant, qty: line.quantity, amount: line.lineAmount };
  });

  const rows = items
    .map(
      (i) => `<tr>
<td style="padding:14px 0;border-bottom:1px solid ${BRAND.hairline};font-family:${FONT};font-size:15px;color:${BRAND.ink};">
  <strong style="font-weight:700;">${escapeHtml(i.name)}</strong>
  ${i.variant ? `<br><span style="font-size:13px;color:${BRAND.muted};">${escapeHtml(i.variant)}</span>` : ""}
  <br><span style="font-family:${MONO};font-size:12px;color:${BRAND.muted};">&times; ${escapeHtml(String(i.qty))}</span>
</td>
<td align="right" style="padding:14px 0;border-bottom:1px solid ${BRAND.hairline};font-family:${MONO};font-size:15px;font-weight:700;color:${BRAND.ink};">${escapeHtml(money(i.amount, l))}</td>
</tr>`,
    )
    .join("");

  const fulfilment = intent.fulfilment;
  const fulfilmentHtml = fulfilment
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 0;background:${BRAND.offwhite};border-radius:12px;">
<tr><td style="padding:16px 18px;">
  <p style="margin:0;font-family:${FONT};font-size:12px;text-transform:uppercase;letter-spacing:.5px;font-weight:700;color:${BRAND.ink};">${escapeHtml(fulfilment.method === "shipping" ? c.shipping : c.pickup)}</p>
  ${fulfilment.note ? `<p style="margin:6px 0 0;font-family:${FONT};font-size:14px;line-height:1.5;color:${BRAND.muted};">${escapeHtml(c.fulfilmentNote)} : ${escapeHtml(fulfilment.note)}</p>` : ""}
</td></tr></table>`
    : "";

  const html = layout(
    l,
    c.orderTitle,
    `<p style="margin:0 0 8px;font-family:${FONT};font-size:16px;line-height:1.6;color:${BRAND.ink};">${escapeHtml(intro)}</p>
<p style="margin:0 0 24px;font-family:${FONT};font-size:13px;line-height:1.6;color:${BRAND.muted};">${escapeHtml(c.orderNext)}</p>

<p style="margin:0 0 4px;font-family:${FONT};font-size:12px;text-transform:uppercase;letter-spacing:1px;font-weight:700;color:${BRAND.ink};">${escapeHtml(c.orderHeading)}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table>

${totalsHtml(intent, l)}
${fulfilmentHtml}

${button(c.myTickets, `${SITE_URL}/${l}/account`)}

<p style="margin:20px 0 0;font-family:${MONO};font-size:11px;color:${BRAND.muted};">${escapeHtml(c.ref)} ${escapeHtml(intent.deposit_id)}</p>`,
    intent.deposit_id,
  );

  const text = [
    `${c.chapter} × ${c.edition}`,
    "",
    c.orderTitle,
    intro,
    c.orderNext,
    "",
    c.orderHeading,
    "",
    ...items.map(
      (i) =>
        `  ${i.qty} × ${i.name}${i.variant ? ` (${i.variant})` : ""} — ${money(i.amount, l)}`,
    ),
    "",
    ...totalsText(intent, l),
    ...(fulfilment
      ? [
          "",
          fulfilment.method === "shipping" ? c.shipping : c.pickup,
          ...(fulfilment.note
            ? [`${c.fulfilmentNote} : ${fulfilment.note}`]
            : []),
        ]
      : []),
    "",
    `${c.myTickets} : ${SITE_URL}/${l}/account`,
    "",
    `${c.ref} ${intent.deposit_id}`,
    `${c.contact} ${CHAPTER_EMAIL}`,
  ].join("\n");

  return { subject, text, html };
}

export interface TicketClaimEmailInput {
  locale: Locale;
  attendeeName: string;
  badgeCode: string;
  /** The tier's proper name, e.g. "SONNET" — not the slug. */
  tierName?: string;
  /** Sub-title beside the name: "Free pass". Already localised. */
  tierLabel?: string;
  claimUrl: string;
}

/**
 * Sent once per ticket bought for someone else (`is_self = false`),
 * ALONGSIDE the buyer's own receipt, not instead of it (PHASE22 §C).
 *
 * The buyer's receipt already lists every badge code in the order — this is
 * the SEPARATE message that lets the actual attendee link the ticket to
 * their own account, so it shows under their own `/account` and they can
 * check in under their own name rather than the buyer's. Sending it to
 * `attendee_email` rather than the buyer's inbox is the entire point: the
 * buyer already has everything they need in their own receipt.
 */
export function renderTicketClaim(input: TicketClaimEmailInput): RenderedEmail {
  const l = input.locale;
  const c = COPY[l];
  const tierName = input.tierName?.toUpperCase();

  const html = layout(
    l,
    c.claimTitle,
    `<p style="margin:0 0 24px;font-family:${FONT};font-size:16px;line-height:1.6;color:${BRAND.ink};">${escapeHtml(c.claimIntro)}</p>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;border:2px solid ${BRAND.ink};border-radius:14px;background:${BRAND.paper};">
<tr><td style="padding:20px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
    ${tierName ? `<td style="font-family:${MONO};font-size:13px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${BRAND.ink};">${escapeHtml(tierName)}</td>` : "<td></td>"}
    ${
      input.tierLabel
        ? `<td align="right" style="font-family:${FONT};font-size:12px;color:${BRAND.muted};">${escapeHtml(input.tierLabel)}</td>`
        : "<td></td>"
    }
  </tr></table>
  <p style="margin:10px 0 0;font-family:${FONT};font-size:12px;text-transform:uppercase;letter-spacing:.5px;color:${BRAND.muted};">${escapeHtml(c.forWhom)}</p>
  <p style="margin:2px 0 0;font-family:${FONT};font-size:18px;font-weight:700;color:${BRAND.ink};">${escapeHtml(input.attendeeName)}</p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0 0;background:${BRAND.yellowPastel};border-radius:10px;">
  <tr><td style="padding:14px 16px;">
    <p style="margin:0;font-family:${FONT};font-size:11px;text-transform:uppercase;letter-spacing:1px;font-weight:700;color:${BRAND.ink};">${escapeHtml(c.entryCode)}</p>
    <p style="margin:4px 0 0;font-family:${MONO};font-size:22px;font-weight:700;letter-spacing:1.5px;color:${BRAND.ink};">${escapeHtml(input.badgeCode)}</p>
  </td></tr></table>
</td></tr></table>

${button(c.claimCta, input.claimUrl)}

<p style="margin:16px 0 0;font-family:${FONT};font-size:13px;line-height:1.6;color:${BRAND.muted};">${escapeHtml(c.claimHint)}</p>`,
  );

  const text = [
    `${c.chapter} × ${c.edition}`,
    "",
    c.claimTitle,
    c.claimIntro,
    "",
    ...(tierName
      ? [`  ${tierName}${input.tierLabel ? ` (${input.tierLabel})` : ""}`]
      : []),
    `  ${c.forWhom} : ${input.attendeeName}`,
    `  ${c.entryCode} : ${input.badgeCode}`,
    "",
    `${c.claimCta} : ${input.claimUrl}`,
    c.claimHint,
    "",
    `${c.contact} ${CHAPTER_EMAIL}`,
  ].join("\n");

  return { subject: c.claimSubject, text, html };
}
