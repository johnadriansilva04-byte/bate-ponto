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
- Changing the workplace never rewrites history, and this is what makes the seal meaningful: `ws_seal()` **copies** `nome — endereco` into `work_sessions.workplace_label` when the session closes, and that text is part of the SHA-256 payload. So an old timesheet keeps the address where the work actually happened, and its hash does not move when the workplace changes. `COALESCE(OLD.workplace_label, …)` in `ws_seal()` is what freezes it — dropping that COALESCE would silently re-stamp every old row's label on the next update and break the chain. Editing a sealed row is refused by `ws_guard_sealed()`; the only way through is `correct_session_end()`, which nulls the label so the seal is recomputed.
- The offline outbox (`src/lib/outbox.ts`) keeps the tap instant and the GPS reading of each punch, so a queued event syncs with the time the user saw, never the sync time.
- After touching the schema, re-run `npx tsc --noEmit && npx vitest run && npm run build`; the typecheck is the gate that catches stale Supabase types.

## Prova de integridade (marco datado) — migration 0008

O lacre por sessão tem um limite conhecido: quem tem a chave do banco pode reescrever os dados **e** recalcular a corrente inteira, e o lacre interno passa a dizer "tudo certo". Isso foi verificado empiricamente — um teste alterou uma sessão de 1h para 9h, recalculou a cadeia, e `session_hash_valid` respondeu `true`. O lacre sozinho não prova nada contra quem controla o banco.

A migration 0008 fecha essa lacuna em duas camadas:

1. `public.schema_fingerprint()` — SHA-256 determinístico de **toda** a estrutura do schema `public`: colunas, funções (com `md5(pg_get_functiondef())`, ou seja, o **corpo**, não só a assinatura), views, triggers, índices e policies. Antes do hash, comentários (`--…`) e espaços em branco são normalizados com `regexp_replace`. Essa normalização é obrigatória: sem ela, reexecutar `supabase/setup.sql` (que precisa ser idempotente) mudava a impressão só por diferença de formatação entre o arquivo e a migração. Foi um bug real, encontrado ao rodar o `setup.sql` duas vezes.
2. `public.integrity_anchors` — tabela **somente-inserção** (trigger `anchor_guard()` recusa UPDATE e DELETE) que grava a impressão esperada, o topo da corrente e a data. Marcos nunca se editam: registra-se um novo.

O que isso prova: a estrutura do banco não mudou desde a data declarada. Testado e detectado — troca de corpo de função, `DROP TRIGGER`, coluna nova e policy nova. O que **não** prova: que alguém com a chave não reescreveu tudo e criou um marco novo. Nesse caso a prova é externa — o Supabase registra todo DDL com data e usuário (`log_statement = 'ddl'`), e esse log é mantido pela plataforma, fora do banco.

Detalhe operacional descoberto: `log_statement` não pode ser mudado no nível do banco (`permission denied`), mas **pode** no nível do role (`ALTER ROLE postgres SET log_statement = 'all'`). Com `all`, até DML puro (INSERT/UPDATE/DELETE) entra no log — confirmado com um marcador `CANARIO_LOG_ALL` que apareceu no log em segundos. Hoje está em `ddl` (padrão do Supabase). O log tem retenção de ~24h, então serve para auditoria recente, não histórica. Backups automáticos exigem plano Enterprise (a API devolve 402), por isso `backups: []`.

A declaração legível fica em `src/lib/integridade.ts` (`MARCOS`), a comparação pura em `src/lib/conferencia.ts` (testada), e a tela em `src/components/ProvaIntegridade.tsx` (aba HISTÓRICO, junto com a ficha impressa). Para declarar uma mudança de estrutura: calcule `select public.schema_fingerprint()`, insira um marco novo em `integrity_anchors` e acrescente o objeto correspondente a `MARCOS`.

## Finalidade do registro (prova para a Justiça) — migration 0009

Este aplicativo não é um controle de ponto qualquer: o registro existe para **instruir um pedido de reconhecimento judicial de tempo trabalhado**. Leia `src/lib/finalidade.ts` antes de mexer no que envolve prova, lacre ou ficha.

O titular trabalha sem vínculo formal e sem comprovante de jornada porque um erro no registro civil trocou seu nome — `JOAO DE JESUS DO ROSARIO` (nome de fato, pelo qual trabalha e assina) consta como `JOAO DE DEUS DO ROSARIO` (nome no registro, em correção). Enquanto a correção tramita, os documentos não conferem com o nome pelo qual ele trabalha e recebe. O que existe para provar o tempo: os PIX (mostram pagamento, não jornada) e este aplicativo (mostra jornada, com hora e lugar). **Não remova essa declaração, e não a trate como texto decorativo** — ela é a razão do sistema existir.

A migration 0009 grava a finalidade no banco (`public.declaracao_finalidade`, somente-inserção pelo trigger `finalidade_guard()`, lida por `finalidade_atual()`), leva o texto para a ficha impressa (`src/components/FichaPonto.tsx`, seção *Finalidade deste documento*) e para a tela (`src/components/ProvaIntegridade.tsx`). O mesmo texto foi gravado no **log externo** do Supabase como comentário seguido de leitura (`REGISTRADA_NO_LOG_EM` em `finalidade.ts`), porque o log é mantido pela plataforma, fora do banco — é a prova que o aplicativo não alcança nem apaga.

Regras ao mexer nisso:

- A declaração é **honesta por desenho**: ela lista o que a prova sustenta **e o que não sustenta** (não prova que ele estava trabalhando no instante do toque; não é imune a quem tem a chave do banco; não substitui prova documental). Não reescreva isso para parecer mais forte. Registro que promete mais do que entrega vale menos em juízo.
- Não edite uma declaração nem um marco: ambos são somente-inserção. Registre uma nova linha datada.
- Ao declarar mudança de estrutura, acrescente o marco em `src/lib/integridade.ts` **e** a linha em `integrity_anchors`. Hoje há 3 marcos; o atual é o nº 3 (`6293e0a2…`, criado pela 0009).

Limites medidos (não suponha, foi medido em 28/10/2026):

- O log do Supabase no plano atual **retém ~24h**. A API de logs para de retornar linhas acima de ~24h de janela; o projeto é novo, então todo o histórico cabia nessa janela. O log serve para auditoria **recente**, não como arquivo histórico. Para valor probatório de longo prazo, exporte a ficha em PDF e mantenha backup do banco.
- Escritas do app via PostgREST (protocolo estendido) **não** aparecem no log do Postgres com a configuração padrão — só a requisição HTTP (`POST | 201 | /rest/v1/…`). Para registrar o SQL da escrita (sem os valores dos parâmetros, que o log não imprime), é preciso `ALTER ROLE … SET log_min_duration_statement = 0`. Aplicado em `service_role`, `authenticator`, `anon` e `postgres`. Mesmo assim o log **não** guarda os valores gravados — apenas a forma da consulta. Não prometa a ninguém que o log prova *o que* foi gravado.
