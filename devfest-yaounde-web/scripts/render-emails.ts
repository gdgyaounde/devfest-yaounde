/**
 * `npm run emails:render` — writes the launch-week update emails (ADR 0076)
 * to docs/content/emails/, from the SAME renderer the admin Emails view
 * previews, so the downloadable files and the code cannot drift.
 *
 * Output (committed, so organisers can download them straight from GitHub):
 *   docs/content/emails/launch-update-2026-11.paid.html / .txt
 *   docs/content/emails/launch-update-2026-11.free.html / .txt
 *
 * Uses the repo dates (ADR 0071/0072). A test re-renders and fails if the
 * committed files are stale.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  renderLaunchUpdate,
  type LaunchAudience,
} from "../src/lib/email/templates";

const OUT = join(process.cwd(), "docs/content/emails");
mkdirSync(OUT, { recursive: true });

for (const audience of ["paid", "free"] as LaunchAudience[]) {
  const email = renderLaunchUpdate({ audience });
  const base = join(OUT, `launch-update-2026-11.${audience}`);
  writeFileSync(
    `${base}.html`,
    email.html.endsWith("\n") ? email.html : `${email.html}\n`,
  );
  writeFileSync(`${base}.txt`, `Subject: ${email.subject}\n\n${email.text}\n`);
  console.log(`wrote ${base}.html / .txt`);
}
