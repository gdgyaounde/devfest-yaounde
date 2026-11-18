/**
 * Runs the browser suites, and FAILS IF ONE IS MISSING.
 *
 * That last part is the point. These suites used to live in a scratch
 * directory, and when it was cleaned between sessions the runner kept
 * reporting "0 failures" for every one of them — because a missing file
 * produces an error on stderr, and the old check counted lines beginning
 * with "FAIL". Eighteen suites silently stopped running and nothing said so.
 *
 * A test harness that passes when the tests are absent is worse than no
 * harness: it produces confident, false green. So the list is explicit, a
 * missing file is a hard error, and a suite that exits non-zero fails the run.
 *
 * Usage:  npm run test:browser        (needs the app on :4399 and puppeteer-core)
 */
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

/** Every suite that must run. Adding one here is what makes it required. */
const SUITES = ["preloader", "wall", "admin"];

let failed = 0;
for (const name of SUITES) {
  const file = join(here, `${name}.mjs`);
  if (!existsSync(file)) {
    console.log(`MISSING  ${name} — suite file is not there`);
    failed++;
    continue;
  }
  const run = spawnSync(process.execPath, [file], { encoding: "utf8" });
  const output = `${run.stdout ?? ""}${run.stderr ?? ""}`;
  const summary = output.split("\n").find((l) => /: \d+ passed/.test(l)) ?? "";
  const ok = run.status === 0 && /0 failures/.test(summary);
  console.log(
    `${ok ? "ok      " : "FAILED  "} ${name.padEnd(12)} ${summary.trim()}`,
  );
  if (!ok) {
    failed++;
    output
      .split("\n")
      .filter((l) => l.startsWith("FAIL"))
      .forEach((l) => console.log("   " + l));
  }
}

console.log(`\n${SUITES.length - failed}/${SUITES.length} suites passed`);
process.exit(failed > 0 ? 1 : 0);
