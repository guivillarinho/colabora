# Agenda — diagnóstico da sincronização em 12/11/2026

Consulta somente leitura em produção, em transação `READ ONLY`, com dia local definido como 12/11/2026 em America/Sao_Paulo (03:00Z a 03:00Z do dia seguinte). Nenhum dado ou configuração de produção foi alterado. O arquivo temporário com variáveis usado na conexão foi removido após a consulta. Não se registram credenciais nem títulos privados neste relatório.

## Resultado observado

Na conta com conexão Google ativa, há 115 tarefas: 113 concluídas e 2 pendentes. Destas, 100 têm vínculo com Google Tasks: 98 concluídas e 2 pendentes; as demais 15 não têm vínculo de sincronização.

Aplicando a regra de intervalo atual da agenda, antes dos filtros de visibilidade do navegador:

| Itens que caem em hoje | Quantidade |
| --- | ---: |
| Faculdade, concluídas | 93 |
| Pessoal, concluídas | 4 |
| Casa, concluída | 1 |
| Pessoal, pendente | 1 |
| Evento | 1 |
| Total | 100 |

As 98 tarefas concluídas importadas estão com `completedAt` em 12/11/2026. Não há tarefas dessa conta vinculadas a categorias com exclusão lógica. A contagem é uma fotografia da consulta, não uma reprodução visual da sessão do usuário; pode mudar após novas sincronizações e filtros locais.

## Causa principal confirmada no código

`api/src/modules/google/google-inbound.service.ts`, métodos `applyTask` e `importTask`, grava `completedAt` como `new Date()` quando a tarefa recebida está concluída. Não usa o campo `completed` enviado pelo Google. Assim, uma sincronização em hoje faz tarefas antigas parecerem concluídas hoje; o caminho de atualização pode repetir essa alteração em cada sincronização.

`web/src/features/tasks/task-kind.ts`, função `taskWindow`, usa a data agendada/início e a data de conclusão como intervalo. Se a conclusão for anterior à data agendada, concentra o item na data de conclusão. `AgendaPage` não exclui tarefas concluídas desse conjunto. A combinação explica os 98 cartões concluídos caindo em hoje.

A API local de tarefas lista todos os estados e categorias visíveis ao usuário (criador ou responsável); não filtra somente pendentes nem somente o dia. A tela calcula o dia depois da resposta. A página Hoje mostra uma prévia de tarefas pendentes com regra diferente da página Agenda.

## O que a sincronização busca

- `GoogleSyncOrchestrator.syncNow` percorre a agenda principal e todas as agendas retornadas pela conta. Na ação manual/inicial dessa rotina, o Calendar usa janela de 36 horas atrás até 45 dias à frente; os outros caminhos podem usar syncToken ou carga sem janela.
- `GoogleInboundService.pullTasks` percorre `@default`, todas as listas retornadas pelo Google, os mapeamentos de preferências e as listas ligadas às categorias ativas. Portanto, busca várias categorias; não somente a lista aberta no Gmail/Google Agenda.
- `GoogleTasksClient.listUpdated` solicita `showCompleted=true`, `showHidden=true` e `showDeleted=true`. Concluídas/ocultas são importadas. Essas opções explicam por que o conjunto pode divergir da tela padrão do Google.
- A consulta de tarefas não tem limite por data de vencimento. O primeiro carregamento/sincronização completa traz histórico. O limite de 100 é por resposta da API Google, não a quantidade máxima de tarefas exibida pela tela local.
- O filtro “Agendas exibidas” trata vínculos de Calendar (`googleKind=event`). Tarefas de Google Tasks não são agendas Calendar: atualmente ficam no conjunto “Colabora”, sem seleção de listas/categorias nesse filtro.

## Excluídos, duplicação e outros problemas encontrados

- Tarefas recebidas com `deleted=true` não são importadas; quando já há vínculo, a rotina remove a tarefa local. Eventos `cancelled` seguem a mesma lógica. Pedir `showDeleted=true` é necessário para receber os avisos de exclusão; não significa exibir excluídos como ativos.
- A rotina de Tasks não percorre `nextPageToken`, embora peça somente 100 itens por resposta, e avança o cursor após a primeira página. Isso pode deixar atualizações e exclusões sem processamento. Ausência de um item na resposta não remove o registro local. Portanto, não é possível garantir que nenhum registro antigo tenha ficado após exclusão remota.
- Os aliases `primary`/ID da agenda e `@default`/ID da lista causam consultas redundantes. A busca de vínculo por ID do recurso evita atribuir a eles automaticamente a causa dos 98 itens; não se comprovou duplicação como causa principal da contagem de hoje.
- Datas de eventos de dia inteiro são convertidas para meia-noite UTC; `overlapsDay` inclui o fim com `>=`, enquanto o Google define o fim como exclusivo. Isso pode deslocar ou estender eventos entre dias. É um problema adicional, distinto das 98 tarefas concluídas.

## Correções recomendadas, em ordem

1. Preservar a data real `completed` do Google na importação/atualização; definir comportamento explícito para concluídas sem essa data.
2. Separar a data de uma tarefa agendada de um intervalo contínuo até sua conclusão; definir como o histórico de concluídas aparece na agenda.
3. Implementar paginação e só avançar o cursor depois de processar todas as páginas, com testes de exclusão remota além da primeira página.
4. Normalizar aliases de listas/agendas e tratar datas de dia inteiro e fim exclusivo.
5. Reconciliar registros existentes somente após conferir as datas reais no Google e autorizar a alteração em produção. Não há como reconstruir a data original apenas a partir do `completedAt` sobrescrito.

Este pedido implementa as mudanças visuais e identifica as regras de sincronização; não altera essas regras nem corrige registros existentes em produção.

## Limite da comparação externa

A conexão Google Calendar disponível ao agente exigiu reautenticação. A auditoria usa dados atuais do Colabora e o código da integração; não afirma ter comparado os 100 registros individualmente com a interface ou a API da conta Google.

Referências oficiais: [Tasks.list e flags de histórico](https://developers.google.com/workspace/tasks/reference/rest/v1/tasks/list), [recurso de evento e fim exclusivo](https://developers.google.com/workspace/calendar/api/v3/reference/events).
