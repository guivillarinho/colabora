# Google Tasks — categorias e listas (1:1)

Documento de execução da evolução E12: catálogo local de categorias espelhando as **task lists** do Google Tasks. Complementa [`GOOGLE_AGENDA_SYNC_PLAN.md`](GOOGLE_AGENDA_SYNC_PLAN.md).

## Resumo

- Cada **categoria** do Colabora corresponde a **uma lista** no Google Tasks (`googleListId`).
- Tarefas com prazo sincronizam para a lista da categoria escolhida; mudança de categoria enfileira **move** no Google quando já houver vínculo.
- Agenda continua em **Calendar Events**; este plano não altera esse fluxo.
- HTTP do app usa `fetch` ([`web/src/lib/http-client.ts`](../web/src/lib/http-client.ts)), não Axios.

## Estado: feito vs pendente

| Item | Status |
|------|--------|
| OAuth, sync v2, push tarefa/agenda, webhook, poll tarefas (parcial) | Feito no código |
| Migração produção google v2 | Aplicada |
| `task_categories` + `categoryId` + CRUD API | Feito (este rollout) |
| Sync outbound/inbound de listas | Feito no código |
| UI formulário via API; perfil sem mapa manual | Feito |
| `GOOGLE_*` em produção Vercel | Pendente (operacional) |
| Homologação real com conta Google | Pendente após OAuth |

## Fases

### Fase 0 — Desbloqueio produção

1. Google Cloud: Calendar API + Tasks API; consentimento Testing; usuário de teste.
2. Cliente OAuth Web; redirect `https://colabora-rouge.vercel.app/api/google/callback` (ou `PUBLIC_APP_URL` + `/api/google/callback`).
3. Vercel Production: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_ENABLED=true`.
4. Redeploy; validar `/api/google/status` com sessão → `configured: true`.

### Fase 1 — Catálogo local

- Tabela `task_categories`; coluna `tasks.categoryId`.
- `GET/POST/PATCH/DELETE /api/task-categories`.
- Seed das 6 categorias padrão ao primeiro acesso; backfill de `categoryId` por nome.

### Fase 2 — Outbound listas

- `GoogleTasksClient`: `patchList`, `deleteList`.
- Outbox: `push-category-list`, `update-category-list`, `delete-category-list`.

### Fase 3 — Inbound

- `pull-task-lists` + poll em todas as listas.
- `applyTask` atualiza `categoryId` pela lista.
- `move-task-list` ao mudar categoria da tarefa.

### Fase 4 — UX

- Formulário de tarefa consome catálogo da API.
- Perfil Google: status do catálogo, sem `categoryTaskListMap` manual.

### Fase 5 — Homologação

Checklist (conta de teste, `autoSync` e `inboundEnabled` ligados):

1. Criar categoria no Colabora → lista aparece no Google Tasks.
2. Renomear nos dois lados (conflito se simultâneo).
3. Criar tarefa com prazo na categoria → task na lista correta.
4. Mover categoria da tarefa → task muda de lista no Google.
5. Excluir lista no Google → categoria local reflete exclusão lógica.
6. Revogar OAuth → estado Reconectar; desconectar → vínculos locais limpos.

## Testes

- API: specs de `TaskCategoriesService`, client Tasks, orquestrador, inbound.
- Web: formulário e `google-settings`.
- E2E: fluxo com Google mockado (PostgreSQL descartável).

Rodar na raiz: `npm test`; e2e: `npm --prefix api run test:e2e -- --runInBand`.

## Variáveis

Iguais à E12 + opcional `CRON_SECRET` para `/api/google/jobs/tick` na Vercel Hobby.
