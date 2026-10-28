-- ============================================================================
-- 0008: prova de integridade — a "impressao digital" do banco.
--
-- PROBLEMA. O lacre por sessao (0002/0003/0006) encadeia os registros, mas quem
-- tem a chave do banco pode reescrever o passado E recalcular a corrente. Nesse
-- caso o lacre interno diz "tudo certo" e nao ha como provar a fraude olhando
-- so as tabelas. Foi verificado empiricamente nesta data.
--
-- SOLUCAO EM DUAS CAMADAS.
--   1. schema_fingerprint(): um SHA-256 deterministico de TODA a estrutura do
--      schema public (colunas, funcoes, triggers, indices, policies). Qualquer
--      ALTER TABLE, DROP TRIGGER ou funcao trocada muda esse valor.
--   2. integrity_anchors: uma tabela SOMENTE-INSERCAO que guarda o valor
--      esperado junto com o topo da corrente de lacres e a data da declaracao.
--
-- O que isso prova, e o que nao prova (honestidade importa):
--   PROVA que a estrutura do banco nao mudou desde o marco declarado, e que a
--   corrente de lacres daquele dia continua batendo.
--   NAO impede que alguem com a chave reescreva tudo e crie um marco novo. O
--   que ele NAO consegue e apagar o rastro: os logs do Supabase registram todo
--   DDL executado, com hora e usuario. Comparar o marco com esses logs e a
--   prova externa. Ver src/lib/marco-zero.ts.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Impressao digital deterministica da estrutura. Ordenada por texto, entao nao
-- depende de OID nem da ordem fisica: o mesmo schema gera sempre o mesmo valor.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.schema_fingerprint()
RETURNS text LANGUAGE sql STABLE SET search_path = public, pg_catalog AS $$
  SELECT encode(extensions.digest(string_agg(linha, E'\n' ORDER BY linha), 'sha256'), 'hex')
  FROM (
    SELECT 'TABLE ' || table_name || '.' || column_name || ':' || data_type || ':' ||
           is_nullable || ':' || COALESCE(column_default, '-') AS linha
      FROM information_schema.columns
     WHERE table_schema = 'public'
    -- O corpo importa: trocar o conteudo de ws_hash sem mexer na assinatura
    -- mudaria os lacres e passaria batido se so os argumentos entrassem aqui.
    -- Espacos e comentarios sao normalizados ANTES do hash, senao reexecutar o
    -- setup.sql (que deve ser idempotente) mudaria a impressao so por formatacao.
    UNION ALL
    SELECT 'FUNC ' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')->' ||
           COALESCE(pg_get_function_result(p.oid), '-') || ':' ||
           md5(regexp_replace(regexp_replace(pg_get_functiondef(p.oid), '--[^\n]*', '', 'g'), '\s+', ' ', 'g'))
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
    UNION ALL
    SELECT 'VIEW ' || c.relname || ':' ||
           md5(regexp_replace(regexp_replace(pg_get_viewdef(c.oid), '--[^\n]*', '', 'g'), '\s+', ' ', 'g'))
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'v'
    UNION ALL
    SELECT 'TRIG ' || c.relname || '.' || t.tgname || ':' || pr.proname
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_proc pr ON pr.oid = t.tgfoid
     WHERE n.nspname = 'public' AND NOT t.tgisinternal
    UNION ALL
    SELECT 'INDEX ' || indexname || ':' || indexdef
      FROM pg_indexes
     WHERE schemaname = 'public'
    UNION ALL
    SELECT 'POLICY ' || tablename || '.' || policyname || ':' || cmd
      FROM pg_policies
     WHERE schemaname = 'public'
  ) x;
$$;
--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- Marcos de integridade. Cada linha e uma declaracao datada:
-- "nesta data, o schema tinha esta impressao digital e a corrente terminava
--  neste lacre". Nunca se altera um marco: registra-se um novo.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.integrity_anchors (
  id bigserial PRIMARY KEY,
  installation_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  impressao_esquema text NOT NULL,
  topo_corrente text,
  sessoes integer NOT NULL DEFAULT 0,
  nota text,
  criado_em timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

ALTER TABLE public.integrity_anchors ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON public.integrity_anchors FROM anon, authenticated;
--> statement-breakpoint
GRANT ALL ON public.integrity_anchors TO service_role;
--> statement-breakpoint
GRANT USAGE, SELECT ON SEQUENCE public.integrity_anchors_id_seq TO service_role;
--> statement-breakpoint

-- Somente-insercao: nem o proprio aplicativo consegue editar ou apagar um
-- marco. Registra-se um novo em vez de mexer no antigo.
CREATE OR REPLACE FUNCTION public.anchor_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'Marco de integridade e somente-leitura. Registre um novo marco em vez de alterar.';
END $$;
--> statement-breakpoint

DROP TRIGGER IF EXISTS ia_guard ON public.integrity_anchors;
--> statement-breakpoint
CREATE TRIGGER ia_guard
  BEFORE UPDATE OR DELETE ON public.integrity_anchors
  FOR EACH ROW EXECUTE FUNCTION public.anchor_guard();
--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- Estado atual, num so lugar: a tela e a ficha usam esta funcao para conferir.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.integrity_state()
RETURNS TABLE (
  impressao_esquema text,
  topo_corrente text,
  sessoes integer,
  ultimo_marco_em timestamptz,
  ultimo_marco_impressao text
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    public.schema_fingerprint(),
    (SELECT w.session_hash FROM public.work_sessions w
      WHERE w.installation_id = '00000000-0000-0000-0000-000000000001'::uuid
        AND w.session_hash IS NOT NULL
      ORDER BY w.started_at DESC, w.id DESC LIMIT 1),
    (SELECT count(*)::integer FROM public.work_sessions w
      WHERE w.installation_id = '00000000-0000-0000-0000-000000000001'::uuid),
    (SELECT a.criado_em FROM public.integrity_anchors a ORDER BY a.criado_em DESC LIMIT 1),
    (SELECT a.impressao_esquema FROM public.integrity_anchors a ORDER BY a.criado_em DESC LIMIT 1);
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION public.schema_fingerprint() FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.schema_fingerprint() TO service_role;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.integrity_state() FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.integrity_state() TO service_role;
