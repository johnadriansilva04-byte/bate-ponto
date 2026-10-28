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


-- ============================================================================
-- PARTE 2: trilha forense (GPS, carimbo do servidor, lacre SHA-256, auditoria)
-- ============================================================================

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


-- ----------------------------------------------------------------------------
-- Identificacao do profissional (uma linha, uma instalacao). Sem login.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  installation_id uuid PRIMARY KEY DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  nome text,
  documento text,
  valor_hora_padrao numeric(12,2),
  fuso_horario text NOT NULL DEFAULT 'America/Sao_Paulo',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);


INSERT INTO public.profiles (installation_id)
VALUES ('00000000-0000-0000-0000-000000000001'::uuid)
ON CONFLICT (installation_id) DO NOTHING;


-- ----------------------------------------------------------------------------
-- Campos de evidencia na sessao de trabalho.
-- ----------------------------------------------------------------------------
ALTER TABLE public.work_sessions ADD COLUMN IF NOT EXISTS start_latitude double precision;

ALTER TABLE public.work_sessions ADD COLUMN IF NOT EXISTS start_longitude double precision;

ALTER TABLE public.work_sessions ADD COLUMN IF NOT EXISTS end_latitude double precision;

ALTER TABLE public.work_sessions ADD COLUMN IF NOT EXISTS end_longitude double precision;

-- Como o GPS se comportou em cada ponta: 'ok', 'negado', 'indisponivel', 'expirado'.
ALTER TABLE public.work_sessions ADD COLUMN IF NOT EXISTS start_geo_status text;

ALTER TABLE public.work_sessions ADD COLUMN IF NOT EXISTS end_geo_status text;

-- Carimbo do SERVIDOR no momento em que recebeu o toque. O started_at/ended_at
-- vem do aparelho (e o que o trabalhador viu no relogio); estas duas colunas
-- provam quando o servidor recebeu, e as duas pontas entram no lacre.
ALTER TABLE public.work_sessions ADD COLUMN IF NOT EXISTS recorded_started_at timestamptz;

ALTER TABLE public.work_sessions ADD COLUMN IF NOT EXISTS recorded_ended_at timestamptz;

ALTER TABLE public.work_sessions ADD COLUMN IF NOT EXISTS session_hash text;

ALTER TABLE public.work_sessions ADD COLUMN IF NOT EXISTS prev_hash text;

ALTER TABLE public.work_sessions ADD COLUMN IF NOT EXISTS sealed_at timestamptz;


UPDATE public.work_sessions SET recorded_started_at = created_at WHERE recorded_started_at IS NULL;


ALTER TABLE public.work_sessions ALTER COLUMN recorded_started_at SET DEFAULT now();


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


-- Ordem alfabetica dos nomes define a ordem de disparo: guarda -> selo -> auditoria.
DROP TRIGGER IF EXISTS ws_01_guard ON public.work_sessions;

CREATE TRIGGER ws_01_guard BEFORE UPDATE ON public.work_sessions
  FOR EACH ROW EXECUTE FUNCTION public.ws_guard_sealed();

DROP TRIGGER IF EXISTS ws_02_seal ON public.work_sessions;

CREATE TRIGGER ws_02_seal BEFORE INSERT OR UPDATE ON public.work_sessions
  FOR EACH ROW EXECUTE FUNCTION public.ws_seal();

DROP TRIGGER IF EXISTS ws_03_audit ON public.work_sessions;

CREATE TRIGGER ws_03_audit AFTER UPDATE ON public.work_sessions
  FOR EACH ROW EXECUTE FUNCTION public.ws_audit();


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


-- ----------------------------------------------------------------------------
-- Fechamento mensal: valor da hora congelado no momento do fechamento.
-- ----------------------------------------------------------------------------
ALTER TABLE public.monthly_rates ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'aberto';

ALTER TABLE public.monthly_rates ADD COLUMN IF NOT EXISTS valor_total_fechamento numeric(14,2);

ALTER TABLE public.monthly_rates ADD COLUMN IF NOT EXISTS closed_at timestamptz;

ALTER TABLE public.monthly_rates ADD COLUMN IF NOT EXISTS reopened_at timestamptz;


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


-- ----------------------------------------------------------------------------
-- Acesso: somente o servidor. Nada para anon/authenticated.
-- ----------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.session_audit ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.profiles FROM anon, authenticated;

REVOKE ALL ON public.session_audit FROM anon, authenticated;

REVOKE ALL ON public.monthly_closures FROM anon, authenticated;

GRANT ALL ON public.profiles TO service_role;

GRANT ALL ON public.session_audit TO service_role;

GRANT ALL ON public.monthly_closures TO service_role;

GRANT USAGE, SELECT ON SEQUENCE public.session_audit_id_seq TO service_role;


DROP TRIGGER IF EXISTS pf_touch ON public.profiles;

CREATE TRIGGER pf_touch BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============================================================================
-- 0004: senha de confirmacao do titular (6 digitos) verificada NO SERVIDOR.
--
-- Nao e login: o aplicativo continua sem contas, sem e-mail e sem perfis. A
-- senha e um travao de confirmacao, exigido a cada INICIAR e a cada FINALIZAR.
--
-- Por que no banco: se a conferencia ficasse so no navegador, bastaria abrir o
-- console para registrar ponto sem a senha. Aqui a senha e conferida por uma
-- funcao SECURITY DEFINER, com bcrypt (salgado) e bloqueio apos 5 erros.
--
-- O texto puro da senha nao aparece em lugar nenhum: so o hash bcrypt.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;


-- ----------------------------------------------------------------------------
-- Configuracao da instalacao. Uma linha so, sem login.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.app_config (
  installation_id uuid PRIMARY KEY DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  pin_hash text NOT NULL,
  tentativas_erradas integer NOT NULL DEFAULT 0,
  bloqueado_ate timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);


-- O hash de '160817'. Trocavel depois por um UPDATE nesta tabela, sem tocar no
-- codigo do aplicativo.
INSERT INTO public.app_config (installation_id, pin_hash)
VALUES (
  '00000000-0000-0000-0000-000000000001'::uuid,
  '$2a$11$F.tVMic8YnxTPFMmF6Fwm.HeThuId0XhFMmroS4uuwXeD/4QwBzyW'
)
ON CONFLICT (installation_id) DO NOTHING;


-- ----------------------------------------------------------------------------
-- Conferencia da senha. Devolve sempre um objeto, nunca excecao, para a tela
-- poder explicar o motivo ao usuario:
--   { ok, motivo, restantes }
--   motivo: 'ok' | 'senha_incorreta' | 'bloqueado' | 'formato_invalido'
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pin_verify(p_pin text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions AS $$
DECLARE
  v_row public.app_config%ROWTYPE;
  v_ok boolean;
  v_restantes integer;
  v_limite constant integer := 5;
  v_espera constant interval := interval '5 minutes';
BEGIN
  -- A senha tem exatamente 6 digitos.
  IF p_pin IS NULL OR p_pin !~ '^[0-9]{6}$' THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'formato_invalido', 'restantes', v_limite);
  END IF;

  SELECT * INTO v_row FROM public.app_config
   WHERE installation_id = '00000000-0000-0000-0000-000000000001'::uuid
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'formato_invalido', 'restantes', v_limite);
  END IF;

  -- Enquanto o bloqueio estiver valendo, nem confere a senha.
  IF v_row.bloqueado_ate IS NOT NULL AND v_row.bloqueado_ate > now() THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'bloqueado', 'restantes', 0);
  END IF;

  v_ok := extensions.crypt(p_pin, v_row.pin_hash) = v_row.pin_hash;

  IF v_ok THEN
    UPDATE public.app_config
       SET tentativas_erradas = 0, bloqueado_ate = NULL, updated_at = now()
     WHERE installation_id = v_row.installation_id;
    RETURN jsonb_build_object('ok', true, 'motivo', 'ok', 'restantes', v_limite);
  END IF;

  -- Errou: conta a tentativa e bloqueia por 5 minutos na quinta.
  v_restantes := GREATEST(0, v_limite - (v_row.tentativas_erradas + 1));
  IF v_row.tentativas_erradas + 1 >= v_limite THEN
    UPDATE public.app_config
       SET tentativas_erradas = 0, bloqueado_ate = now() + v_espera, updated_at = now()
     WHERE installation_id = v_row.installation_id;
    RETURN jsonb_build_object('ok', false, 'motivo', 'bloqueado', 'restantes', 0);
  END IF;

  UPDATE public.app_config
     SET tentativas_erradas = v_row.tentativas_erradas + 1, updated_at = now()
   WHERE installation_id = v_row.installation_id;

  RETURN jsonb_build_object('ok', false, 'motivo', 'senha_incorreta', 'restantes', v_restantes);
END $$;


-- ----------------------------------------------------------------------------
-- Acesso: somente o servidor. Nenhuma leitura ou escrita para anon/authenticated.
-- ----------------------------------------------------------------------------
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.app_config FROM anon, authenticated;

GRANT ALL ON public.app_config TO service_role;

-- Nem anon nem authenticated podem chamar pin_verify: a conferencia passa pelo
-- servidor do aplicativo, nunca direto do navegador.
REVOKE ALL ON FUNCTION public.pin_verify(text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.pin_verify(text) TO service_role;
