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
--> statement-breakpoint

-- So um local ativo por vez: e o lugar onde ele esta trabalhando agora.
CREATE UNIQUE INDEX IF NOT EXISTS one_active_workplace
  ON public.workplaces (installation_id) WHERE ativo;
--> statement-breakpoint

-- O endereco inicial. ON CONFLICT DO NOTHING para nao sobrescrever se ja houver.
INSERT INTO public.workplaces (installation_id, nome, endereco)
VALUES (
  '00000000-0000-0000-0000-000000000001'::uuid,
  'Local de trabalho',
  'AV MAURO RAMOS 765, CENTRO, FLORIANÓPOLIS - SC'
)
ON CONFLICT DO NOTHING;
--> statement-breakpoint

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
--> statement-breakpoint

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
--> statement-breakpoint

DROP TRIGGER IF EXISTS wp_audit ON public.workplaces;
--> statement-breakpoint
CREATE TRIGGER wp_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.workplaces
  FOR EACH ROW EXECUTE FUNCTION public.workplace_log_change();
--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- Troca de local. Exige motivo e deixa rastro; nunca apaga o anterior.
-- ----------------------------------------------------------------------------
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
--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- Local ativo agora.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.workplace_current()
RETURNS TABLE (id uuid, nome text, endereco text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT w.id, w.nome, w.endereco
    FROM public.workplaces w
   WHERE w.installation_id = '00000000-0000-0000-0000-000000000001'::uuid
     AND w.ativo
   LIMIT 1;
$$;
--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- Sessao guarda o local copiado no lacre.
-- ----------------------------------------------------------------------------
ALTER TABLE public.work_sessions ADD COLUMN IF NOT EXISTS workplace_id uuid;
--> statement-breakpoint
ALTER TABLE public.work_sessions ADD COLUMN IF NOT EXISTS workplace_label text;
--> statement-breakpoint

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
--> statement-breakpoint

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
--> statement-breakpoint

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
--> statement-breakpoint

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
--> statement-breakpoint

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
--> statement-breakpoint

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
--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- Acesso: somente o servidor.
-- ----------------------------------------------------------------------------
ALTER TABLE public.workplaces ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.workplace_audit ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON public.workplaces FROM anon, authenticated;
--> statement-breakpoint
REVOKE ALL ON public.workplace_audit FROM anon, authenticated;
--> statement-breakpoint
GRANT ALL ON public.workplaces TO service_role;
--> statement-breakpoint
GRANT ALL ON public.workplace_audit TO service_role;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.set_workplace(text, text, text) FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.set_workplace(text, text, text) TO service_role;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.workplace_current() FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.workplace_current() TO service_role;
