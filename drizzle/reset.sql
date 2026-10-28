-- ============================================================================
-- Reinicio geral: deixa o banco limpo, pronto para o primeiro dia de trabalho.
--
-- O QUE ESTE SCRIPT FAZ
--   - apaga todos os registros de ponto (work_sessions) e a auditoria deles;
--   - apaga os fechamentos mensais e os valores de hora guardados;
--   - zera as tentativas erradas de senha e o bloqueio;
--   - apaga a lista de aparelhos liberados, para o celular dele entrar sozinho;
--   - volta o local de trabalho para AV MAURO RAMOS 765, CENTRO, FLORIANOPOLIS;
--   - limpa o log de trocas de local.
--
-- O QUE ELE NAO FAZ
--   - nao apaga o cadastro do titular (profiles: nome e CPF);
--   - nao apaga a senha de 6 numeros (app_config.pin_hash);
--   - nao remove tabelas nem funcoes: o lacre SHA-256 continua pronto.
--
-- Depois de rodar, a primeira sessao nasce com prev_hash nulo, que a funcao de
-- lacre trata como 'GENESIS' — o comeco da corrente de integridade.
--
-- Rodar uma vez, com o banco vazio. Rodar de novo em cima de dados reais apaga
-- o historico de verdade.
-- ============================================================================

-- Registros de ponto e seus rastros.
DELETE FROM public.session_audit;
--> statement-breakpoint
DELETE FROM public.work_sessions;
--> statement-breakpoint

-- Fechamentos e valores.
DELETE FROM public.monthly_rates;
--> statement-breakpoint
DELETE FROM public.monthly_closures;
--> statement-breakpoint

-- Senha: zera tentativas e bloqueio, mantendo o hash.
UPDATE public.app_config
   SET tentativas_erradas = 0,
       bloqueado_ate = NULL,
       updated_at = now();
--> statement-breakpoint

-- Aparelhos: lista vazia, para o celular dele ser o primeiro e entrar sozinho.
DELETE FROM public.trusted_devices;
--> statement-breakpoint

-- Local de trabalho: volta ao endereco original, com um unico ativo.
DELETE FROM public.workplaces;
--> statement-breakpoint
INSERT INTO public.workplaces (installation_id, nome, endereco, ativo)
VALUES (
  '00000000-0000-0000-0000-000000000001'::uuid,
  'Local de trabalho',
  'AV MAURO RAMOS 765, CENTRO, FLORIANÓPOLIS - SC',
  true
);
--> statement-breakpoint
-- O proprio cadastro acima entra no log; o log comeca vazio de verdade.
DELETE FROM public.workplace_audit;
