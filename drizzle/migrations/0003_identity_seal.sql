-- ============================================================================
-- 0003: a identidade do titular entra no lacre de integridade.
--
-- A identidade vive em public.profiles (uma linha, sem login). Aqui ela passa a
-- fazer parte do SHA-256 e fica tambem gravada em cada sessao, para que a ficha
-- impressa mostre exatamente quem foi o titular naquele dia, mesmo que o
-- cadastro mude depois.
-- ============================================================================

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

ALTER TABLE public.work_sessions ADD COLUMN IF NOT EXISTS titular_nome text;
--> statement-breakpoint
ALTER TABLE public.work_sessions ADD COLUMN IF NOT EXISTS titular_cpf text;
--> statement-breakpoint

-- Preenche o que ja existe com o cadastro atual.
UPDATE public.work_sessions w
   SET titular_nome = COALESCE(w.titular_nome, p.nome),
       titular_cpf  = COALESCE(w.titular_cpf,  p.cpf)
  FROM public.profiles p
 WHERE p.installation_id = w.installation_id
   AND (w.titular_nome IS NULL OR w.titular_cpf IS NULL);
--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- Conteudo lacrado, agora com CPF e nome. Esta e a unica definicao: o selo e a
-- conferencia usam a mesma funcao, senao a verificacao nao teria sentido.
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
    COALESCE(p_cpf, ''), COALESCE(p_nome, ''),
    COALESCE(p_prev, 'GENESIS'));
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.ws_hash(
  p_installation uuid, p_id uuid, p_started timestamptz, p_ended timestamptz,
  p_slat double precision, p_slng double precision, p_elat double precision, p_elng double precision,
  p_cpf text, p_nome text, p_prev text
) RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT encode(extensions.digest(public.ws_seal_payload(
    p_installation, p_id, p_started, p_ended,
    FLOOR(EXTRACT(EPOCH FROM (p_ended - p_started)))::bigint,
    p_slat, p_slng, p_elat, p_elng, p_cpf, p_nome, p_prev), 'sha256'), 'hex');
$$;
--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- Selo: ao fechar, o banco copia a identidade do cadastro para a sessao,
-- encadeia com o registro anterior e calcula o SHA-256. O aplicativo nunca
-- escreve o hash: ele e sempre recalculado aqui.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ws_seal() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_prev text;
  v_cpf text;
  v_nome text;
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

  SELECT p.cpf, p.nome INTO v_cpf, v_nome
    FROM public.profiles p
   WHERE p.installation_id = NEW.installation_id;

  -- Mantem a identidade original quando o registro ja tinha uma.
  NEW.titular_cpf := COALESCE(OLD.titular_cpf, v_cpf, NEW.titular_cpf);
  NEW.titular_nome := COALESCE(OLD.titular_nome, v_nome, NEW.titular_nome);

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
    NEW.titular_cpf, NEW.titular_nome, v_prev);
  NEW.sealed_at := now();
  RETURN NEW;
END $$;
--> statement-breakpoint

-- A guarda tambem protege a identidade gravada.
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
       OR NEW.session_hash IS DISTINCT FROM OLD.session_hash) THEN
    RAISE EXCEPTION 'Registro lacrado. Use correct_session_end() para corrigir.';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint

-- A correcao precisa limpar a identidade gravada para o selo ser recalculado.
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
         titular_nome = NULL
   WHERE id = p_session_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sessao nao encontrada.';
  END IF;

  PERFORM set_config('app.allow_correction', 'off', true);
END $$;
--> statement-breakpoint

-- Conferencia do lacre, com a identidade.
CREATE OR REPLACE FUNCTION public.session_hash_valid(p_id uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT w.session_hash = public.ws_hash(
        w.installation_id, w.id, w.started_at, w.ended_at,
        w.start_latitude, w.start_longitude, w.end_latitude, w.end_longitude,
        w.titular_cpf, w.titular_nome, w.prev_hash)
       FROM public.work_sessions w WHERE w.id = p_id),
    false);
$$;
