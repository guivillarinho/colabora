# Preview Vercel — auditoria e preparação

## 2026-11-06 — Atualização publicada e validada

**Preview validado:** https://colabora-ezi6vkrto-villarinhoguis-projects.vercel.app

- **Estado:** Ready; deployment `dpl_8HqEhfgowqK1PxBdvdg8wRnDiFSg`, código `9a7131ff3703733490f6d26d2e547e2b852d90c7`, branch `feat/colabora-evolucao`, projeto `villarinhoguis-projects/colabora`, runtime Node 24 / função em `gru1`. O deployment CLI adicional `dpl_5YnH7Qi6zBWmvXrtR2P12NnH8jXC` também ficou Ready com o mesmo código em `https://colabora-pi14qga72-villarinhoguis-projects.vercel.app`.
- **Acesso:** a proteção Vercel foi preservada (`ssoProtection.deploymentType=preview`). Acesso anônimo ao Preview retorna 302 para autenticação; usuários autorizados da Vercel podem abrir a URL. Nenhuma promoção de `main` ou mudança de proteção de produção. O alias existente `https://colabora-rouge.vercel.app` continua respondendo 200.
- **Git:** `dc3329f` (API), `fcce428` (interface), `f933263` (isolamento de Preview) e `9a7131f` (correção da CSP de uploads) enviados a `origin/feat/colabora-evolucao`. A integração Git automática está ativa: o Preview validado foi gerado pelo push de `9a7131f`. As notas abaixo sobre deploy Git desativado refletem a auditoria anterior; a integração não foi alterada nesta publicação. O commit posterior deste relatório altera somente documentação.
- **Interface entregue:** perfil e editor de foto reorganizados; tema rápido claro/escuro com opção sistema no perfil; paletas; criação agendada/cronometrada, gestos, detalhes, edição e horários de conclusão; avatares de responsáveis; anexos com progresso/cancelamento e referências recuperáveis.
- **Validação automática:** web 175 testes, API 89, HTTP isolado 34, política Preview 15 e cabeçalhos 9: **322 testes passaram**. Lint completo web/API e builds passaram. Foram corrigidos o retorno Promise do mock de exclusão Blob, uma variável sem uso em teste e a formatação pendente. Isso substitui, neste snapshot, as pendências anteriores de teste de avatar e lint.
- **Validação real no deployment:** página 200; `/health` 200 `status=ok`; tarefas sem sessão 401; cadastro, sessão, login/logout; envio e leitura de foto privada; exclusão confirmada da foto; criação de tarefa pela UI com envio/download real de anexo privado; leitura da foto do responsável pela rota da tarefa; conclusão com `completedAt`; criação/conclusão de tarefa cronometrada. Chromium em 390 px, sem respostas de API simuladas e sem exceções JS. A conta descartável, tarefas, uma linha de anexo e um Blob de teste foram removidos após a validação; a foto foi removida pelo próprio fluxo do app.
- **Correção encontrada na validação:** o SDK instalado usa `https://vercel.com/api/blob/` para uploads do navegador. A CSP anterior bloqueava esse caminho e deixava as tentativas do SDK pendentes. O commit `9a7131f` permite somente esse caminho específico, sem liberar toda a origem Vercel, e adiciona uma regressão para manter a restrição. O teste real no deployment corrigido confirmou foto e anexo persistidos.
- **Banco:** antes da migração, foi conferido o endpoint isolado `ep-frosty-queen-b6cbgymv.c-2.sa-east-1.aws.neon.tech`, database `neondb`. O ledger já continha `AttachmentContent1794096000000` e `TaskCompletion1794182400000` da outra branch. Aplicada somente a pendente `UserAvatar1794096000000`; ledger final com 11 migrations. Sem rollback, remoção de dados existentes ou alteração de banco de produção.
- **Armazenamento:** Blob `colabora-homologacao`, `store_bgt5sVs7oJQSLhu7`, privado em `gru1`, conectado apenas a Preview com prefixo `COLABORA_PREVIEW_BLOB`. O Blob anterior `store_YdwjyiYM9HOXM15Q` mantém sua conexão em Production/Preview, sem mudança. A conexão inicial padrão recusou a variável existente; a conexão final usa o prefixo separado.
- **Opt-in de uploads:** `COLABORA_PREVIEW_BLOB=true`, `COLABORA_PREVIEW_BLOB_STORE_ID` e `COLABORA_PREVIEW_BLOB_READ_WRITE_TOKEN` exclusivo. Build/runtime descartam o token Blob herdado e só selecionam o prefixado se o ID do token corresponder ao store aprovado. Flag/ID específicos da branch; token fornecido pela conexão do store em Preview. Valores de tokens nunca foram exibidos, versionados ou enviados como argumentos de shell.
- **Serviços e limites:** conta conferida no plano Hobby, sem upgrade; uso do Blob sujeito às [cotas incluídas da Vercel](https://vercel.com/docs/vercel-blob/usage-and-pricing). Gemini/Google continuam desligados; e-mail, push e dispatch sem credenciais no wrapper Preview. Nenhuma mensagem real enviada. A validação não certifica integrações externas desativadas, Safari/iOS ou vibração física.

## Registro do Preview anterior — 2026-11-05

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
- No Preview, Gemini/Google ficam desligados por padrão e credenciais Gemini/Google herdadas, e-mail Brevo, push VAPID, dispatch e Blob são esvaziadas antes de carregar o backend. A homologação opcional descrita no final deste arquivo é a única forma de religar texto Gemini e Calendar nesse ambiente. Avatar externo também é desabilitado. Não há scheduler criado; worker já não inicia na Vercel. Nenhuma mensagem/e-mail/push real enviado. Uploads ficam indisponíveis com erro de configuração, sem usar o Blob de produção; não são certificados como funcionais.
- `api/src/database/migrate.ts`: mensagem de conclusão agora se refere ao banco selecionado, sem anunciar produção em uma migração de homologação.

## Migrações e configuração confirmadas

- Migrações novas do assistente (`1793923200000`) e Calendar (`1794009600000`) apenas criam tabelas/índices/vínculos. Migrações up anteriores criam tabelas/adicionam colunas; push também popula fila de lembretes de tarefas existentes. Nenhuma up destrutiva foi identificada; existem downs antigos com DROP COLUMN, que não serão executados.
- Ledger do banco isolado contém 8 migrations após bootstrap inicial; não copiar schema sem ledger nem reaplicar migrations manualmente.
- Variáveis no Preview: recurso Neon prefixado em escopo Preview (`COLABORA_PREVIEW_DATABASE_URL`, `_UNPOOLED`, host e aliases); `SESSION_SECRET` secreto no Preview geral e override branch-specific, ambos próprios e aleatórios. O deployment CLI não possui metadados Git. Política valida as conexões, converte a URL isolada para `DATABASE_URL` e apaga aliases/segredos prefixados herdados antes de carregar a API. DB_SSL/schema e WEB_ORIGIN/PUBLIC_APP_URL são definidos pela política. VITE_API_URL é fixado vazio no build para `/api`; sem secrets VITE_*.
- No deployment já publicado, GEMINI_ENABLED=false e GOOGLE_ENABLED=false. Sem OAuth redirect URI, credenciais ou chave de cifra. E-mail, push, dispatch e Blob desabilitados pelo wrapper. Variáveis Production/Preview compartilhadas permanecem configuradas no Vercel, mas a política limpa essas credenciais antes de carregar build/runtime Preview; nenhum valor de Production foi baixado. Flags de opt-in não estavam definidas nesse deployment.
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

## Homologação opcional — Gemini texto e Google Calendar

O Preview publicado acima continua com as duas integrações desligadas. Um Preview futuro pode ligá-las sem alterar Production:

- Ausência das flags, ou qualquer valor que não seja exatamente `true`, mantém `GEMINI_ENABLED=false` e `GOOGLE_ENABLED=false` e apaga credenciais `GEMINI_*` / `GOOGLE_*` herdadas. Blob, Brevo, VAPID e o segredo de dispatch continuam vazios.
- Gemini texto: no escopo Preview da Vercel, `COLABORA_PREVIEW_GEMINI=true` e `COLABORA_PREVIEW_GEMINI_API_KEY`. A política copia a chave para `GEMINI_API_KEY` e remove o nome prefixado. Não há entrada de áudio ou imagem; a CSP segue com `microphone=()`.
- Google Calendar: `COLABORA_PREVIEW_GOOGLE=true` mais `COLABORA_PREVIEW_GOOGLE_CLIENT_ID`, `COLABORA_PREVIEW_GOOGLE_CLIENT_SECRET` e `COLABORA_PREVIEW_GOOGLE_TOKEN_ENCRYPTION_KEY` (32 bytes em base64, distinta de `SESSION_SECRET`). O callback gravado é sempre `https://$VERCEL_URL/api/google/callback`. Um redirect diferente faz o build falhar. Cadastre essa URL exata no cliente OAuth de teste e abra esse deployment, não outro alias.
- Build com `VERCEL_ENV=production` e `GEMINI_ENABLED=true` para antes de compilar. Google Agenda pode ser ativado em Production com credenciais e callback validados, conforme `hospedagem.md`. As flags `COLABORA_PREVIEW_*` não têm efeito fora de Preview.
- Nenhuma chave real foi gravada neste repositório e nenhuma chamada a Gemini ou Google foi feita. A prova com conta de teste fica para um Preview autorizado, separada dos mocks.
