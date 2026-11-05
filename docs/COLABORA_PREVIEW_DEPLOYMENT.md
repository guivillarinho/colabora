# Preview Vercel — auditoria e preparação

2026-11-05 — **DEPLOY PREVIEW READY**. URL: `https://colabora-ei9x5q2g6-villarinhoguis-projects.vercel.app`; deployment `dpl_EjnkMR9stWrbSfMxC1vtmaCYjJ1E`, target `preview`, função Node 24 em `gru1`. Migrações aplicadas somente ao Neon Free isolado, após consulta prévia sem tabelas/ledger.

## Destino e Git

- Branch local/remota: `feat/colabora-evolucao`, HEAD atual `4f78104` no GitHub; `main` não foi alterada e working tree está limpo. O deployment CLI foi criado a partir do snapshot limpo em `675efc0`; `4f78104` altera somente documentação posterior de status, sem código de app.
- Projeto vinculado: `villarinhoguis-projects/colabora`, integração GitHub `guivillarinho/colabora`, branch de produção `main`. Vercel autenticada como `villarinho-gui`; Node 24.x, preset Other, raiz do repositório e build `npm run build:vercel` confirmados por consultas remotas.
- `gh` não tem sessão válida (`GITHUB_TOKEN` inválido), mas `git push` autenticado criou e atualizou a branch. Foi usada Vercel CLI somente para Preview; nenhuma configuração de deployment automático ou Production foi alterada.

## Banco — condição impeditiva

- Neon acessível na organização `org-late-grass-91070595`, plano indicado como **free**, administrado via Vercel. Projeto de banco `colabora-db` (`polished-rice-52637077`) tem somente branch `main` (`br-cool-cell-b6ej8era`), marcada como produção pela integração. Outro projeto existente, `colabora-reminders`, serve ao agendador; não foi reutilizado nem alterado.
- Recurso Neon `colabora-homologacao` criado pelo Marketplace Vercel no plano **Free**, projeto `solitary-night-09470558`, região `aws-sa-east-1`, PostgreSQL 18, compute fixo 0,25 CU. Branch `main` (`br-restless-cloud-b6yxbt3l`), role `neondb_owner`, database `neondb`. Antes de migrar, conexão foi validada contra host `ep-frosty-queen-b6cbgymv.c-2.sa-east-1.aws.neon.tech`: nenhuma tabela pública e nenhum ledger. Sem dados pessoais copiados.
- Migração explícita executada uma vez no alvo validado; consulta posterior mostra 15 tabelas públicas e 8 registros no ledger. Recurso conectado ao projeto Vercel apenas em Preview com prefixo `COLABORA_PREVIEW`; `storage status` preserva escopos do recurso anterior. `SESSION_SECRET` criado como secret exclusivo para Preview da branch `feat/colabora-evolucao`, valor não exibido.
- O plano Free permite compute/storage limitados, mas quotas de conta ainda podem mudar; recurso mantém 0,25 CU e suspend timeout global (configuração 0 = default). Sem habilitação de plano pago, billing ou APIs externas. O build/deployment deverá parar se política não validar o host.
- A primeira execução foi feita somente após conferir host, role, database, ausência de tabelas/ledger e isolamento do projeto. As 8 migrations registradas incluem 15 tabelas. Não executar down/revert/schema:sync.

## Alterações locais necessárias

- `scripts/build-vercel.mjs`: removida execução de `dist/database/migrate.js`. O build compila/empacota, sem abrir banco. Migração explícita separada foi executada somente após verificar o DB de Preview vazio. Validações prévias de Blob/VAPID para builds não Preview foram preservadas. Um futuro rollout de produção precisa incluir migration explícita autorizada.
- `scripts/preview-policy.mjs`: build e função gerada usam a mesma política. Preview consome os URLs Neon com prefixo do Marketplace, falha sem host, URL de banco, SESSION_SECRET próprio de pelo menos 32 caracteres e VERCEL_URL exata. Pooler e endpoint direto devem pertencer ao mesmo host canônico. Host vem do recurso segregado; não aceita URLs de banco compartilhadas.
- A política remove aliases de banco herdados, usa schema public/TLS e define origem/URL pública exclusivamente como `https://VERCEL_URL`, sem wildcard. O frontend continua com API na mesma origem. Cookies Secure/HttpOnly/SameSite e guard/CSRF existentes são preservados; runtime serverless não aplica migrations no startup. Fora do wrapper Vercel, a API ainda migra automaticamente ao iniciar; não iniciá-la com banco real sem revisão.
- No Preview, Gemini/Google ficam false e credenciais Gemini/Google, e-mail Brevo, push VAPID, dispatch e Blob são esvaziadas antes de carregar o backend. Avatar externo também é desabilitado. Não há scheduler criado; worker já não inicia na Vercel. Nenhuma mensagem/e-mail/push real enviado. Uploads ficam indisponíveis com erro de configuração, sem usar o Blob de produção; não são certificados como funcionais.
- `api/src/database/migrate.ts`: mensagem de conclusão agora se refere ao banco selecionado, sem anunciar produção em uma migração de homologação.

## Migrações e configuração confirmadas

- Migrações novas do assistente (`1793923200000`) e Calendar (`1794009600000`) apenas criam tabelas/índices/vínculos. Migrações up anteriores criam tabelas/adicionam colunas; push também popula fila de lembretes de tarefas existentes. Nenhuma up destrutiva foi identificada; existem downs antigos com DROP COLUMN, que não serão executados.
- Ledger do banco isolado contém 8 migrations após bootstrap inicial; não copiar schema sem ledger nem reaplicar migrations manualmente.
- Variáveis no Preview: recurso Neon prefixado em escopo Preview (`COLABORA_PREVIEW_DATABASE_URL`, `_UNPOOLED`, host e aliases); `SESSION_SECRET` secreto no Preview geral e override branch-specific, ambos próprios e aleatórios. O deployment CLI não possui metadados Git. Política valida as conexões, converte a URL isolada para `DATABASE_URL` e apaga aliases/segredos prefixados herdados antes de carregar a API. DB_SSL/schema e WEB_ORIGIN/PUBLIC_APP_URL são definidos pela política. VITE_API_URL é fixado vazio no build para `/api`; sem secrets VITE_*.
- GEMINI_ENABLED=false e GOOGLE_ENABLED=false. Sem OAuth redirect URI, credenciais ou chave de cifra. E-mail, push, dispatch e Blob desabilitados pelo wrapper. Variáveis Production/Preview compartilhadas permanecem configuradas no Vercel, mas a política limpa essas credenciais antes de carregar build/runtime Preview; nenhum valor de Production foi baixado.
- Projeto Vercel reporta `Ready`, target `preview`, função `server` 25,73 MB em `gru1`, build 1m52s. A autenticação Vercel protege o Preview: GET anônimo retorna 302; não foi desativada. Sessão CLI existente acessou o deployment para smoke tests.

## Validação executada agora

- Web: 116 testes / 20 suítes; API: 70 / 11 suítes; HTTP: 31 no PostgreSQL local descartável; cabeçalhos: 8; política Preview: 7. **232 testes passaram** (não reutiliza a contagem histórica como evidência atual).
- `npm run build` (web + API), lint web e API sem --fix, sintaxe dos scripts e diff check passaram. PostgreSQL de teste parado ao final. Nenhuma chave real nos testes.
- Testes Preview incluem rejeição de host divergente/UNPOOLED incorreta, segredo fraco, origem wildcard, limpeza de serviços e execução negativa do script de build: recusa antes de compilar, empacotar ou migrar, sem expor conexão sintética.
- Build Vercel remoto passou: Vite/TypeScript, Nest build e empacotamento; nenhum step de migration no build. Logs indicaram 29 vulnerabilidades low/moderate em cada instalação web/API (nenhuma high/critical reportada), para triagem posterior; avisos de dependências deprecated.
- GET `/` via CLI: HTTP 200, HTML com título Colabora, CSP e `nosniff`. GET `/health`: `{"status":"ok"}`; Nest inicializou com conexão de runtime. GET `/api/tasks` sem sessão: HTTP 401, `Cache-Control: private`, sem token/cookie de sessão. Origem hostil não recebe `Access-Control-Allow-Origin`; origem exata do Preview recebe CORS credentials + Vary Origin e mesmo 401. Também confirmado `private` e `nosniff` na rota privada.
- GETs foram feitos pela CLI autenticada para atravessar a proteção Vercel, sem criar/alterar bypass settings. A verificação anônima preservada continua recebendo 302. Não havia conta descartável para login/logout; não foram criados usuários ou enviados e-mails. Chat/Google/Blob estão desabilitados, seus serviços reais não foram testados.

## Próxima decisão e recuperação

1. Recriar deployment somente se houver alteração de código; deployment Git automático permanece desabilitado.
2. Rollback seguro: excluir/desativar apenas este Preview na Vercel. Manter o banco de homologação enquanto for necessário; não reverter migrations nem tocar nos bancos existentes.

Riscos residuais: login/logout real não testado por falta de conta descartável; Deployment Protection exige acesso Vercel; integrações reais e uploads desabilitados; 29 avisos low/moderate de dependências; CSP unsafe-inline e PDF ZAP ausente. Nenhuma aprovação de release Production.
