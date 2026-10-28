-- ============================================================================
-- 0007: geocerca do local previsto.
--
-- O titular bate ponto sempre no mesmo lugar. O cadastro do local passa a
-- guardar tambem a coordenada e um raio de tolerancia, para o aplicativo
-- conseguir AVISAR quando o toque acontece longe dali.
--
-- O aviso e informativo: o ponto continua sendo registrado, com a coordenada
-- real do toque. O aplicativo nunca recusa um toque nem inventa posicao.
--
-- A coordenada e o raio ficam no cadastro do local (uma vez), e nao em cada
-- sessao: a sessao ja guarda a latitude/longitude do toque, e o aviso e so uma
-- comparacao na hora, na tela.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Coordenada e raio do local previsto.
-- ----------------------------------------------------------------------------
ALTER TABLE public.workplaces ADD COLUMN IF NOT EXISTS latitude double precision;
--> statement-breakpoint
ALTER TABLE public.workplaces ADD COLUMN IF NOT EXISTS longitude double precision;
--> statement-breakpoint
ALTER TABLE public.workplaces ADD COLUMN IF NOT EXISTS raio_metros integer NOT NULL DEFAULT 300;
--> statement-breakpoint

-- Coordenada do endereco ja cadastrado, para o aviso ja valer sem ninguem
-- precisar digitar numero nenhum. So preenche onde ainda esta vazio e o
-- endereco e o da instalacao; um endereco diferente nao recebe chute.
UPDATE public.workplaces
   SET latitude = -27.5958794,
       longitude = -48.5435940,
       raio_metros = 300
 WHERE ativo
   AND latitude IS NULL
   AND endereco ILIKE '%MAURO RAMOS%';
--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- Troca de local passa a aceitar a coordenada e o raio.
--
-- A assinatura muda, entao a versao antiga de 3 argumentos e removida: manter
-- as duas criaria uma sobrecarga e o PostgREST poderia escolher a errada.
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.set_workplace(text, text, text);
--> statement-breakpoint

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

  -- Coordenada e opcional, mas vem sempre em par: meia coordenada nao serve
  -- para calcular distancia, entao e descartada em vez de gravar pela metade.
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
--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- Local ativo agora, agora com a coordenada e o raio.
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.workplace_current();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.workplace_current()
RETURNS TABLE (id uuid, nome text, endereco text, latitude double precision, longitude double precision, raio_metros integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT w.id, w.nome, w.endereco, w.latitude, w.longitude, w.raio_metros
    FROM public.workplaces w
   WHERE w.installation_id = '00000000-0000-0000-0000-000000000001'::uuid
     AND w.ativo
   LIMIT 1;
$$;
--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- Acesso: somente o servidor.
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.set_workplace(text, text, text, double precision, double precision, integer) FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.set_workplace(text, text, text, double precision, double precision, integer) TO service_role;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.workplace_current() FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.workplace_current() TO service_role;
