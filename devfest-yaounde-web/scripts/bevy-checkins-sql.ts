/**
 * Bevy attendee export → SQL that lets its checked-in attendees vote in the
 * pitch contest (ADR 0099, migration 0047).
 *
 *   npx tsx scripts/bevy-checkins-sql.ts .private/<bevy-export>.csv
 *
 * Writes `.private/bevy-checkins.sql` (git-ignored) and prints counts only —
 * never an email or a name. Paste the file into the Supabase SQL editor.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { bevyCheckinsSql, readBevyCheckins } from "@/lib/bevy-checkins";

const [input, output = ".private/bevy-checkins.sql"] = process.argv.slice(2);
if (!input) {
  console.error("Usage: npx tsx scripts/bevy-checkins-sql.ts <bevy.csv> [out.sql]");
  process.exit(1);
}

const data = readBevyCheckins(readFileSync(input, "utf8"));
if (data.masked) {
  console.error(
    `${data.masked} of ${data.checkedIn} checked-in emails are masked by Bevy ` +
      `("j*****@gmail.com"), so they can't be matched to anyone. Export the ` +
      `attendee list again with full emails (as the event's organiser), then ` +
      `re-run this. Nothing was written.`,
  );
  process.exit(2);
}
writeFileSync(output, bevyCheckinsSql(data, basename(input)));

let people = 0;
for (const n of data.keys.values()) people += n;
console.log(
  [
    `${data.rows} registrations`,
    `${data.checkedIn} checked in`,
    `${data.keys.size} distinct emails (${people} people)`,
    data.skipped ? `${data.skipped} unreadable emails skipped` : null,
  ]
    .filter(Boolean)
    .join(" · "),
);
console.log(`Wrote ${output}`);
