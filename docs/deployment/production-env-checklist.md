# Production Environment Checklist

This checklist summarises the minimum configuration required before promoting a Vercel (or Render) deployment to production. Run it alongside `npm run validate:env` to guarantee the build fails fast when a secret or base URL is missing.

## Required environment variables

| Variable | Expected production value |
| --- | --- |
| `DATABASE_URL` | Managed Postgres connection string (e.g. Supabase `postgresql://` URI). Must not point at `localhost` or other development hosts. |
| `BETTER_AUTH_SECRET` / `AUTH_SECRET` | 32+ character secret (recommended 64-byte) used by Better Auth. Never reuse sandbox secrets. |
| `APP_ORIGIN` | Comma-separated HTTPS origins for the public site. Each entry should use the canonical production domain (no `localhost` or `http://`). |
| `BETTER_AUTH_URL` | HTTPS base URL Better Auth uses in email links. When omitted it falls back to the first `APP_ORIGIN` entry; configure explicitly when multiple origins exist. |
| `RESEND_API_KEY` | Production API key copied from the Resend dashboard (prefix `re_`). |
| `RESEND_FROM_EMAIL` | Verified sender identity, e.g. `German Verb Master <no-reply@germanverbmaster.com>`. |
| `ENABLE_ADMIN_FEATURES` | Leave unset or `false` so admin-only routes remain disabled in production. |
| `ADMIN_API_TOKEN` | Only required when admin features are enabled. Use a random 16+ character string shared with scheduled jobs hitting `/api/admin/*` endpoints. |

Preview deployments can include additional origins (for example, `https://<branch>.vercel.app`) but must keep production domains in the list. Remove any placeholder values such as `example.com` or `changeme` before shipping.

## Validation workflow

1. In Vercel, open **Settings → Environment Variables** and confirm the values above are present for `Production`, `Preview`, and `Development` environments as appropriate.
2. Run `npm run validate:env` locally with `FORCE_ENV_VALIDATION=1` to confirm the script passes using the production `.env` snapshot:
   ```bash
   FORCE_ENV_VALIDATION=1 npm run validate:env
   ```
3. Because `npm run build` invokes the validation script automatically, Vercel builds will abort if any required variable is missing or misconfigured. Fix the reported error and redeploy.
4. Record completion of this checklist in the release issue before promoting the deployment.

Following this checklist ensures database access, authentication, transactional email, and admin automation stay functional in production.

## Health and readiness probes

- `GET /healthz` returns `200 OK` when the API process is running and ready to receive traffic. No authentication is required.
- `GET /readyz` verifies database connectivity via `SELECT 1` before returning `200 OK`. If Postgres is unreachable the endpoint fails with a `503` so deployment platforms can block promotion automatically.
