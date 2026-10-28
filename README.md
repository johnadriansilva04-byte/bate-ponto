# Meu Ponto

Aplicativo pessoal de controle de ponto. Uma pessoa, um celular, sem login.

Você toca em **INICIAR TRABALHO** e em **FINALIZAR TRABALHO**. O app registra
sozinho as datas e horas de entrada e saída. A aba **HISTÓRICO** mostra os
registros em tabelas por semana, com total do dia, total da semana e resumo do
mês (dias trabalhados, sessões, horas e minutos). O campo de valor da hora é
opcional e o valor fica guardado em cada fechamento mensal.

## Tecnologias

- TanStack Start / Router / Query
- React + TypeScript
- Supabase (PostgreSQL) como banco de dados
- Tailwind CSS + shadcn/ui
- Vite (build) e Nitro (deploy no Vercel)

## Banco de dados

O acesso ao banco acontece **somente pelo servidor**, com a chave
`service_role`, através das server functions em `src/lib/`. O navegador nunca
recebe a chave.

Como existe apenas um usuário, não há login nem cadastro. Os registros ficam
ligados a um `installation_id` fixo, definido no banco.

### Aplicar o schema

1. Abra o painel do Supabase: **SQL Editor → New query**
2. Cole todo o conteúdo de `supabase/setup.sql`
3. Clique em **Run**

O script pode ser executado mais de uma vez sem erro. Ele também funciona em um
banco que ainda esteja no modelo antigo (com login), migrando os registros
existentes sem alterar as datas e horas.

O histórico de migrações equivalente fica em `drizzle/migrations/`.

## Variáveis de ambiente

Copie `.env.example` para `.env` (uso local) ou cadastre as variáveis no painel
do Vercel (**Settings → Environment Variables**):

| Variável | Descrição |
|---|---|
| `SUPABASE_URL` | URL do projeto Supabase (Settings → API → Project URL) |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave `service_role` (Settings → API) |

A chave `service_role` dá acesso total ao banco. Ela deve existir **apenas no
servidor**, nunca com prefixo `VITE_` e nunca commitada no repositório.

## Desenvolvimento

Requer Node.js.

```sh
npm i
cp .env.example .env   # preencha com as chaves do seu projeto Supabase
npm run dev
```

## Testes

```sh
npm test
```

Os testes cobrem os cálculos de horas em `src/lib/hours.ts`: formatação de
duração, agrupamento por semana, total do mês, cálculo do valor a receber e
divisão de sessões por dia (incluindo virada de meia-noite).
