# Odometer

`src/components/ui/Odometer.tsx`

The digit-roll counter. Built for the remaining-tickets banner (Phase 20),
extracted in Phase 21 so the home page stats reuse it — **there is one
implementation; do not write another.**

A fixed-height column of digits per place, translated with a CSS transition.
No dependency. A transition never animates an element's first painted value,
so it only rolls on a real change; a caller wanting an entrance roll paints 0
first and sets the value later (that is what `StatCounter` does).

| Prop          | Default                         | Notes                                                   |
| ------------- | ------------------------------- | ------------------------------------------------------- |
| `value`       | required                        | whole, non-negative                                     |
| `digits`      | required                        | zero-padded width, so nothing shifts mid-roll           |
| `className`   | the ticket counter's mono style | type styling                                            |
| `live`        | `true`                          | `aria-live="polite"`; off for figures that only roll in |
| `srText`      | the value                       | what assistive tech reads                               |
| `durationMs`  | `500`                           | per column                                              |
| `revolutions` | `0`                             | extra full turns per column on the way to the value     |
| `staggerMs`   | `0`                             | delay between columns, left to right                    |

Defaults are the ticket counter's behaviour exactly. Columns are `1ch` wide
with tabular figures — measured `0.6em` in the mono counter, matching the
`0.62em` it had before extraction to within a rounding step.

`prefers-reduced-motion`: no transition — the value is simply there.
