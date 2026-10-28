-- ============================================================================
-- 0009: declaracao de finalidade — POR QUE este registro existe.
--
-- Ate aqui o banco provava QUE os horarios nao mudaram. Esta migration grava
-- PARA QUE eles servem. Sem a finalidade declarada, um registro tecnico pode
-- ser lido como controle de ponto qualquer; com ela, o registro se explica.
--
-- CONTEXTO. O titular trabalha sem vinculo formal e sem comprovante de jornada
-- porque um erro no registro civil trocou seu nome ("JOAO DE JESUS DO ROSARIO"
-- virou "JOAO DE DEUS DO ROSARIO") e os documentos nao conferem com o nome pelo
-- qual ele trabalha e recebe. Enquanto a correcao tramita, existem os PIX
-- (pagamento, sem jornada) e este aplicativo (jornada, com hora e lugar).
--
-- A finalidade declarada e permitir que a Justica, ao final do processo,
-- reconheca o tempo efetivamente trabalhado com base em registro datado,
-- encadeado e verificavel.
--
-- SOMENTE-INSERCAO. A tabela recusa UPDATE e DELETE pelo mesmo motivo dos
-- marcos: uma finalidade que pode ser reescrita depois nao prova nada. Para
-- alterar o texto, registra-se uma nova linha datada — o historico permanece.
--
-- HONESTIDADE. O texto declara tambem o que o registro NAO prova. Registro que
-- promete mais do que entrega vale menos em juizo do que um que declara o
-- proprio limite.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.declaracao_finalidade (
  id bigserial PRIMARY KEY,
  installation_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  /** Nome pelo qual o titular trabalha e assina. */
  nome_de_fato text NOT NULL,
  /** Nome que consta no registro civil, por erro a ser corrigido. */
  nome_no_registro text NOT NULL,
  /** Para que o registro sera usado, em linguagem direta. */
  proposito text NOT NULL,
  /** O que a prova tecnica sustenta, uma linha por item. */
  o_que_prova text[] NOT NULL,
  /** O que ela nao sustenta. Declarar isso fortalece a credibilidade. */
  o_que_nao_prova text[] NOT NULL,
  /** Por que o log do Supabase entra como prova externa. */
  prova_externa text NOT NULL,
  /** Limites tecnicos medidos, para nao prometer o que nao existe. */
  limites text[] NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

ALTER TABLE public.declaracao_finalidade ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON public.declaracao_finalidade FROM anon, authenticated;
--> statement-breakpoint
GRANT ALL ON public.declaracao_finalidade TO service_role;
--> statement-breakpoint
GRANT USAGE, SELECT ON SEQUENCE public.declaracao_finalidade_id_seq TO service_role;
--> statement-breakpoint

-- Mesma trava dos marcos: recusa edicao e exclusao. Registra-se uma nova
-- declaracao datada em vez de reescrever a antiga.
CREATE OR REPLACE FUNCTION public.finalidade_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'Declaracao de finalidade e somente-insercao. Registre uma nova declaracao datada em vez de alterar.';
END $$;
--> statement-breakpoint

DROP TRIGGER IF EXISTS df_guard ON public.declaracao_finalidade;
--> statement-breakpoint
CREATE TRIGGER df_guard
  BEFORE UPDATE OR DELETE ON public.declaracao_finalidade
  FOR EACH ROW EXECUTE FUNCTION public.finalidade_guard();
--> statement-breakpoint

-- A declaracao em vigor, para a ficha impressa e a tela. SECURITY DEFINER para
-- o aplicativo ler sem depender de RLS, e REVOKE abaixo para ninguem de fora
-- alcancar direto.
CREATE OR REPLACE FUNCTION public.finalidade_atual()
RETURNS TABLE (
  nome_de_fato text,
  nome_no_registro text,
  proposito text,
  o_que_prova text[],
  o_que_nao_prova text[],
  prova_externa text,
  limites text[],
  declarada_em timestamptz
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT d.nome_de_fato, d.nome_no_registro, d.proposito, d.o_que_prova,
         d.o_que_nao_prova, d.prova_externa, d.limites, d.criado_em
    FROM public.declaracao_finalidade d
   ORDER BY d.criado_em DESC
   LIMIT 1;
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION public.finalidade_atual() FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.finalidade_atual() TO service_role;
