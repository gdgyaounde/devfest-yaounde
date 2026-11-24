/**
 * Migration 0048 (event certificates, ADR 0100) against a REAL Postgres
 * engine.
 *
 *   npm i --no-save @electric-sql/pglite
 *   npx tsx --conditions=react-server tests/db/certificates.db.ts
 *
 * Not part of `npm test` (PGlite is deliberately not a dependency). In
 * memory, never a real database. Applies 0048 VERBATIM and checks:
 *   - the id, role, name and detail constraints;
 *   - there is no email column at all;
 *   - RLS is on with no policies;
 *   - re-issuing an id (what the API's upsert does: only the columns it
 *     sends) updates the name but keeps the first issued_at and any
 *     revocation.
 */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL("../../supabase/migrations/0048_certificates.sql", import.meta.url),
  "utf8",
);

let passed = 0;
let failed = 0;
function check(label: string, ok: boolean, detail = "") {
  if (ok) passed++;
  else failed++;
  console.log(
    `  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`,
  );
}

async function main() {
  const db = new PGlite();
  await db.exec(
    "create role anon; create role authenticated; create role service_role;",
  );
  await db.exec(migration);
  check("migration 0048 applied verbatim", true);

  const refuses = async (label: string, sql: string) => {
    try {
      await db.exec(sql);
      check(label, false, "was accepted");
    } catch {
      check(label, true);
    }
  };
  const insert = (id: string, extra = "") =>
    `insert into public.certificates (id, edition, full_name, role${extra ? ", detail" : ""}) values ('${id}', 2026, 'Ada Lovelace', 'speaker'${extra ? `, '${extra}'` : ""})`;

  console.log("\nConstraints");
  await db.exec(insert("DFY26-0001", "AI at scale"));
  check("a well-formed certificate is accepted", true);
  await refuses("a malformed id is refused", insert("dfy26-1"));
  await refuses(
    "an unknown role is refused",
    "insert into public.certificates (id, edition, full_name, role) values ('DFY26-0002', 2026, 'X', 'vip')",
  );
  await refuses(
    "an empty name is refused",
    "insert into public.certificates (id, edition, full_name, role) values ('DFY26-0003', 2026, '', 'attendee')",
  );
  await refuses(
    "an absurd edition is refused",
    "insert into public.certificates (id, edition, full_name, role) values ('DFY26-0004', 1999, 'X', 'attendee')",
  );
  await refuses(
    "a duplicate id is refused (plain insert)",
    insert("DFY26-0001"),
  );

  const cols = await db.query<{ column_name: string }>(
    "select column_name from information_schema.columns where table_name = 'certificates'",
  );
  check(
    "there is no email column",
    !cols.rows.some((c) => /mail/i.test(c.column_name)),
    cols.rows.map((c) => c.column_name).join(", "),
  );
  const rls = await db.query<{ on: boolean }>(
    "select relrowsecurity as on from pg_class where relname = 'certificates'",
  );
  check("RLS is on", rls.rows[0].on);
  const policies = await db.query<{ n: number }>(
    "select count(*)::int as n from pg_policies where tablename = 'certificates'",
  );
  check("…with no policies", policies.rows[0].n === 0);

  console.log("\nRe-issue (the API's upsert)");
  await db.exec(
    "update public.certificates set issued_at = '2026-11-24T10:00:00Z', revoked_at = '2026-11-25T10:00:00Z' where id = 'DFY26-0001'",
  );
  // What supabase-js `.upsert(rows, { onConflict: "id" })` sends: only the
  // columns in the row — no issued_at, no revoked_at.
  await db.exec(`
    insert into public.certificates (id, edition, full_name, role, detail, updated_at)
    values ('DFY26-0001', 2026, 'Ada King Lovelace', 'speaker', 'AI at scale', now())
    on conflict (id) do update set
      edition = excluded.edition, full_name = excluded.full_name,
      role = excluded.role, detail = excluded.detail, updated_at = excluded.updated_at`);
  const row = (
    await db.query<{
      full_name: string;
      issued_at: Date;
      revoked_at: Date | null;
    }>(
      "select full_name, issued_at, revoked_at from public.certificates where id = 'DFY26-0001'",
    )
  ).rows[0];
  check("the corrected name is stored", row.full_name === "Ada King Lovelace");
  check(
    "the first issue date is kept",
    new Date(row.issued_at).toISOString() === "2026-11-24T10:00:00.000Z",
  );
  check("a revocation is never cleared by a re-issue", row.revoked_at !== null);

  console.log(`\n${passed} passed, ${failed} failed`);
}

main().then(
  () => process.exit(failed ? 1 : 0),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
