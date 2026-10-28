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
--> statement-breakpoint

-- O codigo do aparelho tem entre 16 e 64 caracteres (letras, numeros e hifen).
ALTER TABLE public.trusted_devices
  DROP CONSTRAINT IF EXISTS trusted_devices_device_id_formato;
--> statement-breakpoint
ALTER TABLE public.trusted_devices
  ADD CONSTRAINT trusted_devices_device_id_formato
  CHECK (device_id ~ '^[A-Za-z0-9-]{16,64}$');
--> statement-breakpoint

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
--> statement-breakpoint

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
--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- Acesso: somente o servidor. Nenhuma leitura ou escrita para anon/authenticated.
-- ----------------------------------------------------------------------------
ALTER TABLE public.trusted_devices ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON public.trusted_devices FROM anon, authenticated;
--> statement-breakpoint
GRANT ALL ON public.trusted_devices TO service_role;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.device_check(text) FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.device_check(text) TO service_role;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.device_authorize(text, text) FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.device_authorize(text, text) TO service_role;
