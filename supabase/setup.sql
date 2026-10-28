-- ============================================================================
-- Meu Ponto - estrutura do banco (uso individual, sem login)
--
-- ONDE USAR: painel do Supabase -> SQL Editor -> cole tudo -> Run.
--
-- Este arquivo e uma COPIA pronta para colar a mao. A fonte oficial das
-- migracoes continua sendo drizzle/migrations/ (0000 + 0001).
-- O script pode rodar em banco novo ou em banco que ja tem as tabelas.
-- ============================================================================

-- Funcao que atualiza sozinha a coluna updated_at.
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- ----------------------------------------------------------------------------
-- 1) Sessoes de trabalho (entradas e saidas)
--    Instalacao unica: installation_id e fixo, nao existe login.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.work_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  installation_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ended_after_started CHECK (ended_at IS NULL OR ended_at >= started_at)
);

-- Se o banco veio do modelo antigo (com login), renomeia a coluna.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public'
               AND table_name = 'work_sessions'
               AND column_name = 'user_id') THEN
    ALTER TABLE public.work_sessions RENAME COLUMN user_id TO installation_id;
  END IF;
END $$;

ALTER TABLE public.work_sessions
  ALTER COLUMN installation_id SET DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;

-- Registros antigos passam a pertencer a esta instalacao unica.
-- As datas e horas de entrada/saida NAO sao alteradas.
UPDATE public.work_sessions
  SET installation_id = '00000000-0000-0000-0000-000000000001'::uuid
  WHERE installation_id IS DISTINCT FROM '00000000-0000-0000-0000-000000000001'::uuid;

-- Duracao de cada sessao, calculada pelo proprio banco.
ALTER TABLE public.work_sessions ADD COLUMN IF NOT EXISTS duration_seconds integer GENERATED ALWAYS AS (
  CASE WHEN ended_at IS NULL THEN NULL
       ELSE GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (ended_at - started_at))))::integer
  END
) STORED;

-- Regras antigas de multiusuario: removidas.
DROP POLICY IF EXISTS "own select" ON public.work_sessions;
DROP POLICY IF EXISTS "own insert" ON public.work_sessions;
DROP POLICY IF EXISTS "own update" ON public.work_sessions;
DROP POLICY IF EXISTS "own delete" ON public.work_sessions;
DROP INDEX IF EXISTS public.one_open_session_per_user;
DROP INDEX IF EXISTS public.no_dup_start;
DROP INDEX IF EXISTS public.work_sessions_user_started;

-- Só uma sessao aberta por vez; sem entrada duplicada.
CREATE UNIQUE INDEX IF NOT EXISTS one_open_session
  ON public.work_sessions(installation_id) WHERE ended_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS no_dup_start
  ON public.work_sessions(installation_id, started_at);
CREATE INDEX IF NOT EXISTS work_sessions_started
  ON public.work_sessions(installation_id, started_at);

-- Ninguem da internet le ou altera: só o servidor (service_role).
ALTER TABLE public.work_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.work_sessions FROM anon;
REVOKE ALL ON public.work_sessions FROM authenticated;
GRANT ALL ON public.work_sessions TO service_role;

DROP TRIGGER IF EXISTS ws_touch ON public.work_sessions;
CREATE TRIGGER ws_touch BEFORE UPDATE ON public.work_sessions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ----------------------------------------------------------------------------
-- 2) Fechamentos mensais (valor da hora + totais, preservados por mes)
--    Guardar o valor aqui impede que uma mudanca futura altere meses passados.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.monthly_rates (
  installation_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  year integer NOT NULL,
  month integer NOT NULL,
  hourly_rate numeric(12,2),
  total_seconds integer NOT NULL DEFAULT 0,
  days_worked integer NOT NULL DEFAULT 0,
  session_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT monthly_rates_month_range CHECK (month BETWEEN 1 AND 12),
  CONSTRAINT monthly_rates_pkey PRIMARY KEY (installation_id, year, month)
);

ALTER TABLE public.monthly_rates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.monthly_rates FROM anon;
REVOKE ALL ON public.monthly_rates FROM authenticated;
GRANT ALL ON public.monthly_rates TO service_role;

DROP TRIGGER IF EXISTS mr_touch ON public.monthly_rates;
CREATE TRIGGER mr_touch BEFORE UPDATE ON public.monthly_rates
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ----------------------------------------------------------------------------
-- 3) Tabela antiga de configuracao por usuario: nao e mais usada.
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS public.user_settings;
