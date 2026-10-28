-- ============================================================================
-- 0002: trilha de auditoria (GPS, carimbo do servidor, lacre SHA-256, cadeia
-- de custodia) e fechamento mensal.
--
-- MODELO: instalacao unica. Nao existe login neste aplicativo, entao nao ha
-- "usuario" para isolar por RLS: os registros pertencem a um installation_id
-- fixo e as tabelas so sao alcancaveis pelo servidor (service_role). As
-- politicas de RLS ficam ativas e sem nenhuma regra para anon/authenticated,
-- o que equivale a "ninguem de fora le ou escreve".
-- ============================================================================

-- Necessario para digest() (SHA-256).
CREATE EXTENSION IF NOT EXISTS pgcrypto;
--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- Identificacao do profissional (uma linha, uma instalacao). Sem login.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  installation_id uuid PRIMARY KEY DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  nome text,
  cpf text,
  valor_hora_padrao numeric(12,2),
  fuso_horario text NOT NULL DEFAULT 'America/Sao_Paulo',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

-- O cadastro usa 'cpf'. Se a tabela veio de uma versao anterior com 'documento',
-- renomeia para o nome usado no lacre.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='profiles' AND column_name='documento') THEN
    ALTER TABLE public.profiles RENAME COLUMN documento TO cpf;
  END IF;
END $$;
--> statement-breakpoint

INSERT INTO public.profiles (installation_id)
VALUES ('00000000-0000-0000-0000-000000000001'::uuid)
ON CONFLICT (installation_id) DO NOTHING;
--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- Campos de evidencia na sessao de trabalho.
-- ----------------------------------------------------------------------------
ALTER TABLE public.work_sessions ADD COLUMN IF NOT EXISTS start_latitude double precision;
--> statement-breakpoint
ALTER TABLE public.work_sessions ADD COLUMN IF NOT EXISTS start_longitude double precision;
--> statement-breakpoint
ALTER TABLE public.work_sessions ADD COLUMN IF NOT EXISTS end_latitude double precision;
--> statement-breakpoint
ALTER TABLE public.work_sessions ADD COLUMN IF NOT EXISTS end_longitude double precision;
--> statement-breakpoint
-- Como o GPS se comportou em cada ponta: 'ok', 'negado', 'indisponivel', 'expirado'.
ALTER TABLE public.work_sessions ADD COLUMN IF NOT EXISTS start_geo_status text;
--> statement-breakpoint
ALTER TABLE public.work_sessions ADD COLUMN IF NOT EXISTS end_geo_status text;
--> statement-breakpoint
-- Carimbo do SERVIDOR no momento em que recebeu o toque. O started_at/ended_at
-- vem do aparelho (e o que o trabalhador viu no relogio); estas duas colunas
-- provam quando o servidor recebeu, e as duas pontas entram no lacre.
ALTER TABLE public.work_sessions ADD COLUMN IF NOT EXISTS recorded_started_at timestamptz;
--> statement-breakpoint
ALTER TABLE public.work_sessions ADD COLUMN IF NOT EXISTS recorded_ended_at timestamptz;
--> statement-breakpoint
ALTER TABLE public.work_sessions ADD COLUMN IF NOT EXISTS session_hash text;
--> statement-breakpoint
ALTER TABLE public.work_sessions ADD COLUMN IF NOT EXISTS prev_hash text;
--> statement-breakpoint
ALTER TABLE public.work_sessions ADD COLUMN IF NOT EXISTS sealed_at timestamptz;
--> statement-breakpoint

UPDATE public.work_sessions SET recorded_started_at = created_at WHERE recorded_started_at IS NULL;
--> statement-breakpoint

ALTER TABLE public.work_sessions ALTER COLUMN recorded_started_at SET DEFAULT now();
--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- Uma unica implementacao do conteudo lacrado, usada tanto para selar quanto
-- para conferir. Se as duas divergissem, a conferencia perderia o sentido.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ws_seal_payload(
  p_installation uuid,
  p_id uuid,
  p_started timestamptz,
  p_ended timestamptz,
  p_duration bigint,
  p_slat double precision,
  p_slng double precision,
  p_elat double precision,
  p_elng double precision,
  p_prev text
) RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT concat_ws('|',
    COALESCE(p_installation::text, ''),
    COALESCE(p_id::text, ''),
    COALESCE(to_char(p_started AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'), ''),
    COALESCE(to_char(p_ended AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'), ''),
    COALESCE(p_duration::text, ''),
    COALESCE(p_slat::text, ''), COALESCE(p_slng::text, ''),
    COALESCE(p_elat::text, ''), COALESCE(p_elng::text, ''),
    COALESCE(p_prev, 'GENESIS'));
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.ws_hash(
  p_installation uuid, p_id uuid, p_started timestamptz, p_ended timestamptz,
  p_slat double precision, p_slng double precision, p_elat double precision, p_elng double precision,
  p_prev text
) RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT encode(extensions.digest(public.ws_seal_payload(
    p_installation, p_id, p_started, p_ended,
    FLOOR(EXTRACT(EPOCH FROM (p_ended - p_started)))::bigint,
    p_slat, p_slng, p_elat, p_elng, p_prev), 'sha256'), 'hex');
$$;
--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- Selo: ao fechar a sessao, o proprio banco calcula o SHA-256 e encadeia com o
-- registro anterior. O cliente nunca escreve o hash: ele e sempre recalculado
-- aqui, entao nao ha como forjar pelo aplicativo.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ws_seal() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_prev text;
  v_allow text := COALESCE(current_setting('app.allow_correction', true), 'off');
BEGIN
  IF NEW.ended_at IS NULL THEN
    NEW.session_hash := NULL;
    NEW.prev_hash := NULL;
    NEW.sealed_at := NULL;
    NEW.recorded_ended_at := NULL;
    RETURN NEW;
  END IF;

  -- Ja lacrado e sem correcao autorizada: nao mexe.
  IF OLD.sealed_at IS NOT NULL AND v_allow <> 'on' THEN
    RETURN NEW;
  END IF;

  SELECT w.session_hash INTO v_prev
    FROM public.work_sessions w
   WHERE w.installation_id = NEW.installation_id
     AND w.ended_at IS NOT NULL
     AND w.id <> NEW.id
     AND w.started_at <= NEW.started_at
   ORDER BY w.started_at DESC, w.id DESC
   LIMIT 1;

  NEW.recorded_ended_at := COALESCE(NEW.recorded_ended_at, now());
  NEW.prev_hash := v_prev;
  NEW.session_hash := public.ws_hash(
    NEW.installation_id, NEW.id, NEW.started_at, NEW.ended_at,
    NEW.start_latitude, NEW.start_longitude, NEW.end_latitude, NEW.end_longitude, v_prev);
  NEW.sealed_at := now();
  RETURN NEW;
END $$;
--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- Guarda: um registro lacrado nao pode ser alterado por UPDATE comum. So a
-- funcao de correcao abaixo consegue, e ela deixa rastro na auditoria.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ws_guard_sealed() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.sealed_at IS NOT NULL
     AND COALESCE(current_setting('app.allow_correction', true), 'off') <> 'on'
     AND (NEW.started_at IS DISTINCT FROM OLD.started_at
       OR NEW.ended_at IS DISTINCT FROM OLD.ended_at
       OR NEW.start_latitude IS DISTINCT FROM OLD.start_latitude
       OR NEW.start_longitude IS DISTINCT FROM OLD.start_longitude
       OR NEW.end_latitude IS DISTINCT FROM OLD.end_latitude
       OR NEW.end_longitude IS DISTINCT FROM OLD.end_longitude
       OR NEW.session_hash IS DISTINCT FROM OLD.session_hash) THEN
    RAISE EXCEPTION 'Registro lacrado. Use correct_session_end() para corrigir.';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- Cadeia de custodia: toda correcao de um registro lacrado vira uma linha de
-- auditoria com o hash anterior, o novo, o motivo e o instante.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.session_audit (
  id bigserial PRIMARY KEY,
  installation_id uuid NOT NULL,
  session_id uuid NOT NULL,
  action text NOT NULL,
  reason text,
  old_hash text,
  new_hash text,
  old_ended_at timestamptz,
  new_ended_at timestamptz,
  changed_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.ws_audit() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  -- So registra correcao de registro JA lacrado. O selo inicial nao entra.
  IF OLD.sealed_at IS NOT NULL
     AND (NEW.session_hash IS DISTINCT FROM OLD.session_hash
       OR NEW.ended_at IS DISTINCT FROM OLD.ended_at
       OR NEW.started_at IS DISTINCT FROM OLD.started_at) THEN
    INSERT INTO public.session_audit (
      installation_id, session_id, action, reason,
      old_hash, new_hash, old_ended_at, new_ended_at)
    VALUES (
      OLD.installation_id, OLD.id, 'correcao',
      NULLIF(current_setting('app.correction_reason', true), ''),
      OLD.session_hash, NEW.session_hash, OLD.ended_at, NEW.ended_at);
  END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint

-- Ordem alfabetica dos nomes define a ordem de disparo: guarda -> selo -> auditoria.
DROP TRIGGER IF EXISTS ws_01_guard ON public.work_sessions;
--> statement-breakpoint
CREATE TRIGGER ws_01_guard BEFORE UPDATE ON public.work_sessions
  FOR EACH ROW EXECUTE FUNCTION public.ws_guard_sealed();
--> statement-breakpoint
DROP TRIGGER IF EXISTS ws_02_seal ON public.work_sessions;
--> statement-breakpoint
CREATE TRIGGER ws_02_seal BEFORE INSERT OR UPDATE ON public.work_sessions
  FOR EACH ROW EXECUTE FUNCTION public.ws_seal();
--> statement-breakpoint
DROP TRIGGER IF EXISTS ws_03_audit ON public.work_sessions;
--> statement-breakpoint
CREATE TRIGGER ws_03_audit AFTER UPDATE ON public.work_sessions
  FOR EACH ROW EXECUTE FUNCTION public.ws_audit();
--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- Correcao autorizada. Exige motivo, libera a guarda dentro desta transacao e
-- invalida o selo antigo para o banco recalcular (a auditoria guarda os dois).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.correct_session_end(
  p_session_id uuid,
  p_new_end timestamptz,
  p_reason text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_reason IS NULL OR length(btrim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'Informe o motivo da correcao.';
  END IF;

  PERFORM set_config('app.allow_correction', 'on', true);
  PERFORM set_config('app.correction_reason', btrim(p_reason), true);

  UPDATE public.work_sessions
     SET ended_at = p_new_end,
         session_hash = NULL,
         prev_hash = NULL,
         sealed_at = NULL
   WHERE id = p_session_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sessao nao encontrada.';
  END IF;

  PERFORM set_config('app.allow_correction', 'off', true);
END $$;
--> statement-breakpoint

-- Confere se o lacre de um registro continua batendo com o conteudo atual.
CREATE OR REPLACE FUNCTION public.session_hash_valid(p_id uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT w.session_hash = public.ws_hash(
        w.installation_id, w.id, w.started_at, w.ended_at,
        w.start_latitude, w.start_longitude, w.end_latitude, w.end_longitude, w.prev_hash)
       FROM public.work_sessions w WHERE w.id = p_id),
    false);
$$;
--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- Fechamento mensal: valor da hora congelado no momento do fechamento.
-- ----------------------------------------------------------------------------
ALTER TABLE public.monthly_rates ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'aberto';
--> statement-breakpoint
ALTER TABLE public.monthly_rates ADD COLUMN IF NOT EXISTS valor_total_fechamento numeric(14,2);
--> statement-breakpoint
ALTER TABLE public.monthly_rates ADD COLUMN IF NOT EXISTS closed_at timestamptz;
--> statement-breakpoint
ALTER TABLE public.monthly_rates ADD COLUMN IF NOT EXISTS reopened_at timestamptz;
--> statement-breakpoint

-- Nome pedido na especificacao, apontando para a tabela que ja existe: assim
-- nao ha dois lugares guardando o mesmo fechamento.
CREATE OR REPLACE VIEW public.monthly_closures AS
SELECT
  installation_id,
  year AS ano,
  month AS mes,
  status,
  hourly_rate AS valor_hora_fechamento,
  total_seconds AS total_segundos_fechamento,
  COALESCE(
    valor_total_fechamento,
    CASE WHEN hourly_rate IS NULL THEN NULL
         ELSE round((total_seconds::numeric / 3600) * hourly_rate, 2) END
  ) AS valor_total_fechamento,
  days_worked AS dias_trabalhados,
  session_count AS total_sessoes,
  closed_at,
  reopened_at,
  updated_at
FROM public.monthly_rates;
--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- Acesso: somente o servidor. Nada para anon/authenticated.
-- ----------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.session_audit ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON public.profiles FROM anon, authenticated;
--> statement-breakpoint
REVOKE ALL ON public.session_audit FROM anon, authenticated;
--> statement-breakpoint
REVOKE ALL ON public.monthly_closures FROM anon, authenticated;
--> statement-breakpoint
GRANT ALL ON public.profiles TO service_role;
--> statement-breakpoint
GRANT ALL ON public.session_audit TO service_role;
--> statement-breakpoint
GRANT ALL ON public.monthly_closures TO service_role;
--> statement-breakpoint
GRANT USAGE, SELECT ON SEQUENCE public.session_audit_id_seq TO service_role;
--> statement-breakpoint

DROP TRIGGER IF EXISTS pf_touch ON public.profiles;
--> statement-breakpoint
CREATE TRIGGER pf_touch BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
