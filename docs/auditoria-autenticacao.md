# Autenticação, autorização e segurança do Colabora

## A. Diagnóstico antes da implementação

Data: 1 de novembro de 2026. Repositório limpo no início.

## Estrutura verificada

- API: NestJS 11.2.8, Express, TypeScript 5.9.3, PostgreSQL 17 e TypeORM 0.3.31.
- Front: React 19.3.1, Vite 8.3.5, TypeScript 5.9.3, Context API e navegação por estado.
- npm com lockfiles separados na raiz, API e front. Node local 26.13.0; produção configurada para Node 24.
- Módulos tasks, agenda e focus-sessions; DTOs class-validator/class-transformer e ValidationPipe com whitelist e rejeição de campos extras.
- Produção: front e API no mesmo domínio, Vercel Authentication em todos os deployments, Neon e Blob privado. A barreira da Vercel não implementa propriedade por usuário na aplicação.
- Migração inicial versionada, execução com trava no build e synchronize desligado em produção.
- Interface, gestos, diálogos, formulários nativos, cliente HTTP de tarefas e componentes de teste reutilizáveis.

## Riscos encontrados

- Não existem usuários, login, sessões, guards ou relações de propriedade.
- Tarefas, agenda e foco são consultados globalmente; IDs permitem modificar dados de qualquer visitante autorizado pela Vercel.
- Uploads privados não verificam propriedade; no desenvolvimento os arquivos são servidos por middleware estático.
- Não existe proteção CSRF, rate limiting persistente, Helmet ou limpeza de dados na troca de usuário.
- Clientes HTTP duplicados, sem tratamento comum de expiração; identidade visual fixa de Guilherme.
- Teste E2E anterior usa AppModule sem isolamento explícito de banco.
- Antes de alterar: API 22 testes passaram; front 26 passaram. Lint: API 9 erros; front 41 erros e 1 aviso.
- npm audit inicial: API 52 alertas (13 altos); front 50 (11 altos), incluindo ferramentas de desenvolvimento. Será feita nova auditoria depois das correções.

## Decisões

1. Preservar NestJS 11. `@nestjs/authentication` 0.1.2 exige peers NestJS 12 e exporta ESM; não será forçada a atualização do framework.
2. Usar Passport integrado ao Nest, express-session, connect-pg-simple e Argon2id. Sessões compartilhadas no PostgreSQL, expiração absoluta e por inatividade, revogação efetiva e cookies HttpOnly.
3. Guards no servidor; acesso a tarefas somente ao criador ou responsável. Edição, exclusão e reatribuição exclusivas do criador. Agenda, foco e arquivos também recebem propriedade.
4. Centralizar HTTP e proteger o shell inteiro durante verificação da sessão. Manter Context, navegação existente e formulários nativos; não instalar Router, Query, RHF ou Zod só para substituir estruturas que já atendem ao fluxo.
5. Manter dados antigos sem proprietário isolados até uma vinculação administrativa explícita. Nunca conceder dados antigos ao primeiro cadastro.
6. Não inventar recuperação de senha/verificação de e-mail sem infraestrutura de envio. Documentar a pendência.
7. Testar endpoints HTTP reais com PostgreSQL exclusivo de testes; não executar testes nem resetar dados de produção.

## Referências consultadas

- https://docs.nestjs.com/recipes/passport
- https://docs.nestjs.com/http/session
- Metadados do npm de @nestjs/authentication 0.1.2 (peers e exports).
- https://github.com/voxpelli/node-connect-pg-simple
- https://github.com/ranisalt/node-argon2
- https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html


## B. Alterações realizadas

### Backend

- Novo módulo global `auth`: cadastro, login, logout, usuário atual, serializer Passport, guard global, decoradores de identidade/rotas públicas, DTOs, busca limitada de usuários e limitação persistente de tentativas.
- `bootstrap.ts`: prefixo `/api` (health preservado), sessão PostgreSQL, Passport, Helmet, CORS com credenciais e origens explícitas, cache privado e filtro de erros sem stack/SQL/credenciais.
- `tasks`: `createdById` e `assignedToId`, consultas já filtradas por acesso, respostas com nomes públicos e permissões, validação de responsável, escrita explícita de campos, endpoints de status e verificações do criador. Atualizações de status incluem propriedade no critério de escrita para cobrir reatribuição concorrente.
- `agenda` e `focus-sessions`: propriedade em todas as consultas e escritas. Índice único de foco ativo por usuário e resposta 409 também para início concorrente.
- Anexos: registro de propriedade, referências validadas, autorização antes de download, herança de leitura pela tarefa atribuída e perda de acesso após reatribuição. Middleware estático público removido. Tokens de upload Blob limitados a caminho do usuário, tamanho e duração; quota antes da escrita multipart local. Download define MIME pelo servidor, sem confiar no MIME do upload, com `nosniff`.
- Migração `1793534400000-user-security.ts`: tabelas `users`, `app_sessions`, `revoked_sessions`, `auth_rate_limits`, `attachments`; FKs, índices e novas colunas de propriedade. Migração aditiva e transacional; `synchronize: false` em todos os ambientes. Reversão automática destrutiva recusada.
- `database/assign-legacy.ts`: vinculação administrativa explícita em transação, validação conjunta de ID e e-mail, somente registros sem dono, repetição idempotente e cadastro das referências de anexos históricos. Nenhum dado antigo é concedido no cadastro.

### Frontend

- `AuthProvider` e `AuthGate` verificam `/api/auth/me` antes de renderizar dados privados. Login/cadastro usam componentes existentes e validação nativa; página de conta permite logout.
- Cliente HTTP único: cookies, CSRF em memória, erros 401/403, rejeições tratadas nas ações, cancelamento de carregamentos e proteção contra respostas antigas invalidarem uma sessão nova. Um GET de CSRF pode ser repetido após expiração; mutations não são repetidas automaticamente.
- Na expiração/logout/troca de conta, o shell privado é desmontado e os providers são recriados por ID de usuário. `BroadcastChannel` comunica somente mudança de sessão entre abas, sem dados pessoais; `X-Session-User` rejeita operação de uma aba vinculada à conta anterior, sem servir como autenticação.
- Formulário de tarefas ganhou responsável (para mim, sem responsável ou busca limitada). Cards mostram criador/responsável e ocultam edição/exclusão quando não autorizadas. O servidor verifica novamente todas as ações.
- Mantidos Context, navegação, componentes, gestos, confirmação de exclusão, PDF, mapa e formulários existentes. Ajustes de formatação corrigiram falhas prévias do lint sem desligar regras.

### Dependências e decisões

Adicionadas na API: `@nestjs/passport`, `passport`, `express-session`, `connect-pg-simple`, `argon2`, `helmet` e tipos correspondentes. Nenhuma biblioteca nova no front. Não foram adicionados Redis, JWT, Router, Query, RHF ou Zod para substituir estruturas funcionais.

A preferência por `@nestjs/authentication` foi avaliada: a versão consultada 0.1.2 exige NestJS 12 e ESM. Manter NestJS 11 com Passport evita uma atualização estrutural sem necessidade. Mantidas versões CommonJS compatíveis de mapped-types/class-validator para o empacotamento existente.

Atualizações compatíveis dos lockfiles e overrides corrigem os avisos altos de Multer, Zod transitivo da Vercel e minimatch 9. O override de minimatch fica na própria série 9. Nenhum `audit fix --force`, downgrade do lint ou atualização do framework para outra major foi aplicado.

## C. Segurança e limites

### Senhas e sessões

- Argon2id: memória 19 MiB, duas iterações, paralelismo 1; salt gerenciado pela biblioteca. Hash não selecionado por padrão e nunca retornado. `needsRehash` atualiza parâmetros no login quando necessário.
- Erro idêntico para senha inválida/usuário inexistente; conta inexistente também verifica hash fictício. Cadastro duplicado retorna mensagem genérica, sem detalhes de constraints.
- Cookie `__Host-colabora.sid` em produção: HttpOnly, Secure, SameSite=Lax, Path=/, sem Domain. Desenvolvimento: `colabora.sid`, HTTP local permitido. Nada de sessão/senha em localStorage ou sessionStorage.
- Store compartilhada no PostgreSQL, 30 minutos por inatividade e 168 horas absolutas por padrão. Cookie renovável limitado ao tempo absoluto restante. Identificador e CSRF rotacionados no login.
- Logout destrói a sessão e mantém tombstone SHA-256 do identificador até o limite absoluto. Assim, uma gravação de requisição já em andamento não reativa um cookie revogado. Login, expiração e troca de conta também revogam o identificador anterior.
- Metadados de sessão, revogação e rate limit expirados são limpos em lotes de até 100 por tabela nas operações limitadas, sem timers incompatíveis com serverless. A limpeza não toca usuários/tarefas/agenda/foco.

### Permissões

| Recurso/ação | Criador da tarefa | Responsável | Terceiro |
| --- | --- | --- | --- |
| Listar e ler tarefa | Sim | Sim | 404 / ausente da lista |
| Editar, atribuir e excluir | Sim | 403 | 404 |
| Iniciar, alterar status e concluir | Sim | Sim | 404 |
| Ler anexo vinculado | Sim | Enquanto tiver acesso à tarefa | 404 |

Agenda e foco são privados por dono. E-mail somente aparece no perfil da própria conta. Busca de responsáveis exige 3–254 caracteres, retorna até 10 nomes/IDs e limita 30 consultas/minuto/usuário; e-mail só é comparado por igualdade. Os campos de propriedade nunca são aceitos do cliente.

### Proteções

- Guard global aplica autenticação em todos os módulos, inclusive arquivos. Só health, preparação de CSRF, login e cadastro são públicos; login/cadastro também exigem CSRF.
- Token sincronizador de sessão, comparação em tempo constante, Origin exata e rejeição de `Sec-Fetch-Site: cross-site`. Cookies SameSite complementam essa proteção.
- Rate limit atômico compartilhado por instâncias: login por IP e e-mail, cadastro/CSRF por IP, busca de usuários e uploads por usuário. Identificadores de rate limit são HMAC, sem e-mails/IPs em texto puro na tabela.
- DTOs rejeitam campos extras e entradas inválidas; IDs UUID; campos atualizáveis enumerados explicitamente. SQL parametrizado e buscas com curingas escapados. Recursos alheios retornam 404.
- Helmet, `private, no-store`, `nosniff`, filtro seguro de exceções, CSP no front publicado e headers de privacidade. CSP mantém inline styles por compatibilidade com os componentes; não permite inline scripts. Os únicos hosts externos de conexão são mapa e Blob.
- Não há redirecionamento externo de login: somente seções locais conhecidas. Não há HTML de usuário inserido por `dangerouslySetInnerHTML` nos fluxos adicionados.

### Riscos residuais

A auditoria de dependências não está zerada: os alertas baixos/moderados estão discriminados abaixo. Sem alertas altos/críticos na auditoria final. Sessões roubadas continuam válidas até revogação/expiração; HTTPS, HttpOnly, CSP e TTL reduzem o risco, não o eliminam. Não foram implementados MFA, painel de sessões ou revogação de todas as sessões.

Cadastro sem verificação de e-mail não comprova titularidade. A busca de responsáveis permite descoberta limitada de nomes por finalidade de atribuição; não é um diretório público, mas exige monitoramento caso o cadastro seja aberto em escala. A Vercel Authentication deve permanecer ativa durante a transição pessoal. Anexos não passam por antivírus e não há quota total de armazenamento por conta; existem restrições de extensão/tamanho e frequência. Arquivos enviados e não vinculados podem ocupar cota até limpeza administrativa; não são expostos a terceiros.

## D. Validações executadas

Resultados finais em ambiente local, com fixtures e banco exclusivos. Nenhuma suíte foi executada contra produção ou contra registros pessoais.

| Categoria | Comando (a partir da raiz, salvo indicação) | Resultado |
| --- | --- | --- |
| Lint front/API | `npm run lint` | Passou; sem desativar regras |
| Tipos front | `npm --prefix web run build` (`tsc -b`) | Passou |
| Tipos completos API, incluindo testes | na pasta api: `node node_modules/typescript/bin/tsc --noEmit` | Passou |
| Testes de interface/HTTP client | `npm --prefix web run test -- --runInBand` | 44 testes, 10 suítes, zero falhas |
| Unitários da API | `npm --prefix api run test -- --runInBand` | 23 testes, 6 suítes, zero falhas |
| Integração/E2E com PostgreSQL | `npm --prefix api run test:e2e -- --runInBand` | 24 testes, 1 suíte, zero falhas |
| Build front/API | builds individuais e `npm run build:vercel` | Passaram |
| CommonJS e módulo nativo Argon2 | Node com `--no-experimental-require-module`, require do bootstrap, hash + verify | Passou no Node local 26.13.0 |
| Espaços/conflitos | `git diff --check` | Passou |

Total: **91 testes aprovados**, sem skips ou regras de segurança desativadas. O empacotamento gera uma função de API e front estático; não equivale a teste de deployment Linux/Node 24 nem a publicação na Vercel.

### Cobertura HTTP real

Cadastro válido/inválido/duplicado, hashing, login correto/incorreto/inexistente, rotação, sessões concorrentes, sessão compartilhada entre duas instâncias, cookie inválido, expiração idle/absoluta, logout e tentativa de ressuscitar sessão revogada, troca de usuário, cookies Secure/__Host por proxy HTTPS simulado, CSRF ausente/estrangeiro/malformado, status, rate limit, diretório limitado e corpo malicioso.

O ciclo A/B/C valida criação, ocultação inicial, atribuição, alteração de status pelo responsável, bloqueio de edição/exclusão/reatribuição do responsável, reatribuição e perda imediata de acesso. Testa listagens, IDs diretos, campos de dono forjados, agenda/foco privados, anexo compartilhado e reassociação. Migração sobre tabela já populada preserva a tarefa antiga; vinculação administrativa exige correspondência ID/e-mail e é idempotente. Há testes de foco concorrente e limpeza somente de metadados expirados.

A suíte usa PostgreSQL 17 na porta 55432, aceita apenas host local e banco `colabora_test`, cria schema aleatório e remove exclusivamente esse schema no teardown. Uploads de teste usam diretório temporário exclusivo. `docker-compose.test.yml` usa tmpfs, sem volume dos dados do projeto. Playwright não existia; foram ampliados Jest/Testing Library e o E2E HTTP real em vez de adicionar outro runner. Não foi executado um fluxo manual completo em navegador com banco de produção.

### Falhas encontradas e corrigidas

- Lint já falhava antes das mudanças: corrigidos os pontos necessários e a formatação sem relaxar configuração.
- E2E de vinculação revelou que `UPDATE RETURNING` do driver retorna tupla `[linhas, quantidade]`; corrigida a contagem reportada, mantendo a transação/idempotência.
- Verificação completa de tipos encontrou inferência circular em mock de repository e tipagem incorreta do header `set-cookie`; mocks e normalização do header corrigidos, não excluídos da checagem.
- Chamada inicial de teste na raiz com `--runInBand` encaminhou flag ao npm de forma inválida. Corrigido o comando: `npm run test` na raiz ou flags após `--` dentro de cada pacote. As execuções finais passaram.
- Auditoria automática tentou escolher versões incompatíveis de dependências. Mantidos NestJS 11 e Multer 2, com correções compatíveis e novas execuções dos testes.

### Auditoria de dependências

Comandos executados em raiz, api e web: `npm audit --json`; também `npm audit --omit=dev --json` nos dois pacotes. npm audit encerra com status não zero quando há alertas; isso não foi tratado como uma auditoria limpa.

| Escopo final | Baixos | Moderados | Altos | Críticos |
| --- | --- | --- | --- | --- |
| Raiz | 0 | 0 | 0 | 0 |
| API completa | 3 | 43 | 0 | 0 |
| Front completo | 4 | 42 | 0 | 0 |
| API, omitindo dev | 0 | 3 | 0 | 0 |
| Front, omitindo dev | 2 | 4 | 0 | 0 |

Os números contam pacotes afetados na árvore, não vulnerabilidades independentes. Inicialmente havia 13 alertas altos na API e 11 no front.

- API distribuída: TypeORM → glob/minimatch. [GHSA-3g3m-2fjr-6pw4](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4), [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249). A aplicação fornece classes de entidades/migrações e não padrões glob controlados pelo usuário; não expõe esse processamento pela API. A correção sugerida requer mudança major de TypeORM e não foi forçada nesta entrega.
- Front: shadcn/registry/ts-morph/minimatch e deepmerge ([GHSA-gcqx-w48m-w2h4](https://github.com/advisories/GHSA-gcqx-w48m-w2h4)). São ferramentas de geração declaradas em dependencies no projeto; não são importadas pelo front executado no navegador. Mantida a classificação honesta de `--omit=dev`, sem apresentá-la como prova de exposição no bundle.
- Demais alertas completos pertencem principalmente à árvore de lint/build. Não executar ferramentas de geração com registros remotos não confiáveis. A manutenção dessas árvores continua necessária; o override compatível de minimatch 9 corrigiu os ReDoS de severidade alta.

## E. Configuração e operação

### Desenvolvimento

Copiar exemplos de ambiente apenas se ainda não existirem (não sobrescrever `.env` usado). Preencher `SESSION_SECRET` com valor aleatório de pelo menos 32 caracteres; o exemplo não contém segredo real. Gerar com `crypto.randomBytes(48).toString('hex')` em ambiente local confiável e guardar no arquivo ignorado. O `.env` local recebeu um segredo gerado sem expor seu valor nesta entrega.

Manter PostgreSQL e executar `npm run dev:api` / `npm run dev:web`. A API aplica as migrações pendentes ao iniciar localmente. Front/API locais devem usar o mesmo hostname (`localhost` nos exemplos); HTTP com cookie de produção não é suportado.

| Variável do servidor | Padrão / finalidade |
| --- | --- |
| `SESSION_SECRET` | Obrigatória, segredo aleatório, somente servidor |
| `SESSION_IDLE_MINUTES` | 30; aceita 1 a 1440 minutos |
| `SESSION_ABSOLUTE_HOURS` | 168; pelo menos idle, até 720 horas |
| `AUTH_LOGIN_LIMIT` | 10 por e-mail a cada 15 minutos |
| `AUTH_IP_LIMIT` | 30 logins/IP a cada 15 minutos |
| `AUTH_REGISTER_LIMIT` | 10 cadastros/IP a cada 15 minutos |
| `AUTH_CSRF_LIMIT` | 60 preparações de sessão/IP/minuto |
| `WEB_ORIGIN` | Origem exata do front para requests com credenciais e CSRF |
| `DATABASE_URL` ou `DB_HOST/PORT/USER/PASSWORD/NAME` | PostgreSQL existente |
| `DATABASE_URL_UNPOOLED` | Conexão direta opcional para migrações/vinculação |
| `DB_SSL` | `true` com validação de certificado quando exigido pelo provedor |
| `DB_POOL_SIZE` | 5 para ORM; store de sessão usa mais 2 conexões por instância |
| `DB_SCHEMA` | `public`; schema validado para isolamento local dos testes |
| `BLOB_READ_WRITE_TOKEN` | Somente servidor, armazenamento privado na Vercel |
| `UPLOADS_DIRECTORY` | Pasta privada local para anexos fora da Vercel |

As variáveis `VITE_*` não podem conter senhas/chaves. O build Vercel fixa API na mesma origem (`/api`) e habilita upload direto privado. A sessão não usa token Bearer persistido no navegador. CORS não substitui autenticação.

### Produção e registros antigos

Antes do próximo deploy, configurar `SESSION_SECRET` na Vercel nos ambientes usados, manter Neon/Blob privados e Vercel Authentication. O build executa migrations com advisory lock e para se falta configuração. Não alterar `synchronize` para contornar falhas.

Depois de publicada a versão e criada a conta legítima, confirmar seu ID e e-mail com o dono, então usar o comando administrativo em [hospedagem.md](hospedagem.md#transição-dos-dados-antigos). O e-mail de destino informado pelo proprietário nesta conversa não foi gravado no repositório. A vinculação de dados reais não foi executada. Não conceder registros antigos automaticamente, nem presumir verificação de e-mail inexistente.

Não são necessários serviços pagos novos: usa PostgreSQL, Vercel e Blob já existentes. Cotas gratuitas continuam aplicáveis. Conferir publicação no painel e validar cookies HTTPS no dispositivo real depois do rollout.

## F. Pendências e estado da entrega

1. **Código implementado e validado localmente; sem commit/push/deploy desta etapa.** A versão de produção ainda depende de configurar o segredo, publicar e validar HTTPS real. O teste local de proxy não é prova de comportamento da infraestrutura publicada.
2. **Dados antigos preservados e não vinculados em produção.** Falta a conta real de destino e a conferência administrativa do ID para executar a vinculação solicitada. Não foram apagados nem alterados dados reais para testes.
3. **Recuperação de senha e verificação de e-mail pendentes:** não existe infraestrutura de envio. Não foram criados endpoints/tokens ou telas incompletos. Não é seguro oferecer recuperação fictícia; até configurar envio, manter acesso pessoal protegido.
4. **Dependências baixas/moderadas:** conforme auditoria; atualização major do ORM e manutenção da cadeia de ferramentas exigem trabalho separado. Não há alerta alto/crítico na auditoria final.
5. **Teste manual pós-publicação:** confirmar login/logout, permanência nos dispositivos reais, cota Blob e acesso aos anexos históricos. Arquivos locais não são enviados automaticamente para a nuvem. O pacote foi construído localmente, sem comprovar runtime Linux/Node 24 na Vercel.

## Inventário dos arquivos desta entrega

Arquivos criados (incluindo este relatório):

```text
api/src/database/assign-legacy.ts
api/src/database/migrations/1793534400000-user-security.ts
api/src/database/schema.ts
api/src/modules/agenda/attachments.service.ts
api/src/modules/agenda/entities/attachment.entity.ts
api/src/modules/agenda/upload-quota.guard.ts
api/src/modules/auth/auth.controller.ts
api/src/modules/auth/auth.decorators.ts
api/src/modules/auth/auth.guard.ts
api/src/modules/auth/auth.module.ts
api/src/modules/auth/auth.service.ts
api/src/modules/auth/auth.types.ts
api/src/modules/auth/dto/auth.dto.ts
api/src/modules/auth/entities/user.entity.ts
api/src/modules/auth/rate-limit.service.ts
api/src/modules/auth/session-infrastructure.ts
api/src/modules/auth/session-settings.ts
api/src/modules/auth/session.serializer.ts
api/src/modules/auth/users.controller.ts
api/src/modules/auth/users.service.ts
api/src/safe-exception.filter.ts
docker-compose.test.yml
docs/auditoria-autenticacao.md
web/src/features/auth/account-page.tsx
web/src/features/auth/auth-api.ts
web/src/features/auth/auth-context.tsx
web/src/features/auth/auth-flow.test.tsx
web/src/features/auth/auth-gate.tsx
web/src/features/auth/auth-page.tsx
web/src/features/tasks/components/assignee-field.tsx
web/src/features/tasks/components/assignment.test.tsx
web/src/features/tasks/components/task-people.tsx
web/src/lib/http-client.test.ts
web/src/lib/http-client.ts
web/src/test/auth-fixture.tsx
```

Arquivos modificados:

```text
README.md
api/.env.example
api/package-lock.json
api/package.json
api/src/app.controller.ts
api/src/app.module.ts
api/src/bootstrap.ts
api/src/database/database.module.ts
api/src/database/migrate.ts
api/src/modules/agenda/agenda-files.controller.spec.ts
api/src/modules/agenda/agenda-files.controller.ts
api/src/modules/agenda/agenda.controller.ts
api/src/modules/agenda/agenda.module.ts
api/src/modules/agenda/agenda.service.spec.ts
api/src/modules/agenda/agenda.service.ts
api/src/modules/agenda/entities/agenda-item.entity.ts
api/src/modules/focus-sessions/entities/focus-session.entity.ts
api/src/modules/focus-sessions/focus-sessions.controller.ts
api/src/modules/focus-sessions/focus-sessions.service.spec.ts
api/src/modules/focus-sessions/focus-sessions.service.ts
api/src/modules/tasks/dto/complete-task.dto.ts
api/src/modules/tasks/dto/create-task.dto.ts
api/src/modules/tasks/dto/update-task.dto.ts
api/src/modules/tasks/entities/task.entity.ts
api/src/modules/tasks/tasks.controller.ts
api/src/modules/tasks/tasks.module.ts
api/src/modules/tasks/tasks.service.spec.ts
api/src/modules/tasks/tasks.service.ts
api/test/app.e2e-spec.ts
docs/hospedagem.md
scripts/build-vercel.mjs
web/package-lock.json
web/package.json
web/src/components/delete-confirmation-dialog.tsx
web/src/components/layout/app-shell.tsx
web/src/components/layout/navigation.tsx
web/src/features/dashboard/agenda-page.test.tsx
web/src/features/dashboard/agenda-page.tsx
web/src/features/dashboard/components/task-timeline.tsx
web/src/features/dashboard/upload-agenda-files.ts
web/src/features/tasks/api/tasks-api.ts
web/src/features/tasks/components/task-board.test.tsx
web/src/features/tasks/components/task-board.tsx
web/src/features/tasks/components/task-card.test.tsx
web/src/features/tasks/components/task-card.tsx
web/src/features/tasks/components/task-form-dialog.tsx
web/src/features/tasks/tasks-context.tsx
web/src/features/tasks/types/task.ts
web/src/features/timer/focus-sessions-api.ts
web/src/features/timer/timer-page.tsx
web/src/main.tsx
```
