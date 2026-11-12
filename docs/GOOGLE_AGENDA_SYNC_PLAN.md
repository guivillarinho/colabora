# Google Agenda — sincronização bidirecional

Este documento é a referência da evolução da E12. A E12 original vincula a conta Google no perfil e envia, sob confirmação, uma tarefa para um evento do calendário principal. A evolução mantém esse vínculo e acrescenta sincronização automática nos dois sentidos, com as decisões abaixo.

## Decisões

- Tarefas com prazo usam a **Google Tasks API**. Eventos e projetos da agenda usam **Calendar Events**.
- Alterações feitas no Google Agenda chegam por **watch channel** e webhook. A Tasks API não oferece push; alterações de tarefas são lidas por **poll** (`updatedMin`).
- A sincronização automática começa **desligada** (`autoSync` e `inboundEnabled` falsos). Quem já usa o envio manual não passa a exportar tudo ao reconectar. A pessoa liga as opções no perfil.
- Tokens continuam só no servidor, cifrados com AES-256-GCM. A interface recebe e-mail, status, preferências e o estado dos vínculos, nunca o refresh token.
- Eventos do Google sem a marca privada do Colabora não são importados. Isso evita copiar a agenda inteira para o aplicativo.
- Desconectar revoga o refresh token e apaga vínculos, canais e a fila local. Eventos e tarefas que já estão no Google permanecem lá.
- Tarefa sem `dueDate` não é exportada.

## Escopos OAuth

`openid`, `email`, `https://www.googleapis.com/auth/calendar.events` e `https://www.googleapis.com/auth/tasks`.

Quem vinculou a conta com o escopo antigo `calendar.events.owned` precisa desconectar e vincular de novo. O callback recusa o código quando falta Tasks ou Calendar.

## Banco

Migração aditiva `1795000000000-google-sync-v2.ts`. Sem rollback automático.

`google_connections` ganha `preferences`, `tasksPolledAt` e `lastError`. `status` continua `connected`, `reconnect` (token expirado ou revogado) e `disconnecting`.

`google_sync_links` guarda o par Colabora/Google:

- `entityType`: `task` ou `agenda_item`
- `googleKind`: `task` ou `event`
- `googleResourceId`, `googleCalendarId`, `googleEtag`
- `colaboraRevision`, `syncedAt`, `syncState` (`synced`, `pending`, `error`, `conflict`)

Não há chave estrangeira para `tasks` nem `agenda_items`. O vínculo precisa sobreviver à exclusão local o tempo suficiente para apagar o recurso no Google. `ownerId` continua em cascata com o usuário.

Linhas antigas de `google_calendar_sync` são copiadas como `googleKind = event` e `syncState = pending`. No próximo envio automático o evento legado vira uma Google Task e o evento é removido.

`google_watch_channels` guarda canal, `resourceId`, segredo, expiração e `syncToken` do calendário.

`google_sync_outbox` é a fila durável (`operation`, `payload`, `attempts`, `nextAttemptAt`) para a função da Vercel não perder um push se a chamada ao Google falhar.

## API

| Método | Caminho | Acesso |
|--------|---------|--------|
| existentes | `/api/google/status`, `connect`, `callback`, `disconnect`, `sync` | sessão; mutações com CSRF |
| `PATCH` | `/api/google/preferences` | sessão + CSRF |
| `GET` | `/api/google/calendars`, `/api/google/tasklists` | sessão |
| `POST` | `/api/google/webhook/calendar` | público, sem CSRF; valida o token do canal |
| `POST` | `/api/google/jobs/tick` | público de máquina; `Authorization: Bearer` com `CRON_SECRET` ou `REMINDER_DISPATCH_SECRET` |

`POST /api/google/sync` permanece para o envio manual de uma tarefa como evento. A sincronização automática não depende dele.

Serviços:

- `GoogleService` — OAuth, cifra, status, desconexão, envio manual e access token em memória.
- `GoogleTasksClient` / `GoogleCalendarClient` — REST com `fetch`.
- `GoogleSyncOrchestrator` — preferências, fila e push de tarefas, eventos e projetos.
- `GoogleInboundService` — webhook, sync incremental do calendário e poll de tarefas.
- `GoogleSyncWorker` — drena a fila. Fora da Vercel usa um intervalo; na Vercel o cron chama `/api/google/jobs/tick`.

### App para o Google

Depois do commit, `TasksService` e `AgendaService` pedem um item na fila. O worker só publica se `autoSync` estiver ligado e a conexão `connected`.

| Colabora | Google Tasks |
|----------|----------------|
| título | `title` |
| descrição | `notes`, com marca `[colabora:id]` |
| `dueDate` | `due` |
| concluída | `status=completed` |
| categoria | lista via `task_categories.googleListId` (1:1); legado `categoryTaskListMap` só migração |

Eventos e projetos viram eventos com início, fim, local, descrição e `extendedProperties.private.colaboraEntityId` / `colaboraEntityType`. O id do evento é o SHA-256 de `colabora:{usuário}:{id}`, o mesmo critério estável da E12. A cor pastel vira um `colorId` do Google quando existe correspondência.

Falha de rede ou HTTP deixa a linha na fila com backoff. A resposta da API do Colabora continua sendo o sucesso da gravação local. O perfil mostra `pending` ou `error`.

`PATCH /api/agenda-items/:id` existe para a volta do Google e para edição local. O campo opcional `syncOptOut` nos formulários evita enfileirar aquela gravação.

### Google para o app

O webhook responde na hora. `sync` (confirmação do canal) não baixa eventos. `exists` enfileira `pull-calendar`. O processamento incremental usa `syncToken`. Evento cancelado remove o item local se houver vínculo. Evento ou tarefa criados no Google, mesmo sem marca Colabora, entram na agenda e nas tarefas locais (janela recente de calendário na sincronização manual e na abertura de Hoje). A sincronização manual liga a entrada automática.

Conflito: se o Colabora e o Google mudaram desde `colaboraRevision` / `syncedAt`, com folga de 5 segundos, o vínculo fica `conflict` e nenhum lado é sobrescrito. Não há tela de resolução nesta entrega.

Tarefas: a cada `GOOGLE_TASKS_POLL_INTERVAL_MS` (padrão 120000) o worker enfileira `pull-tasks` para conexões com `inboundEnabled`. A interface avisa que a volta das Google Tasks pode levar cerca de dois minutos.

Canais expiram em cerca de sete dias. O worker renova os que vencem em menos de um dia quando `GOOGLE_WEBHOOK_URL` está definida. Há um canal por calendário e usuário.

## Interface

No perfil, a seção Google Agenda mostra Conectado, Desconectado, Reconectar (token expirado) e Revogação pendente. Dá para ligar a sincronização automática e a recepção das alterações do Google, escolher o calendário padrão e mapear cada categoria a uma lista de tarefas. A lista recente mostra `synced`, `pending`, `error` e `conflict`.

Os formulários de tarefa e de agenda avisam quando a conta está ligada e oferecem “Não sincronizar desta vez”.

## Variáveis

Além das da E12:

- `GOOGLE_WEBHOOK_URL` — HTTPS público de `/api/google/webhook/calendar`
- `GOOGLE_TASKS_POLL_INTERVAL_MS` — intervalo local do poll
- `CRON_SECRET` — alternativa a `REMINDER_DISPATCH_SECRET` para `/api/google/jobs/tick`

Sem `GOOGLE_WEBHOOK_URL` o push de calendário não abre canal. O envio Colabora → Google continua possível.

## Homologação (não executada contra o Google real)

1. Projeto Cloud com Calendar API e Tasks API. Tela de consentimento com os quatro escopos. Cliente Web com o redirect exato.
2. Conta de teste: vincular, ver o e-mail, desligar e religar a sincronização automática.
3. Criar, editar e excluir tarefa com prazo e conferir a Google Task. Repetir com evento e projeto no calendário.
4. Expor o webhook (túnel ou Preview) e editar o evento no Google. O Colabora deve acompanhar. Editar a mesma tarefa dos dois lados em seguida deve marcar `conflict`.
5. Revogar o acesso na conta Google e confirmar o estado Reconectar, sem vazar token na interface nem nos logs.
6. Desconectar e confirmar que o remoto permanece e que o Colabora esquece canal, fila e vínculos.

Mocks de `fetch` não substituem esse roteiro.

## Testes automatizados

Unitários de `GoogleService`, clientes, orquestrador, inbound e webhook. HTTP no PostgreSQL descartável cobre OAuth, envio manual e um push automático de tarefa com a Tasks API simulada. A interface cobre status, preferências, erro e desconexão.
