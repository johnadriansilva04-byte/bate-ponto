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
