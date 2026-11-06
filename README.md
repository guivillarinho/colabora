# Colabora

Aplicativo de gestão de tarefas inteligente. A interface fica em `web/` (React) e a API em `api/` (NestJS). O banco é PostgreSQL.

## Como rodar

Na raiz do repositório:

```bash
npm install
npm --prefix web install
npm --prefix api install
cp api/.env.example api/.env
cp web/.env.example web/.env
# Preencha SESSION_SECRET em api/.env com um segredo aleatório de ao menos 32 caracteres.
# Exemplo para gerar: node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
docker compose up -d
npm run dev:api
npm run dev:web
```

A interface sobe em `http://localhost:5173` e a API em `http://localhost:3000`. O health check é `GET /health`. A API privada usa o prefixo `/api`. No primeiro acesso, crie uma conta. Sessões e dados ficam no PostgreSQL; migrações são aplicadas na inicialização local, sem sincronização destrutiva.

## Scripts

Na raiz: `npm run dev:web`, `npm run dev:api`, `npm run build`, `npm run lint`, `npm run test` e `npm run format`.

O relato de como o projeto foi construído está em [docs/processo.md](docs/processo.md).

As configurações e os requisitos de produção estão em [docs/hospedagem.md](docs/hospedagem.md).

## Perfil, temas e tarefas

O perfil reúne foto/avatar, aparência, notificações, Google Agenda e produtividade. A foto pode ser enviada, substituída ou removida com confirmação; as fotos dos responsáveis aparecem nos cards conforme as permissões das tarefas. O botão rápido alterna entre claro e escuro; o modo do sistema e as paletas ficam em **Perfil → Aparência**.

Os cards abrem os detalhes por clique, toque ou teclado. A edição fica no lápis dos detalhes; o gesto horizontal permite concluir ou confirmar a exclusão, preservando a rolagem vertical. A criação oferece tarefas agendadas e cronometradas, com anexos enviados antes de salvar sua referência.

## Homologação na Vercel

A branch de homologação é `feat/colabora-evolucao`. O Preview tem banco e Blob privados separados da produção e exige acesso autorizado na Vercel. Endereço validado, commits, configuração, resultados e limites estão em [docs/COLABORA_PREVIEW_DEPLOYMENT.md](docs/COLABORA_PREVIEW_DEPLOYMENT.md). O histórico de implementação fica em [docs/COLABORA_PROGRESS.md](docs/COLABORA_PROGRESS.md).

## Autenticação e testes

Cadastro, login e logout usam cookie HttpOnly e sessões persistentes. As tarefas são visíveis ao criador e ao responsável; somente o criador pode editar, reatribuir ou excluir. Eventos e sessões de foco são privados por usuário. Registros antigos são preservados e ficam isolados até uma vinculação administrativa explícita.

```bash
docker compose -f docker-compose.test.yml up -d --wait
npm run lint
npm run test
npm --prefix api run test:e2e -- --runInBand
npm run build
```

A suíte HTTP aceita somente o banco descartável `colabora_test` na porta local `55432`, cria um schema aleatório e remove apenas esse schema no fim. Não use URLs de produção em testes. Para encerrar o banco de testes: `docker compose -f docker-compose.test.yml down`.

Relatório técnico, resultados, configuração e limites: [docs/auditoria-autenticacao.md](docs/auditoria-autenticacao.md).
