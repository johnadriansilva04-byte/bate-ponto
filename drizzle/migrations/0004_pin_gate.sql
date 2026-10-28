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
--> statement-breakpoint

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
--> statement-breakpoint

-- O hash de '160817'. Trocavel depois por um UPDATE nesta tabela, sem tocar no
-- codigo do aplicativo.
INSERT INTO public.app_config (installation_id, pin_hash)
VALUES (
  '00000000-0000-0000-0000-000000000001'::uuid,
  '$2a$11$F.tVMic8YnxTPFMmF6Fwm.HeThuId0XhFMmroS4uuwXeD/4QwBzyW'
)
ON CONFLICT (installation_id) DO NOTHING;
--> statement-breakpoint

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
--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- Acesso: somente o servidor. Nenhuma leitura ou escrita para anon/authenticated.
-- ----------------------------------------------------------------------------
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON public.app_config FROM anon, authenticated;
--> statement-breakpoint
GRANT ALL ON public.app_config TO service_role;
--> statement-breakpoint
-- Nem anon nem authenticated podem chamar pin_verify: a conferencia passa pelo
-- servidor do aplicativo, nunca direto do navegador.
REVOKE ALL ON FUNCTION public.pin_verify(text) FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.pin_verify(text) TO service_role;
