# Deployment and secrets

Where each secret lives, and why it cannot live somewhere else.

---

## The thing to understand first

**GitHub Secrets cannot supply the app's runtime secrets.**

They are not a general secret store — they are environment variables injected
into a **GitHub Actions runner** while a workflow executes. Nothing outside a
workflow can read them.

The app's secrets are read at **request time**, inside a serverless function on
Vercel:

```ts
// src/lib/supabase/server.ts — runs on every checkout request
requireEnv("SUPABASE_SERVICE_ROLE_KEY");
```

That code executes minutes or months after any workflow finished, on a
different machine. There is nothing for GitHub to inject into.

It does not help to build in GitHub Actions and deploy the output either: a
Next.js build deliberately does **not** bake non-`NEXT_PUBLIC_` values into the
bundle — if it did, `SUPABASE_SERVICE_ROLE_KEY` would ship to every visitor's
browser. Only `NEXT_PUBLIC_*` values are inlined at build time, and those are
public by definition.

So the split is not a preference:

| Secret                      | Read when              | Lives in                                                        |
| --------------------------- | ---------------------- | --------------------------------------------------------------- |
| `SUPABASE_SERVICE_ROLE_KEY` | every checkout         | **Vercel**                                                      |
| the PawaPay token           | every payment/callback | **Supabase Vault** (ADR 0018), or Vercel, or AWS SSM (ADR 0017) |
| `BADGE_CODE_SECRET`         | every fulfilment       | **Vercel**                                                      |
| `CRON_SECRET`               | every cron call        | **Vercel** _and_ Vault as `cron-secret` (ADR 0028)              |
| `RESEND_API_KEY`            | every receipt          | **Vercel**                                                      |
| `SUPABASE_ACCESS_TOKEN`     | in a workflow          | **GitHub**                                                      |
| `SUPABASE_DB_PASSWORD`      | in a workflow          | **GitHub**                                                      |

Both are "secrets not in the repo, applied automatically" — which is the
actual goal. They are just two different mechanisms for two different runtimes.

---

## Vercel — runtime secrets

Once, per environment (Production / Preview / Development):

```bash
vercel link                       # once, in devfest-yaounde-web/
vercel env add SUPABASE_SERVICE_ROLE_KEY production
vercel env add PAWAPAY_TOKEN_VAULT_KEY production   # "pawapay-token" — see below
vercel env add BADGE_CODE_SECRET production
vercel env add CRON_SECRET production
vercel env add APP_BASE_URL production
# …and the NEXT_PUBLIC_ ones, which are not secret but still need setting
```

Or paste them in the dashboard under **Settings → Environment Variables**.

`vercel env pull .env.local` brings them down for local development, which
keeps one source of truth instead of two drifting copies.

### The PawaPay token, from Supabase Vault (recommended)

Vercel holds only the secret's **name**. The value lives encrypted in the
database, read through a function granted to `service_role` alone — using the
Supabase key the app already has, so no new credential is involved.

Store it once, in the Supabase SQL editor:

```sql
select vault.create_secret('<the token>', 'pawapay-token', 'PawaPay production API token');
```

Then in Vercel:

```bash
vercel env add PAWAPAY_TOKEN_VAULT_KEY production   # pawapay-token
```

Rotating it is one statement and needs no redeploy — the five-minute cache
picks it up:

```sql
select vault.update_secret(
  (select id from vault.secrets where name = 'pawapay-token'),
  '<the new token>'
);
```

Why here rather than AWS: Supabase is already required for every payment, so
reading the token from it adds no failure mode checkout did not already have.
SSM would add a second cloud to the money path.

### Alternative: the same token from AWS SSM

**Not the default — Vault above is.** Choose this only to share one
credential with the SCD shop Lambda, which reads the same SSM parameter. It
puts AWS on the payment path, which Vault does not (ADR 0018).

Vercel holds only the parameter's **name**, plus the ARN of a role it may
assume.

That role must trust Vercel's OIDC provider. **Do not create an AWS access
key for this**: storing one in Vercel would add a secret in order to avoid
storing another, and an AWS key reaches further than a payment token.

```bash
# 1. the parameter (once, shared with the SCD shop)
aws ssm put-parameter --name /scd/prod/pawapay-token   --type SecureString --value "<token>" --overwrite

# 2. in Vercel
vercel env add PAWAPAY_TOKEN_PARAM production   # /scd/prod/pawapay-token
vercel env add AWS_ROLE_ARN production          # the role's ARN
vercel env add AWS_REGION production            # us-east-1
```

The IAM role needs `ssm:GetParameter` on that one parameter — and `kms:Decrypt`
on the key if the SecureString uses a customer-managed one. Setting
`PAWAPAY_API_TOKEN` instead bypasses all of this and remains fully supported.

Three that need care:

- **`APP_BASE_URL`** must be the real HTTPS origin in production. It builds the
  URL PawaPay sends people back to; `localhost` there means nobody returns.
- **`BADGE_CODE_SECRET`** must be identical across every environment that
  issues real tickets, and must never change. Every badge code is derived from
  it, so rotating it invalidates every ticket already sold.
- **`SUPABASE_SERVICE_ROLE_KEY`** bypasses all access control. Never prefix it
  `NEXT_PUBLIC_`. Set it for Production and Preview only if preview deploys are
  private — a public preview with a service-role key is a public database.

---

## GitHub — workflow secrets

Under **Settings → Secrets and variables → Actions**:

| Secret                  | Where to get it                                        |
| ----------------------- | ------------------------------------------------------ |
| `SUPABASE_ACCESS_TOKEN` | Supabase dashboard → Account → Access Tokens           |
| `SUPABASE_DB_PASSWORD`  | The database password set when the project was created |

Used only by `.github/workflows/migrations.yml`, which applies pending
migrations when `supabase/migrations/**` changes on `main` and then fails if
`database.types.ts` is out of step with the live schema.

`.github/workflows/ci.yml` uses **no secrets at all**. Everything it tests is
pure logic, so a pull request from a fork runs exactly as safely as a branch.

### ⚠ Actions cannot currently start on this repository

Every workflow run so far ends as `startup_failure` with no logs — including a
nine-line hello-world workflow pushed deliberately to test it. That rules out
the workflow files: **GitHub Actions itself cannot start a run on this private
repo.**

The usual cause is a billing or spending-limit condition on the free plan for
private repositories. Check **Settings → Billing → Actions** on the account,
or make the repository public — public repos have unlimited Actions minutes.

Until that is resolved, run the checks locally before pushing:

```bash
npm run verify   # lint + typecheck + tests
npm run build
```

and apply migrations by hand:

```bash
supabase db push --linked --yes
```

Both workflow files are correct and will run as soon as Actions is available.

---

## If you really want GitHub as the single source of truth

It is possible, and it is a real pattern: a workflow that reads the secrets and
pushes them into Vercel through the Vercel API on every change.

It is not what this repo does, because it adds a moving part between "the
secret changed" and "the app has it", and when that job fails quietly you get a
production outage whose cause is in a different system. The two-store split
above has no such gap.

If the team wants it anyway, that is a decision record, not a config tweak.

---

## Pre-launch checklist

- [ ] `PAWAPAY_ENV=production` **and** a production PawaPay token. A sandbox
      token against the production URL fails as `AUTHENTICATION_ERROR`.
- [ ] `APP_BASE_URL` / `NEXT_PUBLIC_APP_BASE_URL` set to the real domain.
- [ ] `CRON_SECRET` set on Vercel, **and** the same value stored in Vault as
      `cron-secret`, with `app-base-url` set to the public origin. Apply
      migration `0010_cleanup_sweep_cron.sql`. The five-minute sweep is
      Supabase `pg_cron` (ADR 0028); Vercel Cron is a daily Hobby backstop.
      Confirm: `select * from cron.job where jobname = 'devfest-cleanup-sweep';`
- [ ] _Optional:_ PawaPay **Checkouts** callback pointed at
      `https://YOUR-DOMAIN/api/payments/pawapay/callback`. Only an
      optimisation — it makes settlement instant instead of within five
      minutes. Nothing breaks without it.
- [ ] Supabase → Authentication → URL Configuration: **Site URL** set, and
      `https://YOUR-DOMAIN/auth/callback` in the redirect allow-list. Google
      sign-in fails silently without this.

- [ ] `BADGE_CODE_SECRET` set, backed up, and never to be changed.
- [ ] **Ticket tiers and shop products replaced with real content.** What is in
      `src/data/ticket-tiers.json` and `products.json` today is placeholder —
      invented names, invented prices, invented perks.
- [ ] Callback hardening left in monitor mode until the logs show real
      callbacks passing, then enforced (`docs/guides/payments-runbook.md`).
