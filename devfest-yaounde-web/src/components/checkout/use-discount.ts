"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CheckoutError,
  quoteBasket,
  type QuoteBasket,
} from "@/lib/checkout-client";
import type { AppliedDiscount } from "./OrderSummary";

/**
 * The discount field's whole behaviour, shared by tickets and shop.
 *
 * One hook rather than two copies: the two screens had the same four pieces
 * of state and the same staging logic, and the moment that logic became real
 * (a network call, a pending state, a stale-basket problem) keeping them in
 * step by hand stopped being realistic.
 *
 * ## The stale-basket problem
 *
 * A discount is a function of the basket — 10% off 30 000 is not 10% off
 * 45 000. So a code applied and then followed by "actually, three tickets"
 * leaves a number on screen that is simply wrong, and wrong in the direction
 * that looks like a better deal than the buyer will get.
 *
 * So the basket is re-priced whenever it changes under an applied code. The
 * server is asked again; its answer replaces ours. If the code has stopped
 * working in the meantime — it ran out, it expired — the discount is dropped
 * and the reason surfaces, rather than a stale saving lingering on screen.
 *
 * Re-pricing is free of the brute-force fence: only a REJECTED code charges
 * it (see `consumeOnDiscountFailure`), so a buyer adjusting quantities does
 * not get locked out of their own checkout.
 */

/** What the server came back with. `null` means a newer request superseded it. */
type PriceOutcome =
  { ok: true; applied: AppliedDiscount } | { ok: false; error: string };

export function useDiscount(basket: QuoteBasket) {
  const [code, setCodeState] = useState("");
  const [open, setOpen] = useState(false);
  const [applied, setApplied] = useState<AppliedDiscount | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // A string, so an effect can depend on the CONTENTS of the basket. The
  // array itself is rebuilt every render and would fire on every keystroke.
  const basketKey = JSON.stringify(basket);

  // Answers can arrive out of order: a slow quote for two tickets must not
  // overwrite a fast quote for three. Only the latest request may write.
  const latest = useRef(0);

  const isEmpty =
    basket.kind === "tickets"
      ? basket.tiers.length === 0
      : basket.cart.length === 0;

  /**
   * Ask the server what this basket costs with this code, and RETURN the
   * answer rather than writing it.
   *
   * Writing state here would put a `setState` inside a function called from
   * an effect, which React's lint rules refuse — rightly: they cannot see
   * that it only happens after an await. Returning the outcome keeps the
   * writes at the two call sites, where each can also do the one thing the
   * other must not (raise a spinner; stay silent).
   *
   * The basket is a parameter rather than a ref, because assigning a ref
   * during render is its own rule violation and both callers already hold
   * the basket they mean.
   */
  const price = useCallback(
    async (
      forBasket: QuoteBasket,
      candidate: string,
    ): Promise<PriceOutcome | null> => {
      const ticket = ++latest.current;
      try {
        const quote = await quoteBasket({
          ...forBasket,
          discountCode: candidate,
        });
        if (ticket !== latest.current) return null;

        if (!quote.discountCode || quote.discountAmount <= 0) {
          // The server priced the basket but took nothing off. Treat it as a
          // code that does not apply rather than showing a "−0 XAF" row.
          return { ok: false, error: "discount_not_applicable" };
        }
        return {
          ok: true,
          applied: {
            code: quote.discountCode,
            amount: quote.discountAmount,
            feeAmount: quote.feeAmount,
            charged: quote.charged,
          },
        };
      } catch (err) {
        if (ticket !== latest.current) return null;
        return {
          ok: false,
          error: err instanceof CheckoutError ? err.code : "server_error",
        };
      }
    },
    [],
  );

  /**
   * An empty basket has nothing to discount, so the deduction is DERIVED away
   * rather than cleared.
   *
   * Clearing it from an effect would be a synchronous setState in an effect —
   * the cascading-render pattern React warns about — and it would also lose
   * the code. This way, emptying the bag hides the discount and refilling it
   * re-prices with the same code still applied, which is what someone
   * removing an item and adding another actually means.
   */
  const visibleApplied = isEmpty ? null : applied;

  /**
   * Re-price when the basket changes under an applied code.
   *
   * Silent on purpose: no spinner, because the buyer did not ask for this —
   * they changed a quantity. But a FAILURE is never silent. A code that has
   * stopped working takes its deduction off the screen and says why, rather
   * than leaving a saving on display that will not survive the checkout.
   */
  useEffect(() => {
    if (!applied || isEmpty) return;
    let cancelled = false;

    (async () => {
      const outcome = await price(basket, applied.code);
      if (cancelled || !outcome) return;
      if (outcome.ok) {
        setApplied(outcome.applied);
        setError(null);
      } else {
        setApplied(null);
        setError(outcome.error);
        setOpen(true);
      }
    })();

    return () => {
      cancelled = true;
    };
    // `applied.code` rather than `applied`: re-pricing sets a NEW object, and
    // depending on the object itself would loop forever. `basketKey` stands
    // in for `basket` for the same reason — a fresh array every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basketKey, isEmpty]);

  return {
    open,
    setOpen,
    code,
    setCode: (value: string) => {
      setCodeState(value);
      setError(null);
    },
    pending,
    applied: visibleApplied,
    error,
    apply: () => {
      const candidate = code.trim().toUpperCase();
      if (candidate.length < 3 || isEmpty) return;
      setPending(true);
      setError(null);
      void (async () => {
        const outcome = await price(basket, candidate);
        if (!outcome) return; // Superseded; whoever superseded it will write.
        if (outcome.ok) {
          setApplied(outcome.applied);
          setError(null);
        } else {
          setApplied(null);
          setError(outcome.error);
          setOpen(true);
        }
        setPending(false);
      })();
    },
    remove: () => {
      latest.current++; // Abandon any answer still in flight.
      setApplied(null);
      setCodeState("");
      setError(null);
      setOpen(true);
      setPending(false);
    },
    /**
     * The server refused the code at PAYMENT time, after accepting it for a
     * quote. Rare but real: a single-use code can be spent by someone else
     * in the seconds between the two calls. Keep the basket, drop the code,
     * say why — the guide is explicit about not throwing away the basket.
     */
    reject: (reason: string) => {
      latest.current++;
      setApplied(null);
      setCodeState("");
      setError(reason);
      setOpen(true);
      setPending(false);
    },
    /** What to send with the real checkout: the code the server accepted. */
    submittedCode: visibleApplied?.code,
  };
}
