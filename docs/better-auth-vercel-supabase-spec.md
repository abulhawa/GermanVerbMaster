# Better Auth Integration Spec (Vercel + Supabase + Drizzle)

## Objective
Deploy Better Auth on the existing Vercel-hosted Node runtime without introducing any paid services, custom servers, or proprietary dependencies. Authentication must support email/password with verification, Google OAuth, Microsoft OAuth, and optional magic-link sign-in. The integration should expose a session-aware `/api/me` endpoint, enforce role-based access (standard vs. admin), and preserve Supabase row-level security (RLS) for application data.

## Constraints & Assumptions
- Use the Vercel Node runtime (no Edge functions).
- Rely exclusively on free Better Auth features, existing Supabase Postgres database, Drizzle ORM, and existing npm dependencies.
- No additional hosting (containers, workers, or background servers) beyond current Vercel functions.
- Maintain the existing Express/Vercel server structure; add authentication middleware without disrupting downstream handlers.
- Continue to use current Supabase-managed Postgres with Drizzle migrations.
- Support SPA client (React) with Better Auth React helpers.

## Dependencies & Tooling
1. **Runtime**: Vercel Node runtime (`"runtime": "nodejs"` in function config if needed).
2. **Packages** (add via `npm install`):
   - `better-auth`
   - `better-auth-cli`
   - `better-auth-adapter-drizzle`
   - Ensure `drizzle-orm`, `pg`, and `@vercel/node` stay at compatible versions.
3. **Development scripts**:
   - Add `"better-auth": "better-auth"` to `package.json` scripts for convenience (runs CLI).
   - Document CLI usage in `README` once integration lands.

## Environment Configuration
Set the following environment variables in Vercel and local `.env` (never commit secrets):
- `BETTER_AUTH_SECRET`: Long, random 64-byte string.
- `BETTER_AUTH_URL`: Production base URL (e.g., `https://app.example.com`).
- `DATABASE_URL`: Supabase Postgres connection string (already used by Drizzle).
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.
- `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET`.
- Optional dev overrides: `BETTER_AUTH_URL=http://localhost:3000` for local preview.

### OAuth Provider Setup
- **Google Cloud Console**: Create OAuth 2.0 Web client. Add authorized redirect URIs:
  - `https://app.example.com/api/auth/callback/google`
  - Local dev: `http://localhost:3000/api/auth/callback/google`
- **Microsoft Entra ID**: Register application, enable implicit/hybrid flow if required. Redirect URIs:
  - `https://app.example.com/api/auth/callback/microsoft`
  - `http://localhost:3000/api/auth/callback/microsoft`
- Restrict scopes to minimum (`openid`, `email`, `profile`).
- Store credentials in Vercel project settings and local `.env`.

## Database & Migrations
1. Run `npx better-auth generate --adapter drizzle` to scaffold Better Auth tables for Postgres/Drizzle. Output typically includes Drizzle schema definitions under a `better-auth` folder.
2. Merge generated schema into existing Drizzle schema directory (align with repository conventions). If necessary, relocate files under `db/schema/auth.ts` while keeping Better Auth types intact.
3. Extend user model with a `role` column or join table:
   - Option A (column): `role` enum (`'standard' | 'admin'`) default `'standard'`.
   - Option B (relational): Create `user_roles` table with `user_id`, `role`, timestamps.
   - Document manual admin promotion (e.g., update via SQL). No automated admin UI yet.
4. Generate Drizzle migration file (`npm run db:generate` or existing script) to include:
   - Better Auth tables (sessions, accounts, verification tokens, magic links as needed).
   - `role` column or `user_roles` table with default data.
5. Apply migration to Supabase manually with `npm run db:migrate` (developers will execute outside this spec as requested).
6. Update Supabase RLS policies:
   - Ensure Better Auth tables are unrestricted or admin-only as required by library docs.
   - For app tables (`user_settings`, `verb_progress`), confirm policies restrict access to rows where `user_id = auth.uid()`.

## Server Integration
1. **Better Auth Initialization**
   - Create `server/auth/betterAuth.ts` (or similar) exporting configured Better Auth instance using Drizzle adapter and environment vars.
   - Enable strategies: email-password with verification, Google, Microsoft, and magic link plugin.
   - Configure cookie options: secure, httpOnly, sameSite `lax`, `domain` set for production.
2. **Route Mounting**
   - If using Express: `app.use('/api/auth', betterAuthHandler)` before other middleware.
   - For Vercel API routes: create `api/auth/[...betterauth].ts` (or `route.ts`) forwarding requests to Better Auth handler.
   - Preserve existing middleware order; ensure logging/error handlers run after auth to avoid interference.
3. **Session Endpoint**
   - Add `/api/me` route that reads session via Better Auth server helper (e.g., `auth.getSession(req, res)`).
   - Response includes `userId`, `email`, `role`, and token expiry. Return `401` if no session.
4. **Admin Enforcement**
   - Wrap admin API handlers with middleware that checks `session.user.role === 'admin'`; otherwise `403`.
   - Document manual admin bootstrap (SQL update).
5. **Email Verification Flow**
   - Configure Better Auth email provider (use built-in email adapter or existing SMTP). Ensure verification emails include correct callback URL.
6. **Magic Link (Optional)**
   - Enable plugin via Better Auth configuration. Ensure email template references `/api/auth/magic-link` callback.

## Client Integration (React SPA)
1. Install `@better-auth/react` (if not bundled) and initialize with base URL (`/api/auth`).
2. Create `authClient.ts` exporting configured Better Auth client.
3. Components:
   - Signup/sign-in form using `authClient.signUp.email()` and `authClient.signIn.email()`.
   - Social buttons calling `authClient.signIn.social('google')` and `'microsoft'`.
   - Magic link form using `authClient.signIn.magicLink()` (if enabled).
4. Session handling:
   - Implement `useSession` hook from Better Auth or custom wrapper around `authClient.session.useSession()`.
   - On app initialization, fetch `/api/me` to hydrate global store (e.g., Zustand/Context).
   - Conditionally render “Admin Settings” nav items when `role === 'admin'`.
5. Logout: call `authClient.signOut()` and clear local caches.
6. Error and loading states: follow design-system guidelines; surface verification pending states and resend flow.

## Authorization & RLS
1. Store `role` server-side only; never trust client role for privileged operations.
2. For admin-only server routes, verify `session.user.role` before executing logic.
3. Ensure Supabase RLS policies enforce `user_id = auth.uid()` on sensitive tables (`user_settings`, `verb_progress`).
4. Provide documentation for adding new admin:
   ```sql
   update users set role = 'admin' where email = 'admin@example.com';
   ```
5. Audit logging (optional future work): consider logging successful/failed admin actions.

## Security & UX Checklist
- Serve over HTTPS; configure secure, httpOnly cookies in production.
- Configure CORS to allow SPA origin(s) and send credentials.
- Rate-limit `/api/auth/*` endpoints (Vercel middleware or upstream service).
- Implement CSRF protection for state-changing endpoints if using cookie-based sessions (Better Auth includes anti-CSRF tokens; ensure client sends them).
- Verify OAuth redirect URIs exactly match provider settings for dev/staging/prod.
- Provide account export/delete endpoints aligning with GDPR expectations (use Supabase functions or REST endpoints leveraging Better Auth session).
- Monitor Supabase and Better Auth logs for anomalies; set up alerts if available.

## Acceptance Criteria
- Email/password signup triggers verification email; post-verification, user can sign in.
- Google OAuth sign-in creates new user or links to existing email.
- Microsoft OAuth flow succeeds with same linkage expectations.
- `/api/me` returns session payload with default `role = 'standard'`.
- Admin-only endpoint returns `403` for standard users and `200` for admins.
- Magic link email reaches inbox and authenticates user when link is opened.
- RLS policies prevent users from accessing other users' `user_settings` and `verb_progress` records.

## Rollout Plan
1. Implement on a feature branch; run Drizzle migrations locally against staging Supabase.
2. Deploy to Vercel preview; verify OAuth redirect URIs for preview domain.
3. QA flows per Acceptance Criteria; capture screenshots and logs.
4. Promote migration to production Supabase and redeploy main branch.
5. Monitor login success/error rates and Supabase metrics for the first week post-launch.

## Documentation & Handoff
- Update `README.md` with environment variables and auth setup notes.
- Add runbook entry describing admin promotion, troubleshooting OAuth errors, and rotating `BETTER_AUTH_SECRET`.
- Record onboarding checklist for new developers (local env setup, CLI usage, testing flows).
