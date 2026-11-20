# 0091 — The door shows what a pass offers

Date: 2026-11-20
Status: Accepted (hotfix; builds on ADR 0078, 0079)

## Decision

A check-in answer (scan, typed code or name search) now carries `pack`: entry, meal, swag, the perks the pass advertises, what goes in the bag, and the T-shirt size (or "none on file"). The door screen shows it under "Their pack" with icon and words, and no longer resumes the camera after 2 s (6 s, with a Next button, so it can be read out). The rule is the one the meal and swag tables enforce (`perkEligibility`): free pass and paid-back tickets are entry only; an open refund request keeps everything. Built by the pure `buildPack`, unit-tested.

## Consequences

The volunteer can tell the attendee what they get and which table to go to. No new data is exposed: tier perks, product names and the size are what the perk tables already showed.
