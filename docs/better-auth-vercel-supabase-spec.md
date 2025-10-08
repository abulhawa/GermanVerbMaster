# Better Auth Integration Spec (Vercel + Supabase + Drizzle)

## 1. Summary
Integrate [Better Auth](https://www.better-auth.com/) into the existing Vercel-hosted German Verb Master stack to consolidate authentication (email/password + verification, Google, Microsoft, optional magic links) while keeping Supabase as the source of truth for user data and Drizzle as the ORM. The solution must function within the free tier limits of all vendors and avoid introducing bespoke servers or paid services. The integration must surface a session-aware `/api/me` endpoint, enforce role-based authorization (standard vs. admin), and preserve Supabase row level security (RLS).

## 2. Goals
- Replace ad-hoc Supabase auth logic with Better Auth while maintaining Supabase as the database.
- Support authentication strategies: email/password with verification, Google OAuth, Microsoft OAuth, optional magic links.
- Expose secure REST endpoints (`/api/auth/*`, `/api/me`) that operate in the Vercel Node runtime.
- Ensure the SPA (React) can access session status via Better Auth React helpers.
- Enforce admin/standard role separation for sensitive operations, backed by Supabase RLS policies.
- Provide a migration and rollout plan that fits the current Drizzle workflow and Vercel deployment pipeline.

## 3. Non-goals
- Building a custom UI for admin role assignment (manual SQL only for now).
- Replacing Supabase with another database or changing hosting providers.
- Supporting additional OAuth providers beyond Google and Microsoft in this phase.
- Creating paid Better Auth or Vercel plans.

## 4. Success Metrics
- ✅ 100% of sign-in/sign-up flows (email/password, Google, Microsoft, magic link) verified in staging.
- ✅ `/api/me` responds with session info (<250 ms p95) for authenticated requests and `401` otherwise.
- ✅ RLS policies prevent cross-user access in Supabase audit logs during QA.
- ✅ Admin-only endpoints return `403` for standard users and `200` for seeded admins.
- ✅ No regression in existing API latency budgets after integration (<10% increase p95).

## 5. Architecture Overview
```
Client (React SPA)
  ↕ fetch / Better Auth React SDK
Vercel Node Functions (api/auth/*, api/me, other API routes)
  ↕ Better Auth server instance (Node)
Drizzle ORM (Supabase Postgres)
  ↕ Better Auth Drizzle Adapter + existing schema/migrations
Supabase (RLS enabled)
```
- All auth-related routes live under `/api/auth/*` using Better Auth handlers.
- `/api/me` uses Better Auth session helpers to return session metadata and the user role.
- Existing API routes use shared middleware that validates Better Auth sessions and enforces roles before business logic executes.
- Supabase continues to enforce data-level policies via RLS; application code only reads/writes with user context from Better Auth.

## 6. Environment & Configuration
Set the following environment variables in Vercel and local `.env` (never commit values):
- `BETTER_AUTH_SECRET`: 64-byte random string (rotate quarterly).
- `BETTER_AUTH_URL`: Base URL (`https://<production-domain>` / `http://localhost:3000` in dev).
- `DATABASE_URL`: Existing Supabase Postgres connection URL.
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.
- `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET`.
- Optional: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` if using custom SMTP; otherwise rely on Better Auth email provider defaults.

OAuth redirect URIs (production + local):
- Google: `https://<domain>/api/auth/callback/google`, `http://localhost:3000/api/auth/callback/google`
- Microsoft: `https://<domain>/api/auth/callback/microsoft`, `http://localhost:3000/api/auth/callback/microsoft`

## 7. Data Model & Migrations
1. Run `npx better-auth generate --adapter drizzle` to scaffold Better Auth schema files.
2. Integrate generated schema into `db/schema` (e.g., `db/schema/auth.ts`). Align naming with repository conventions.
3. Extend the existing `users` table with a `role` column (`'standard' | 'admin'`, default `'standard'`) **or** create a `user_roles` table if separation is preferred. Column approach recommended for simplicity.
4. Update Drizzle migration scripts:
   - Add Better Auth tables (accounts, sessions, verification tokens, magic link tokens, keys).
   - Add role column with default.
   - Seed one admin user (optional) or document manual SQL update.
5. Execute `npm run db:generate` to capture migrations, then `npm run db:migrate` locally against staging Supabase.
6. Update Supabase RLS policies:
   - Allow Better Auth tables the access recommended by Better Auth docs.
   - Confirm application tables (`user_settings`, `verb_progress`, etc.) restrict access to `auth.uid()`.

## 8. Server Integration Plan
1. **Dependencies**
   ```bash
   npm install better-auth better-auth-cli better-auth-adapter-drizzle @better-auth/react
   ```
   Ensure `drizzle-orm`, `pg`, and `@vercel/node` remain compatible.
2. **Better Auth Initialization**
   - Create `server/auth/betterAuth.ts` exporting a configured Better Auth instance.
   - Configure strategies: email+password (with verification), Google, Microsoft, magic link (optional plugin).
   - Set secure cookie options (`httpOnly`, `secure`, `sameSite: 'lax'`, domain configuration for prod).
3. **Route Mounting**
   - For Express-style server: `app.use('/api/auth', betterAuthHandler)` before other middleware.
   - For Vercel API routes: create `api/auth/[...betterauth].ts` to delegate to Better Auth handler.
4. **Session Utilities**
   - Expose helper `requireSession` to fetch session (`auth.getSession(req, res)`) and throw `401` if absent.
   - Expose helper `requireAdmin` building on `requireSession` to enforce `session.user.role === 'admin'`.
5. **`/api/me` Endpoint**
   - New route returning `{ userId, email, role, expiresAt }` when session exists; `401` otherwise.
6. **Email Verification & Magic Link**
   - Configure email sender (SMTP or Better Auth provider) for verification and magic link emails.
   - Ensure URLs include `/api/auth/callback/*` and front-end redirect parameters.
7. **Logging & Monitoring**
   - Emit structured logs for auth events (sign-in success/failure, verification) to aid debugging on Vercel.

## 9. Client Integration Plan (React SPA)
1. Configure Better Auth React client (`@better-auth/react`) in `client/auth/authClient.ts` pointing to `/api/auth`.
2. Build shared hooks:
   - `useSession()` that wraps Better Auth's session hook, returning loading/error states.
   - `useRequireAdmin()` for admin-only pages (redirects or shows error if not admin).
3. Update auth UI:
   - Email/password sign-up with verification state messaging.
   - Sign-in form with password + magic link options.
   - Social buttons invoking `authClient.signIn.social('google')` and `'microsoft'`.
   - Display verification pending banner with resend option (`authClient.verification.resend()`).
4. On app bootstrap, fetch `/api/me` to hydrate global user state (e.g., Zustand/Context) and set role.
5. Update navigation to show admin entry points conditionally when role is `admin`.
6. Implement `authClient.signOut()` for logout and clear client caches.
7. Handle error states per design guidelines (`docs/ui-ux-guidelines.md`).

## 10. Testing & QA Strategy
- **Unit Tests**: Add server-side tests for session utilities and `/api/me` response using Vitest with mocked Better Auth sessions.
- **Integration Tests**: Use Playwright to cover sign-in/sign-up flows (email/password, Google, Microsoft via mocked providers if feasible, magic link by intercepting email).
- **Manual QA Checklist**:
  1. New user signs up via email → receives verification → can sign in.
  2. Existing user signs in with Google and Microsoft (ensure account linking).
  3. Magic link flow sends email and logs in user upon visiting link.
  4. `/api/me` returns expected payload; `401` when signed out.
  5. Admin-only route denies non-admin, allows admin after manual role update.
  6. Supabase RLS prevents access to another user's data (verify via SQL or API attempt).
- **Performance**: Confirm no Vercel cold start regressions; monitor invocation logs post-deploy.

## 11. Security & Compliance
- HTTPS enforced for all environments (Vercel default); use secure cookies in production.
- Enable CSRF protection (Better Auth includes anti-CSRF tokens; ensure client sends them).
- Rate-limit `/api/auth/*` routes via existing middleware or Vercel Edge middleware.
- Store secrets only in Vercel environment variables and local `.env` (gitignored).
- Document admin promotion SQL:
  ```sql
  update users set role = 'admin' where email = 'admin@example.com';
  ```
- Monitor Supabase and Better Auth logs for anomalies; set alerting where available.

## 12. Rollout & Backout Plan
1. Implement feature branch with migrations and auth integration.
2. Run migrations against staging Supabase and deploy to Vercel preview.
3. QA all flows using checklist (Section 10) and capture evidence (screenshots/logs).
4. Update `README.md` with new env vars and setup instructions.
5. After approval, deploy to production and run migrations.
6. Monitor auth error rate, Supabase logs, and Vercel logs for one week.
7. **Backout**: Revert Vercel deployment and migrations (if needed, run Drizzle down migration) and disable Better Auth env variables. Re-enable existing auth logic temporarily if rollback required.

## 13. Documentation & Handoff
- Update onboarding docs describing local auth setup, CLI usage (`"better-auth": "better-auth"` script), and testing steps.
- Provide runbook covering admin promotion, OAuth troubleshooting, rotating `BETTER_AUTH_SECRET`, and handling locked accounts.
- Ensure future enhancements (additional providers, audit logging) are tracked in ROADMAP.

## 14. Open Questions / Follow-ups
- Confirm whether existing users need migration into Better Auth tables (import script may be required).
- Decide on email delivery provider (Better Auth default vs. custom SMTP) and rate limits.
- Evaluate need for audit logging of admin actions in Supabase or external monitoring.
