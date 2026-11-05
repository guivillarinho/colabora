# Preview Vercel — auditoria e preparação

2026-11-05 — Preview criado, porém ainda **QUEUED** na Vercel (sem build concluído). URL retornada: `https://colabora-ei9x5q2g6-villarinhoguis-projects.vercel.app`; deployment `dpl_EjnkMR9stWrbSfMxC1vtmaCYjJ1E`. Migrações aplicadas somente ao Neon Free isolado, após consulta prévia sem tabelas/ledger.

## Destino e Git

- Branch local/remota: `feat/colabora-evolucao`, commit `3fb00e1` enviado ao GitHub; `main` não foi alterada. Working tree deve ser verificado antes do deploy.
- Projeto vinculado: `villarinhoguis-projects/colabora`, integração GitHub `guivillarinho/colabora`, branch de produção `main`. Vercel autenticada como `villarinho-gui`; Node 24.x, preset Other, raiz do repositório e build `npm run build:vercel` confirmados por consultas remotas.
- `gh` não tem sessão válida (`GITHUB_TOKEN` inválido), mas `git push` autenticado criou a branch remota. A conexão de Git da Vercel reporta `createDeployments=disabled`; para manter essa configuração (e não alterar o comportamento de produção), deployment será via CLI Vercel em ambiente Preview após publicar o commit da feature.
- Metadados gitProviderOptions retornaram createDeployments=disabled e disableRepositoryDispatchEvents=true; não foram interpretados como prova de que todos os deploys Git estejam desabilitados. Fluxo automático Preview ainda precisa ser confirmado. Nenhuma configuração remota foi alterada.

## Banco — condição impeditiva

- Neon acessível na organização `org-late-grass-91070595`, plano indicado como **free**, administrado via Vercel. Projeto de banco `colabora-db` (`polished-rice-52637077`) tem somente branch `main` (`br-cool-cell-b6ej8era`), marcada como produção pela integração. Outro projeto existente, `colabora-reminders`, serve ao agendador; não foi reutilizado nem alterado.
- Recurso Neon `colabora-homologacao` criado pelo Marketplace Vercel no plano **Free**, projeto `solitary-night-09470558`, região `aws-sa-east-1`, PostgreSQL 18, compute fixo 0,25 CU. Branch `main` (`br-restless-cloud-b6yxbt3l`), role `neondb_owner`, database `neondb`. Antes de migrar, conexão foi validada contra host `ep-frosty-queen-b6cbgymv.c-2.sa-east-1.aws.neon.tech`: nenhuma tabela pública e nenhum ledger. Sem dados pessoais copiados.
- Migração explícita executada uma vez no alvo validado; consulta posterior mostra 15 tabelas públicas e 8 registros no ledger. Recurso conectado ao projeto Vercel apenas em Preview com prefixo `COLABORA_PREVIEW`; `storage status` preserva escopos do recurso anterior. `SESSION_SECRET` criado como secret exclusivo para Preview da branch `feat/colabora-evolucao`, valor não exibido.
- O plano Free permite compute/storage limitados, mas quotas de conta ainda podem mudar; recurso mantém 0,25 CU e suspend timeout global (configuração 0 = default). Sem habilitação de plano pago, billing ou APIs externas. O build/deployment deverá parar se política não validar o host.
- A primeira execução foi feita somente após conferir host, role, database, ausência de tabelas/ledger e isolamento do projeto. As 8 migrations registradas incluem 15 tabelas. Não executar down/revert/schema:sync.

## Alterações locais necessárias

- `scripts/build-vercel.mjs`: removida execução de `dist/database/migrate.js`. O build compila/empacota, sem abrir banco. Migração passou a ser operação explícita separada, ainda não executada remotamente. Validações prévias de Blob/VAPID para builds não Preview foram preservadas. A mudança de fluxo de migração também precisa ser considerada num futuro rollout de produção autorizado; nada foi aplicado lá agora.
- `scripts/preview-policy.mjs`: build e função gerada usam a mesma política. Preview consome os URLs Neon com prefixo do Marketplace, falha sem host, URL de banco, SESSION_SECRET próprio de pelo menos 32 caracteres e VERCEL_URL exata. Pooler e endpoint direto devem pertencer ao mesmo host canônico. Host vem do recurso segregado; não aceita URLs de banco compartilhadas.
- A política remove aliases de banco herdados, usa schema public/TLS e define origem/URL pública exclusivamente como `https://VERCEL_URL`, sem wildcard. O frontend continua com API na mesma origem. Cookies Secure/HttpOnly/SameSite e guard/CSRF existentes são preservados; runtime serverless não aplica migrations no startup. Fora do wrapper Vercel, a API ainda migra automaticamente ao iniciar; não iniciá-la com banco real sem revisão.
- No Preview, Gemini/Google ficam false e credenciais Gemini/Google, e-mail Brevo, push VAPID, dispatch e Blob são esvaziadas antes de carregar o backend. Avatar externo também é desabilitado. Não há scheduler criado; worker já não inicia na Vercel. Nenhuma mensagem/e-mail/push real enviado. Uploads ficam indisponíveis com erro de configuração, sem usar o Blob de produção; não são certificados como funcionais.
- `api/src/database/migrate.ts`: mensagem de conclusão agora se refere ao banco selecionado, sem anunciar produção em uma migração de homologação.

## Migrações e configuração pendentes

- Migrações novas do assistente (`1793923200000`) e Calendar (`1794009600000`) apenas criam tabelas/índices/vínculos. Migrações up anteriores criam tabelas/adicionam colunas; push também popula fila de lembretes de tarefas existentes. Nenhuma up destrutiva foi identificada; existem downs antigos com DROP COLUMN, que não serão executados.
- Ledger do banco isolado contém 8 migrations após bootstrap inicial; não copiar schema sem ledger nem reaplicar migrations manualmente.
- Variáveis no Preview: recurso Neon prefixado em escopo Preview (`COLABORA_PREVIEW_DATABASE_URL`, `_UNPOOLED`, host e aliases); `SESSION_SECRET` secret branch-specific. Política valida as conexões, converte a URL isolada para `DATABASE_URL` e apaga aliases/segredos prefixed herdados antes de carregar a API. DB_SSL/schema e WEB_ORIGIN/PUBLIC_APP_URL são definidos pela política. VITE_API_URL é fixado vazio no build para `/api`; sem secrets VITE_*.
- GEMINI_ENABLED=false e GOOGLE_ENABLED=false. Não cadastrar OAuth redirect URI, credenciais ou chave de cifra nesta execução. E-mail, push, dispatch e Blob desabilitados. Overrides branch-specific vazios devem substituir aliases/credenciais compartilhadas de produção no Preview, sem editar/remover valores Production. Nunca puxar todos os segredos de Production.
- Projeto Vercel reporta target `preview`; URL HTTPS responde atualmente à página de espera “Deployment is building”, não à aplicação. `/health` e `/api/health` também retornam essa página HTML enquanto estiver queued. Runtime, cookies, API, proteção de acesso e rotas ainda não foram validados. Build concluído permanece pendente.

## Validação executada agora

- Web: 116 testes / 20 suítes; API: 70 / 11 suítes; HTTP: 31 no PostgreSQL local descartável; cabeçalhos: 8; política Preview: 7. **232 testes passaram** (não reutiliza a contagem histórica como evidência atual).
- `npm run build` (web + API), lint web e API sem --fix, sintaxe dos scripts e diff check passaram. PostgreSQL de teste parado ao final. Nenhuma chave real nos testes.
- Testes Preview incluem rejeição de host divergente/UNPOOLED incorreta, segredo fraco, origem wildcard, limpeza de serviços e execução negativa do script de build: recusa antes de compilar, empacotar ou migrar, sem expor conexão sintética.
- Deploy Preview foi submetido via Vercel CLI, sem `--prod`, promoção ou domínio principal; status permanece Queued. Status da Vercel mostrou incidente de atraso de Builds/Deploys, depois resolvido, porém deployment continuou em fila. Não foi executado build:vercel local; build remoto não iniciou/concluiu e não há teste pós-deploy. Não criar outro deploy enquanto este estiver queued.

## Próxima decisão e recuperação

1. Acompanhar deployment existente até READY/ERROR e inspecionar logs sanitizados.
2. Se READY, validar API/health, SPA, auth/CSRF, cookies e acessos não autenticados. Se falhar, corrigir somente causa raiz e não alterar Production.
4. Rollback: como não há deployment, não há publicação a reverter. Futuro rollback deve retirar apenas o Preview criado ou reutilizar um Preview conhecido do mesmo banco de teste; não promover para produção, reverter migrations ou apagar bancos. Mudanças aditivas podem permanecer até revisão. Encerrar recurso de teste/custo somente após identificar o recurso e obter autorização apropriada.

Riscos residuais: funcionalidades pendentes do roadmap, integrações reais não homologadas, CSP unsafe-inline, PDF ZAP ausente, empacotamento/runtime remoto ainda não validado. Não há aprovação de release nem teste pós-publicação.
