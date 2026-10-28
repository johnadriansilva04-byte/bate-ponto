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

-- ============================================================================
-- 0005: aparelhos autorizados.
--
-- O aplicativo e de uma pessoa so, num celular so. Se alguem abrir o endereco
-- em OUTRO aparelho, esse aparelho precisa ser liberado com a mesma senha de 6
-- numeros usada para bater o ponto. Nao e login: nao ha conta, e-mail nem
-- perfil. E so uma lista de aparelhos em que o aplicativo pode funcionar.
--
-- Como funciona:
--   - o aparelho gera um codigo proprio (nao e dado pessoal) e guarda no
--     proprio navegador;
--   - o servidor guarda a lista desses codigos liberados;
--   - aparelho novo precisa da senha para entrar na lista.
--
-- Primeiro aparelho: entra sozinho, sem senha. Sem isso o titular ficaria
-- trancado fora na propria instalacao, quando a lista ainda esta vazia.
--
-- Esta trava e uma comodidade, nao um cofre: quem entende de computador pode
-- forjar o codigo do aparelho. A protecao de verdade continua sendo a senha
-- exigida a cada INICIAR e a cada FINALIZAR, conferida no servidor.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.trusted_devices (
  device_id text PRIMARY KEY,
  criado_em timestamptz NOT NULL DEFAULT now(),
  visto_em timestamptz NOT NULL DEFAULT now(),
  ativo boolean NOT NULL DEFAULT true
);


-- O codigo do aparelho tem entre 16 e 64 caracteres (letras, numeros e hifen).
ALTER TABLE public.trusted_devices
  DROP CONSTRAINT IF EXISTS trusted_devices_device_id_formato;

ALTER TABLE public.trusted_devices
  ADD CONSTRAINT trusted_devices_device_id_formato
  CHECK (device_id ~ '^[A-Za-z0-9-]{16,64}$');


-- ----------------------------------------------------------------------------
-- Consulta: este aparelho ja esta liberado? Quantos existem?
--   { conhecido, total, valido }
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.device_check(p_device text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions AS $$
DECLARE
  v_total integer;
  v_conhecido boolean;
BEGIN
  -- Codigo fora do formato: a tela pede a senha, em vez de liberar.
  IF p_device IS NULL OR p_device !~ '^[A-Za-z0-9-]{16,64}$' THEN
    RETURN jsonb_build_object('conhecido', false, 'total', 0, 'valido', false);
  END IF;

  SELECT count(*) INTO v_total FROM public.trusted_devices WHERE ativo;
  SELECT EXISTS (
    SELECT 1 FROM public.trusted_devices WHERE device_id = p_device AND ativo
  ) INTO v_conhecido;

  IF v_conhecido THEN
    UPDATE public.trusted_devices SET visto_em = now() WHERE device_id = p_device;
  END IF;

  RETURN jsonb_build_object('conhecido', v_conhecido, 'total', v_total, 'valido', true);
END $$;


-- ----------------------------------------------------------------------------
-- Liberacao: entra na lista. Aparelho novo exige a senha de 6 numeros; a
-- conferencia e a mesma funcao pin_verify, com bcrypt e bloqueio apos 5 erros.
--   { ok, motivo, restantes }
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.device_authorize(p_device text, p_pin text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions AS $$
DECLARE
  v_pin jsonb;
  v_total integer;
BEGIN
  IF p_device IS NULL OR p_device !~ '^[A-Za-z0-9-]{16,64}$' THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'formato_invalido', 'restantes', 0);
  END IF;

  SELECT count(*) INTO v_total FROM public.trusted_devices WHERE ativo;

  -- Primeiro aparelho: libera sem senha, senao nao haveria como comecar.
  IF v_total = 0 THEN
    INSERT INTO public.trusted_devices (device_id) VALUES (p_device)
      ON CONFLICT (device_id) DO UPDATE SET ativo = true, visto_em = now();
    RETURN jsonb_build_object('ok', true, 'motivo', 'ok', 'restantes', 5);
  END IF;

  v_pin := public.pin_verify(p_pin);
  IF (v_pin->>'ok')::boolean IS NOT TRUE THEN
    RETURN jsonb_build_object(
      'ok', false,
      'motivo', coalesce(v_pin->>'motivo', 'senha_incorreta'),
      'restantes', coalesce((v_pin->>'restantes')::integer, 0)
    );
  END IF;

  INSERT INTO public.trusted_devices (device_id) VALUES (p_device)
    ON CONFLICT (device_id) DO UPDATE SET ativo = true, visto_em = now();

  RETURN jsonb_build_object('ok', true, 'motivo', 'ok', 'restantes', 5);
END $$;


-- ----------------------------------------------------------------------------
-- Acesso: somente o servidor. Nenhuma leitura ou escrita para anon/authenticated.
-- ----------------------------------------------------------------------------
ALTER TABLE public.trusted_devices ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.trusted_devices FROM anon, authenticated;

GRANT ALL ON public.trusted_devices TO service_role;

REVOKE ALL ON FUNCTION public.device_check(text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.device_check(text) TO service_role;

REVOKE ALL ON FUNCTION public.device_authorize(text, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.device_authorize(text, text) TO service_role;

-- ============================================================================
-- 0006: local de trabalho (a empresa) gravado junto com o ponto.
--
-- O titular bate ponto sempre no mesmo lugar: AV MAURO RAMOS 765, CENTRO,
-- FLORIANOPOLIS. Esse endereco fica no cadastro da instalacao e e copiado para
-- cada sessao no momento em que ela e lacrada — junto com a hora e a
-- coordenada do toque.
--
-- Por que copiar em vez de apontar: se um dia o endereco mudar, as fichas
-- antigas continuam mostrando o lugar onde o trabalho realmente aconteceu, e
-- nao o lugar novo. O selo SHA-256 cobre esse texto, entao trocar o endereco
-- depois muda o selo — o que denuncia a alteracao em vez de escondê-la.
--
-- Toda troca de endereco entra em workplace_audit, com motivo, valor anterior,
-- valor novo, data e quem pediu. E o "log rastreavel" das empresas.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Cadastro do local de trabalho. Historico completo: trocar nao apaga o antigo,
-- apenas desativa.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workplaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  installation_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  nome text NOT NULL,
  endereco text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now(),
  encerrado_em timestamptz
);


-- So um local ativo por vez: e o lugar onde ele esta trabalhando agora.
CREATE UNIQUE INDEX IF NOT EXISTS one_active_workplace
  ON public.workplaces (installation_id) WHERE ativo;


-- O endereco inicial. ON CONFLICT DO NOTHING para nao sobrescrever se ja houver.
INSERT INTO public.workplaces (installation_id, nome, endereco)
VALUES (
  '00000000-0000-0000-0000-000000000001'::uuid,
  'Local de trabalho',
  'AV MAURO RAMOS 765, CENTRO, FLORIANÓPOLIS - SC'
)
ON CONFLICT DO NOTHING;


-- ----------------------------------------------------------------------------
-- Log rastreavel das trocas de local.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workplace_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workplace_id uuid,
  action text NOT NULL,
  motivo text,
  nome_anterior text,
  endereco_anterior text,
  nome_novo text,
  endereco_novo text,
  changed_at timestamptz NOT NULL DEFAULT now()
);


CREATE OR REPLACE FUNCTION public.workplace_log_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Desativar o local antigo (ativo = false) nao e uma troca de endereco: so
  -- registra quando o nome ou o endereco realmente mudam, ou em inclusao.
  IF TG_OP = 'UPDATE'
     AND NEW.nome IS NOT DISTINCT FROM OLD.nome
     AND NEW.endereco IS NOT DISTINCT FROM OLD.endereco THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.workplace_audit (
    workplace_id, action, motivo,
    nome_anterior, endereco_anterior, nome_novo, endereco_novo
  ) VALUES (
    COALESCE(NEW.id, OLD.id),
    TG_OP,
    current_setting('app.workplace_reason', true),
    -- Numa troca o local antigo e uma linha nova (a anterior fica desativada),
    -- entao o endereco anterior vem do contexto gravado por set_workplace().
    COALESCE(OLD.nome, current_setting('app.workplace_prev_name', true)),
    COALESCE(OLD.endereco, current_setting('app.workplace_prev_addr', true)),
    NEW.nome, NEW.endereco
  );
  RETURN COALESCE(NEW, OLD);
END $$;


DROP TRIGGER IF EXISTS wp_audit ON public.workplaces;

CREATE TRIGGER wp_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.workplaces
  FOR EACH ROW EXECUTE FUNCTION public.workplace_log_change();


-- ----------------------------------------------------------------------------
-- Troca de local. Exige motivo e deixa rastro; nunca apaga o anterior.
-- (As funcoes sao recriadas com a coordenada na secao 0007, logo abaixo. O DROP
--  aqui deixa este arquivo re-executavel em banco que ja passou pela 0007.)
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.set_workplace(text, text, text);

CREATE OR REPLACE FUNCTION public.set_workplace(
  p_nome text,
  p_endereco text,
  p_reason text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid;
  v_inst constant uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_old_nome text;
  v_old_addr text;
BEGIN
  IF p_endereco IS NULL OR length(btrim(p_endereco)) < 5 THEN
    RAISE EXCEPTION 'Informe o endereco do local de trabalho.';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'Informe o motivo da troca de local.';
  END IF;

  -- Guarda o local que sai, para o log conseguir mostrar de onde veio.
  SELECT w.nome, w.endereco INTO v_old_nome, v_old_addr
    FROM public.workplaces w
   WHERE w.installation_id = v_inst AND w.ativo
   LIMIT 1;

  PERFORM set_config('app.workplace_reason', btrim(p_reason), true);
  PERFORM set_config('app.workplace_prev_name', COALESCE(v_old_nome, ''), true);
  PERFORM set_config('app.workplace_prev_addr', COALESCE(v_old_addr, ''), true);

  UPDATE public.workplaces
     SET ativo = false, encerrado_em = now()
   WHERE installation_id = v_inst AND ativo;

  INSERT INTO public.workplaces (installation_id, nome, endereco)
  VALUES (v_inst, COALESCE(NULLIF(btrim(p_nome), ''), 'Local de trabalho'), btrim(p_endereco))
  RETURNING id INTO v_id;

  PERFORM set_config('app.workplace_reason', '', true);
  PERFORM set_config('app.workplace_prev_name', '', true);
  PERFORM set_config('app.workplace_prev_addr', '', true);
  RETURN v_id;
END $$;


-- ----------------------------------------------------------------------------
-- Local ativo agora.
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.workplace_current();

CREATE OR REPLACE FUNCTION public.workplace_current()
RETURNS TABLE (id uuid, nome text, endereco text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT w.id, w.nome, w.endereco
    FROM public.workplaces w
   WHERE w.installation_id = '00000000-0000-0000-0000-000000000001'::uuid
     AND w.ativo
   LIMIT 1;
$$;


-- ----------------------------------------------------------------------------
-- Sessao guarda o local copiado no lacre.
-- ----------------------------------------------------------------------------
ALTER TABLE public.work_sessions ADD COLUMN IF NOT EXISTS workplace_id uuid;

ALTER TABLE public.work_sessions ADD COLUMN IF NOT EXISTS workplace_label text;


-- ----------------------------------------------------------------------------
-- Selo passa a cobrir o local. As funcoes sao recriadas com o campo novo no
-- fim; nenhuma sessao lacrada existe ainda, entao nada e invalidado.
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
  p_cpf text,
  p_nome text,
  p_prev text,
  p_workplace text
) RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT concat_ws('|',
    COALESCE(p_installation::text, ''),
    COALESCE(p_id::text, ''),
    COALESCE(to_char(p_started AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'), ''),
    COALESCE(to_char(p_ended AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'), ''),
    COALESCE(p_duration::text, ''),
    COALESCE(p_slat::text, ''), COALESCE(p_slng::text, ''),
    COALESCE(p_elat::text, ''), COALESCE(p_elng::text, ''),
    COALESCE(p_cpf, ''), COALESCE(p_nome, ''),
    COALESCE(p_prev, 'GENESIS'),
    COALESCE(p_workplace, ''));
$$;


CREATE OR REPLACE FUNCTION public.ws_hash(
  p_installation uuid, p_id uuid, p_started timestamptz, p_ended timestamptz,
  p_slat double precision, p_slng double precision, p_elat double precision, p_elng double precision,
  p_cpf text, p_nome text, p_prev text, p_workplace text
) RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT encode(extensions.digest(public.ws_seal_payload(
    p_installation, p_id, p_started, p_ended,
    FLOOR(EXTRACT(EPOCH FROM (p_ended - p_started)))::bigint,
    p_slat, p_slng, p_elat, p_elng, p_cpf, p_nome, p_prev, p_workplace), 'sha256'), 'hex');
$$;


-- Selo: copia identidade e local do cadastro no momento de fechar a sessao.
CREATE OR REPLACE FUNCTION public.ws_seal() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_prev text;
  v_cpf text;
  v_nome text;
  v_wp text;
  v_wpid uuid;
  v_allow text := COALESCE(current_setting('app.allow_correction', true), 'off');
BEGIN
  IF NEW.ended_at IS NULL THEN
    NEW.session_hash := NULL;
    NEW.prev_hash := NULL;
    NEW.sealed_at := NULL;
    NEW.recorded_ended_at := NULL;
    -- O local entra ja na abertura, para a sessao em andamento mostrar onde
    -- esta sendo registrada. O selo so e calculado quando ela fecha.
    IF NEW.workplace_label IS NULL THEN
      SELECT w.id, w.nome || ' — ' || w.endereco INTO NEW.workplace_id, NEW.workplace_label
        FROM public.workplaces w
       WHERE w.installation_id = NEW.installation_id AND w.ativo
       LIMIT 1;
    END IF;
    RETURN NEW;
  END IF;

  -- Ja lacrado e sem correcao autorizada: nao mexe.
  IF OLD.sealed_at IS NOT NULL AND v_allow <> 'on' THEN
    RETURN NEW;
  END IF;

  SELECT p.cpf, p.nome INTO v_cpf, v_nome
    FROM public.profiles p
   WHERE p.installation_id = NEW.installation_id;

  -- Mantem a identidade original quando o registro ja tinha uma.
  NEW.titular_cpf := COALESCE(OLD.titular_cpf, v_cpf, NEW.titular_cpf);
  NEW.titular_nome := COALESCE(OLD.titular_nome, v_nome, NEW.titular_nome);

  -- O local fica congelado no registro: trocar o cadastro depois nao reescreve
  -- as fichas antigas, apenas muda o selo se alguem tentar mexer.
  SELECT w.id, w.nome || ' — ' || w.endereco INTO v_wpid, v_wp
    FROM public.workplaces w
   WHERE w.installation_id = NEW.installation_id AND w.ativo
   LIMIT 1;

  NEW.workplace_id := COALESCE(OLD.workplace_id, v_wpid, NEW.workplace_id);
  NEW.workplace_label := COALESCE(OLD.workplace_label, v_wp, NEW.workplace_label);

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
    NEW.start_latitude, NEW.start_longitude, NEW.end_latitude, NEW.end_longitude,
    NEW.titular_cpf, NEW.titular_nome, v_prev, NEW.workplace_label);
  NEW.sealed_at := now();
  RETURN NEW;
END $$;


-- A guarda tambem protege o local gravado.
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
       OR NEW.titular_cpf IS DISTINCT FROM OLD.titular_cpf
       OR NEW.titular_nome IS DISTINCT FROM OLD.titular_nome
       OR NEW.workplace_label IS DISTINCT FROM OLD.workplace_label
       OR NEW.session_hash IS DISTINCT FROM OLD.session_hash) THEN
    RAISE EXCEPTION 'Registro lacrado. Use correct_session_end() para corrigir.';
  END IF;
  RETURN NEW;
END $$;


-- A correcao limpa o local gravado para o selo ser recalculado.
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
         sealed_at = NULL,
         titular_cpf = NULL,
         titular_nome = NULL,
         workplace_label = NULL
   WHERE id = p_session_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sessao nao encontrada.';
  END IF;

  PERFORM set_config('app.allow_correction', 'off', true);
END $$;


-- Conferencia do lacre, com identidade e local.
CREATE OR REPLACE FUNCTION public.session_hash_valid(p_id uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT w.session_hash = public.ws_hash(
        w.installation_id, w.id, w.started_at, w.ended_at,
        w.start_latitude, w.start_longitude, w.end_latitude, w.end_longitude,
        w.titular_cpf, w.titular_nome, w.prev_hash, w.workplace_label)
       FROM public.work_sessions w WHERE w.id = p_id),
    false);
$$;


-- ----------------------------------------------------------------------------
-- Acesso: somente o servidor.
-- ----------------------------------------------------------------------------
ALTER TABLE public.workplaces ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.workplace_audit ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.workplaces FROM anon, authenticated;

REVOKE ALL ON public.workplace_audit FROM anon, authenticated;

GRANT ALL ON public.workplaces TO service_role;

GRANT ALL ON public.workplace_audit TO service_role;

-- ============================================================================
-- 0007: geocerca do local previsto (aplicar tambem em banco ja existente).
--
-- Guarda a coordenada e o raio do local no cadastro do local, para o aplicativo
-- avisar quando o ponto for batido longe dali. O aviso nao bloqueia o registro.
-- ============================================================================

ALTER TABLE public.workplaces ADD COLUMN IF NOT EXISTS latitude double precision;

ALTER TABLE public.workplaces ADD COLUMN IF NOT EXISTS longitude double precision;

ALTER TABLE public.workplaces ADD COLUMN IF NOT EXISTS raio_metros integer NOT NULL DEFAULT 300;

UPDATE public.workplaces
   SET latitude = -27.5958794,
       longitude = -48.5435940,
       raio_metros = 300
 WHERE ativo
   AND latitude IS NULL
   AND endereco ILIKE '%MAURO RAMOS%';

DROP FUNCTION IF EXISTS public.set_workplace(text, text, text);

CREATE OR REPLACE FUNCTION public.set_workplace(
  p_nome text,
  p_endereco text,
  p_reason text,
  p_lat double precision DEFAULT NULL,
  p_lng double precision DEFAULT NULL,
  p_raio integer DEFAULT 300
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid;
  v_inst constant uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_old_nome text;
  v_old_addr text;
  v_raio integer;
BEGIN
  IF p_endereco IS NULL OR length(btrim(p_endereco)) < 5 THEN
    RAISE EXCEPTION 'Informe o endereco do local de trabalho.';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'Informe o motivo da troca de local.';
  END IF;

  IF (p_lat IS NULL) <> (p_lng IS NULL) THEN
    RAISE EXCEPTION 'Informe latitude e longitude juntas.';
  END IF;
  IF p_lat IS NOT NULL AND (p_lat < -90 OR p_lat > 90 OR p_lng < -180 OR p_lng > 180) THEN
    RAISE EXCEPTION 'Coordenada fora da faixa valida.';
  END IF;

  v_raio := COALESCE(p_raio, 300);
  IF v_raio < 30 OR v_raio > 5000 THEN
    RAISE EXCEPTION 'O raio deve ficar entre 30 e 5000 metros.';
  END IF;

  SELECT w.nome, w.endereco INTO v_old_nome, v_old_addr
    FROM public.workplaces w
   WHERE w.installation_id = v_inst AND w.ativo
   LIMIT 1;

  PERFORM set_config('app.workplace_reason', btrim(p_reason), true);
  PERFORM set_config('app.workplace_prev_name', COALESCE(v_old_nome, ''), true);
  PERFORM set_config('app.workplace_prev_addr', COALESCE(v_old_addr, ''), true);

  UPDATE public.workplaces
     SET ativo = false, encerrado_em = now()
   WHERE installation_id = v_inst AND ativo;

  INSERT INTO public.workplaces (installation_id, nome, endereco, latitude, longitude, raio_metros)
  VALUES (
    v_inst,
    COALESCE(NULLIF(btrim(p_nome), ''), 'Local de trabalho'),
    btrim(p_endereco),
    p_lat,
    p_lng,
    v_raio
  )
  RETURNING id INTO v_id;

  PERFORM set_config('app.workplace_reason', '', true);
  PERFORM set_config('app.workplace_prev_name', '', true);
  PERFORM set_config('app.workplace_prev_addr', '', true);
  RETURN v_id;
END $$;

DROP FUNCTION IF EXISTS public.workplace_current();

CREATE OR REPLACE FUNCTION public.workplace_current()
RETURNS TABLE (id uuid, nome text, endereco text, latitude double precision, longitude double precision, raio_metros integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT w.id, w.nome, w.endereco, w.latitude, w.longitude, w.raio_metros
    FROM public.workplaces w
   WHERE w.installation_id = '00000000-0000-0000-0000-000000000001'::uuid
     AND w.ativo
   LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.set_workplace(text, text, text, double precision, double precision, integer) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.set_workplace(text, text, text, double precision, double precision, integer) TO service_role;

REVOKE ALL ON FUNCTION public.workplace_current() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.workplace_current() TO service_role;

-- ============================================================================
-- 0008: prova de integridade — impressao digital do schema e marcos datados.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.schema_fingerprint()
RETURNS text LANGUAGE sql STABLE SET search_path = public, pg_catalog AS $$
  SELECT encode(extensions.digest(string_agg(linha, E'\n' ORDER BY linha), 'sha256'), 'hex')
  FROM (
    SELECT 'TABLE ' || table_name || '.' || column_name || ':' || data_type || ':' ||
           is_nullable || ':' || COALESCE(column_default, '-') AS linha
      FROM information_schema.columns
     WHERE table_schema = 'public'
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

CREATE TABLE IF NOT EXISTS public.integrity_anchors (
  id bigserial PRIMARY KEY,
  installation_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  impressao_esquema text NOT NULL,
  topo_corrente text,
  sessoes integer NOT NULL DEFAULT 0,
  nota text,
  criado_em timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.integrity_anchors ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.integrity_anchors FROM anon, authenticated;

GRANT ALL ON public.integrity_anchors TO service_role;

GRANT USAGE, SELECT ON SEQUENCE public.integrity_anchors_id_seq TO service_role;

CREATE OR REPLACE FUNCTION public.anchor_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'Marco de integridade e somente-leitura. Registre um novo marco em vez de alterar.';
END $$;

DROP TRIGGER IF EXISTS ia_guard ON public.integrity_anchors;

CREATE TRIGGER ia_guard
  BEFORE UPDATE OR DELETE ON public.integrity_anchors
  FOR EACH ROW EXECUTE FUNCTION public.anchor_guard();

DROP FUNCTION IF EXISTS public.integrity_state();

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

REVOKE ALL ON FUNCTION public.schema_fingerprint() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.schema_fingerprint() TO service_role;

REVOKE ALL ON FUNCTION public.integrity_state() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.integrity_state() TO service_role;
