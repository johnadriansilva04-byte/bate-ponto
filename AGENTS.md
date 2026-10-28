<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->
- Hours math lives in src/lib/hours.ts as pure functions (UTC in, America/Sao_Paulo display) so it stays unit-tested; UI only renders its output.
- Single-installation app: one person, one phone, no login. There is no `supabase.auth`, no `LoginScreen`, and no RLS for end users. Data lives in `work_sessions` / `monthly_rates`, keyed by a fixed `installation_id` (`00000000-0000-0000-0000-000000000001`) that defaults on insert.
- All database access goes through the service-role client (`client.server.ts`) from `src/lib/sessions.server.ts`, reached only via `src/lib/sessions.functions.ts` server functions. Never import server modules from route files — `*.functions.ts` ships to the client and must use `await import("./sessions.server")` inside handlers.
- `monthly_rates` snapshots `hourly_rate` + totals per `(installation_id, year, month)` so a later rate change never rewrites a past closing.
- Deployed on Vercel, not Lovable Cloud. `npx vite build` auto-detects the `vercel` nitro preset when `VERCEL=1`, so no `vercel.json` is needed. The server needs `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` set in Vercel env vars (never `VITE_`-prefixed, they must stay server-only).
- The schema is applied by hand: paste `supabase/setup.sql` into the Supabase SQL editor. It is idempotent and safe to re-run. `drizzle/migrations/` holds the same schema as the migration history.
- The 6-digit PIN is a confirmation lock, not a login: still no accounts, no email, no profiles, no session cookie. It is required on every INICIAR/FINALIZAR and verified **on the server** by `pin_verify()` in `drizzle/migrations/0004_pin_gate.sql` (bcrypt via `pgcrypto`, 5 wrong tries → 5-minute lockout). The hash lives in `app_config.pin_hash`; the plaintext exists nowhere in the repo. To change the PIN, `UPDATE public.app_config SET pin_hash = extensions.crypt('<new>', extensions.gen_salt('bf', 11))`. Never move this check to the browser — `src/lib/pin.ts` deliberately holds only types and user-facing messages, and `pin_verify` is REVOKEd from `anon`/`authenticated`.
- `pin_verify` is reached through `checkPin` in `sessions.functions.ts` → `verifyPin` in `sessions.server.ts`, using `supabaseAdmin.rpc`. If you add or change a DB function, regenerate `src/integrations/supabase/types.ts` (Supabase Management API `/types/typescript`), otherwise `rpc()` fails to typecheck.
- GPS never blocks a punch: a denied/unavailable fix is stored as `start_geo_status`/`end_geo_status` with null coordinates, so the record still saves.
- `PinPad` (the 6-digit keypad) mirrors its digits in a `useRef` and guards re-entry with `busyRef`. Reading `pin` state directly loses digits when the user taps fast, because each tap would read the pre-render value; keep the ref in sync via `setDigits` when touching this component.
- A new phone is allowed in through `DeviceGate`, which calls `authorizeThisDevice(pin)` → `device_authorize()`. The first device self-registers with an empty PIN (so the owner is never locked out); every later device needs the same 6-digit PIN, and the device row is what makes the lock effective.
- The out-of-place warning is decided by `decidirAviso` in `src/lib/geo.ts` (pure, unit-tested) and only fires with proof: a good GPS fix **and** a saved workplace coordinate. A missing fix never becomes an accusation. The warning is non-blocking — the punch is always recorded. `supabase/setup.sql` is the paste-able copy of every migration; when adding one, append it there too, and keep it re-runnable (it is validated by executing the whole file inside `BEGIN; … ROLLBACK;`).
- The offline outbox (`src/lib/outbox.ts`) keeps the tap instant and the GPS reading of each punch, so a queued event syncs with the time the user saw, never the sync time.
- After touching the schema, re-run `npx tsc --noEmit && npx vitest run && npm run build`; the typecheck is the gate that catches stale Supabase types.
