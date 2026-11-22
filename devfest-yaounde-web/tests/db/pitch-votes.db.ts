/**
 * The pitch vote's eligibility and one-vote rule, proved against a REAL
 * Postgres engine (ADR 0099).
 *
 *   npm i --no-save @electric-sql/pglite
 *   npx tsx --conditions=react-server tests/db/pitch-votes.db.ts
 *
 * Not part of `npm test` (PGlite is deliberately not a dependency — see
 * tests/db/organiser-roles.db.ts). It never touches a real database: it
 * builds a scratch one in memory with just the columns the migration reads
 * from `auth.users`, `tickets` and `reservations`, applies migration 0046
 * VERBATIM, and checks every rule:
 *
 *   - checked in on a ticket bought for them (by email, any case) → may vote;
 *   - checked in on a ticket held as one's own (is_self) or claimed → may vote;
 *   - paid for someone else's ticket, who was checked in → may NOT vote;
 *   - an own ticket's attendee email never gives a SECOND account a vote;
 *   - a ticket NOT checked in → may not vote;
 *   - a checked-in reservation → its account may vote; its contact email
 *     gives nobody else a vote; a cancelled one → nobody;
 *   - up to two picks per voter, never the same project twice; sending a new
 *     set replaces the old one; the TABLE refuses a third row on its own;
 *   - stats count eligible accounts once each, voters, picks, and the tally;
 *   - nobody but the service role can execute the functions.
 */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL("../../supabase/migrations/0046_pitch_votes.sql", import.meta.url),
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

const u = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const U = {
  attendee: u(1), // checked in, ticket bought by the buyer below
  buyer: u(2), // paid for attendee's ticket, never came
  self: u(3), // bought own ticket (is_self), checked in
  claimer: u(4), // claimed a ticket, checked in
  absent: u(5), // own ticket, NOT checked in
  reserver: u(6), // checked-in reservation, by account
  contact: u(7), // named as contact on someone else's checked-in reservation
  cancelled: u(8), // checked in, then the reservation was cancelled
  stranger: u(9), // nothing at all
  caseUser: u(10), // attendee email differs only in case/spaces
  typo: u(11), // owns the email typed on someone's is_self ticket
};

async function main() {
  const db = new PGlite();
  await db.exec(`
  create role anon; create role authenticated; create role service_role;
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create table public.tickets (
    id serial primary key,
    user_id uuid not null,
    attendee_email text not null,
    checked_in_at timestamptz,
    is_self boolean not null default false,
    claimed_at timestamptz
  );
  create table public.reservations (
    id serial primary key,
    user_id uuid not null,
    contact_email text,
    status text not null,
    checked_in_at timestamptz
  );
  insert into auth.users values
    ('${U.attendee}', 'attendee@example.com'),
    ('${U.buyer}', 'buyer@example.com'),
    ('${U.self}', 'self@example.com'),
    ('${U.claimer}', 'claimer@example.com'),
    ('${U.absent}', 'absent@example.com'),
    ('${U.reserver}', 'reserver@example.com'),
    ('${U.contact}', 'contact@example.com'),
    ('${U.cancelled}', 'cancelled@example.com'),
    ('${U.stranger}', 'stranger@example.com'),
    ('${U.caseUser}', 'Case.User@Example.com'),
    ('${U.typo}', 'someone-typo@example.com');
  insert into public.tickets (user_id, attendee_email, checked_in_at, is_self, claimed_at) values
    ('${U.buyer}', 'attendee@example.com', now(), false, null),
    ('${U.self}', 'someone-typo@example.com', now(), true, null),
    ('${U.claimer}', 'not-their-email@example.com', now(), false, now()),
    ('${U.absent}', 'absent@example.com', null, true, null),
    ('${U.stranger}', ' CASE.user@example.COM ', now(), false, null);
  insert into public.reservations (user_id, contact_email, status, checked_in_at) values
    ('${U.reserver}', 'contact@example.com', 'reserved', now()),
    ('${U.cancelled}', 'cancelled@example.com', 'cancelled', now());
`);
  await db.exec(migration);
  console.log("migration 0046 applied verbatim");

  async function eligible(id: string) {
    const r = await db.query<{ ok: boolean }>(
      "select public.pitch_vote_eligible($1) as ok",
      [id],
    );
    return r.rows[0].ok;
  }
  async function pick(id: string, projects: string[]) {
    const r = await db.query<{ r: { status: string } }>(
      "select public.set_pitch_votes($1, $2) as r",
      [id, projects],
    );
    return r.rows[0].r.status;
  }
  async function picksOf(id: string) {
    const r = await db.query<{ project_id: string }>(
      "select project_id from public.pitch_votes where user_id = $1 order by project_id",
      [id],
    );
    return r.rows.map((x) => x.project_id).join(",");
  }

  console.log("\nWho may vote");
  check("attendee checked in (by attendee email)", await eligible(U.attendee));
  check("buyer of someone else's ticket may NOT", !(await eligible(U.buyer)));
  check("own ticket (is_self), checked in", await eligible(U.self));
  check("claimed ticket, checked in", await eligible(U.claimer));
  check("own ticket NOT checked in may NOT", !(await eligible(U.absent)));
  check("checked-in reservation by account", await eligible(U.reserver));
  check(
    "a reservation's contact email gives nobody else a vote",
    !(await eligible(U.contact)),
  );
  check(
    "an own ticket's attendee email gives a second account no vote",
    !(await eligible(U.typo)),
  );
  check("cancelled reservation may NOT", !(await eligible(U.cancelled)));
  check(
    "stranger: the paying account on someone else's ticket may NOT",
    // stranger paid for caseUser's ticket; that makes caseUser eligible,
    // not the stranger.
    !(await eligible(U.stranger)),
  );
  check(
    "attendee email matched regardless of case and spaces",
    await eligible(U.caseUser),
  );
  check("an account that does not exist may NOT", !(await eligible(u(999))));

  console.log("\nPicking");
  check(
    "ineligible vote refused",
    (await pick(U.buyer, ["safeme"])) === "not_eligible",
  );
  check("…and nothing was written", (await picksOf(U.buyer)) === "");
  check(
    "one pick counted",
    (await pick(U.attendee, ["safeme"])) === "saved" &&
      (await picksOf(U.attendee)) === "safeme",
  );
  check(
    "two picks counted",
    (await pick(U.attendee, ["safeme", "finfree"])) === "saved" &&
      (await picksOf(U.attendee)) === "finfree,safeme",
  );
  check(
    "a new set replaces the old one",
    (await pick(U.attendee, ["finfree", "holaride"])) === "saved" &&
      (await picksOf(U.attendee)) === "finfree,holaride",
  );
  check(
    "three picks refused, the two kept",
    (await pick(U.attendee, ["finfree", "holaride", "safeme"])) ===
      "too_many" && (await picksOf(U.attendee)) === "finfree,holaride",
  );
  check(
    "the same project twice refused",
    (await pick(U.attendee, ["finfree", "finfree"])) === "duplicate" &&
      (await picksOf(U.attendee)) === "finfree,holaride",
  );
  check(
    "an empty set withdraws every pick",
    (await pick(U.self, ["safeme"])) === "saved" &&
      (await pick(U.self, [])) === "saved" &&
      (await picksOf(U.self)) === "",
  );
  let rejected = false;
  try {
    await pick(U.self, ["Robert'); drop table x;--"]);
  } catch {
    rejected = true;
  }
  check("a malformed project id is rejected by the check constraint", rejected);

  // Around the function: a raw third row must still be refused by the table.
  let capped = false;
  try {
    await db.query(
      "insert into public.pitch_votes (user_id, project_id) values ($1, 'safeme')",
      [U.attendee],
    );
  } catch {
    capped = true;
  }
  check("the table itself refuses a third pick", capped);
  let dup = false;
  try {
    await db.query(
      "insert into public.pitch_votes (user_id, project_id) values ($1, 'finfree')",
      [U.claimer],
    );
    await db.query(
      "insert into public.pitch_votes (user_id, project_id) values ($1, 'finfree')",
      [U.claimer],
    );
  } catch {
    dup = true;
  }
  check("the table itself refuses the same project twice", dup);
  await db.query("delete from public.pitch_votes where user_id = $1", [
    U.claimer,
  ]);

  await pick(U.self, ["finfree"]);
  await pick(U.reserver, ["holaride", "transax"]);

  console.log("\nStats");
  const stats = (
    await db.query<{
      s: {
        eligible: number;
        voters: number;
        votes: number;
        tally: Record<string, number>;
      };
    }>("select public.pitch_vote_stats() as s")
  ).rows[0].s;
  check(
    "eligible counts each eligible account once",
    // attendee, self, claimer, reserver, caseUser
    stats.eligible === 5,
    JSON.stringify(stats),
  );
  check("3 voters", stats.voters === 3);
  check("5 picks", stats.votes === 5);
  check(
    "tally",
    stats.tally.finfree === 2 &&
      stats.tally.holaride === 2 &&
      stats.tally.transax === 1 &&
      !stats.tally.safeme,
    JSON.stringify(stats.tally),
  );

  console.log("\nPrivileges");
  for (const fn of [
    "pitch_vote_eligible(uuid)",
    "set_pitch_votes(uuid, text[])",
    "pitch_vote_stats()",
  ]) {
    for (const role of ["anon", "authenticated"]) {
      const r = await db.query<{ ok: boolean }>(
        `select has_function_privilege('${role}', 'public.${fn}', 'execute') as ok`,
      );
      check(`${role} cannot execute ${fn}`, !r.rows[0].ok);
    }
  }
  const rls = await db.query<{ on: boolean }>(
    "select relrowsecurity as on from pg_class where relname = 'pitch_votes'",
  );
  check("RLS is on for pitch_votes", rls.rows[0].on);

  console.log(`\n${passed} passed, ${failed} failed`);
}

main().then(
  () => process.exit(failed ? 1 : 0),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
