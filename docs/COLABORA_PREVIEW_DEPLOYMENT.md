# Preview Vercel — auditoria e preparação

2026-11-05 — Preparação de Preview em andamento. Nenhuma URL/deployment foi criada e nenhuma migração remota foi executada.

## Destino e Git

- Branch local/remota: `feat/colabora-evolucao`, base `0937ab578e269340c0b9b946ac9a8784021aa649` (igual à main remota na consulta). Branch criada no GitHub. O commit-base foi enviado; alterações da aplicação permanecem staged localmente para commit explícito antes do deployment. `main` não foi alterada.
- Projeto vinculado: `villarinhoguis-projects/colabora`, integração GitHub `guivillarinho/colabora`, branch de produção `main`. Vercel autenticada como `villarinho-gui`; Node 24.x, preset Other, raiz do repositório e build `npm run build:vercel` confirmados por consultas remotas.
- `gh` não tem sessão válida (`GITHUB_TOKEN` inválido), mas `git push` autenticado criou a branch remota. A conexão de Git da Vercel reporta `createDeployments=disabled`; para manter essa configuração (e não alterar o comportamento de produção), deployment será via CLI Vercel em ambiente Preview após publicar o commit da feature.
- Metadados gitProviderOptions retornaram createDeployments=disabled e disableRepositoryDispatchEvents=true; não foram interpretados como prova de que todos os deploys Git estejam desabilitados. Fluxo automático Preview ainda precisa ser confirmado. Nenhuma configuração remota foi alterada.

## Banco — condição impeditiva

- Neon acessível na organização `org-late-grass-91070595`, plano indicado como **free**, administrado via Vercel. Projeto de banco `colabora-db` (`polished-rice-52637077`) tem somente branch `main` (`br-cool-cell-b6ej8era`), marcada como produção pela integração. Outro projeto existente, `colabora-reminders`, serve ao agendador; não foi reutilizado nem alterado.
- Recurso Neon `colabora-homologacao` criado pelo Marketplace Vercel no plano **Free**, projeto `solitary-night-09470558`, região `aws-sa-east-1`, PostgreSQL 18, compute fixo 0,25 CU. Branch `main` (`br-restless-cloud-b6yxbt3l`) recém-criada, 0 bytes de escrita/transferência/compute na verificação, sem dados pessoais copiados. A org é `free_v3`; criação direta por CLI foi recusada porque é gerenciada pela Vercel. Nenhuma consulta SQL foi feita.
- Recurso conectado ao projeto Vercel apenas no ambiente Preview com prefixo `COLABORA_PREVIEW`; os envs Production permanecem conectados exclusivamente ao recurso anterior. `storage status` confirma escopo `preview` para o recurso novo e `production, preview` para o existente. As conexões ainda devem ser conferidas pelo host efetivamente injetado na função antes de migração. A variável `SESSION_SECRET` foi criada como secret somente para Preview da branch `feat/colabora-evolucao`, aleatória, sem valor exibido.
- O plano Free permite compute/storage limitados, mas quotas de conta ainda podem mudar; recurso mantém 0,25 CU e suspend timeout global (configuração 0 = default). Sem habilitação de plano pago, billing ou APIs externas. O build/deployment deverá parar se política não validar o host.
- Antes de migrar: confirmar projeto/branch/endpoint/role dedicados e que essas credenciais não autorizam escrita em produção; comparar endpoint público (sem senha) com o inventário de produção, conferir existência de dados, ledger de migrations e plano pendente. Não usar main como homologação. Somente então executar migração explícita uma vez no destino confirmado. Não executar down/revert/schema:sync.

## Alterações locais necessárias

- `scripts/build-vercel.mjs`: removida execução de `dist/database/migrate.js`. O build compila/empacota, sem abrir banco. Migração passou a ser operação explícita separada, ainda não executada remotamente. Validações prévias de Blob/VAPID para builds não Preview foram preservadas. A mudança de fluxo de migração também precisa ser considerada num futuro rollout de produção autorizado; nada foi aplicado lá agora.
- `scripts/preview-policy.mjs`: build e função gerada usam a mesma política. Preview consome os URLs Neon com prefixo do Marketplace, falha sem host, URL de banco, SESSION_SECRET próprio de pelo menos 32 caracteres e VERCEL_URL exata. Pooler e endpoint direto devem pertencer ao mesmo host canônico. Host vem do recurso segregado; não aceita URLs de banco compartilhadas.
- A política remove aliases de banco herdados, usa schema public/TLS e define origem/URL pública exclusivamente como `https://VERCEL_URL`, sem wildcard. O frontend continua com API na mesma origem. Cookies Secure/HttpOnly/SameSite e guard/CSRF existentes são preservados; runtime serverless não aplica migrations no startup. Fora do wrapper Vercel, a API ainda migra automaticamente ao iniciar; não iniciá-la com banco real sem revisão.
- No Preview, Gemini/Google ficam false e credenciais Gemini/Google, e-mail Brevo, push VAPID, dispatch e Blob são esvaziadas antes de carregar o backend. Avatar externo também é desabilitado. Não há scheduler criado; worker já não inicia na Vercel. Nenhuma mensagem/e-mail/push real enviado. Uploads ficam indisponíveis com erro de configuração, sem usar o Blob de produção; não são certificados como funcionais.
- `api/src/database/migrate.ts`: mensagem de conclusão agora se refere ao banco selecionado, sem anunciar produção em uma migração de homologação.

## Migrações e configuração pendentes

- Migrações novas do assistente (`1793923200000`) e Calendar (`1794009600000`) apenas criam tabelas/índices/vínculos. Migrações up anteriores criam tabelas/adicionam colunas; push também popula fila de lembretes de tarefas existentes. Nenhuma up destrutiva foi identificada; existem downs antigos com DROP COLUMN, que não serão executados.
- O conjunto realmente pendente depende do banco isolado escolhido: conferir ledger após provisionamento. Não copiar schema sem ledger de forma a reaplicar migrations em tabelas já existentes. Banco vazio com execução inicial integral é uma alternativa, sujeita à aprovação do recurso/cota.
- Variáveis no Preview: recurso Neon prefixado em escopo Preview (`COLABORA_PREVIEW_DATABASE_URL`, `_UNPOOLED`, host e aliases); `SESSION_SECRET` secret branch-specific. Política valida as conexões, converte a URL isolada para `DATABASE_URL` e apaga aliases/segredos prefixed herdados antes de carregar a API. DB_SSL/schema e WEB_ORIGIN/PUBLIC_APP_URL são definidos pela política. VITE_API_URL é fixado vazio no build para `/api`; sem secrets VITE_*.
- GEMINI_ENABLED=false e GOOGLE_ENABLED=false. Não cadastrar OAuth redirect URI, credenciais ou chave de cifra nesta execução. E-mail, push, dispatch e Blob desabilitados. Overrides branch-specific vazios devem substituir aliases/credenciais compartilhadas de produção no Preview, sem editar/remover valores Production. Nunca puxar todos os segredos de Production.
- URL Preview, HTTPS, permissões/proteção de acesso do deployment e fluxo Git precisam ser confirmados após o provisionamento. Código gera SPA fallback, `/api` e `/health`, função Node 24/gru1/60 s; artifact/deployment remoto não foi criado para confirmar esses parâmetros em execução.

## Validação executada agora

- Web: 116 testes / 20 suítes; API: 70 / 11 suítes; HTTP: 31 no PostgreSQL local descartável; cabeçalhos: 8; política Preview: 7. **232 testes passaram** (não reutiliza a contagem histórica como evidência atual).
- `npm run build` (web + API), lint web e API sem --fix, sintaxe dos scripts e diff check passaram. PostgreSQL de teste parado ao final. Nenhuma chave real nos testes.
- Testes Preview incluem rejeição de host divergente/UNPOOLED incorreta, segredo fraco, origem wildcard, limpeza de serviços e execução negativa do script de build: recusa antes de compilar, empacotar ou migrar, sem expor conexão sintética.
- Não foi executado build:vercel completo, instalação de dependências, deploy, migração Neon ou teste pós-deploy. O empacotamento completo e a inicialização remota permanecem pendentes; a sintaxe do wrapper foi revisada e os builds da aplicação passaram.

## Próxima decisão e recuperação

1. Conferir envs do novo resource no deployment; política deve aceitar apenas o endpoint `solitary-night` e credenciais dedicadas.
2. Commitar e enviar somente a branch `feat/colabora-evolucao`. Deploy via Vercel CLI em `preview`, sem `--prod`, promoção ou domínio principal. Revisar falhas e variáveis antes de executar migration.
3. Confirmar por consulta read-only que o banco é vazio e sem ledger. Aplicar migrations explícitas somente no banco isolado; depois publicar Preview e verificar health, auth/CSRF/cookies com conta descartável, SPA e serviços externos desabilitados.
4. Rollback: como não há deployment, não há publicação a reverter. Futuro rollback deve retirar apenas o Preview criado ou reutilizar um Preview conhecido do mesmo banco de teste; não promover para produção, reverter migrations ou apagar bancos. Mudanças aditivas podem permanecer até revisão. Encerrar recurso de teste/custo somente após identificar o recurso e obter autorização apropriada.

Riscos residuais: funcionalidades pendentes do roadmap, integrações reais não homologadas, CSP unsafe-inline, PDF ZAP ausente, empacotamento/runtime remoto ainda não validado. Não há aprovação de release nem teste pós-publicação.
