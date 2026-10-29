# Processo do Colabora

O Colabora foi construído em cinco fases, da estrutura vazia até a lista de tarefas ligada à API, com o conselho de produtividade e os testes que sustentam essa regra.

## Fase 1 — estrutura

A raiz não é um workspace do npm. `web/` e `api/` são pacotes separados, e os scripts da raiz chamam cada um com `npm --prefix`.

O frontend saiu do Vite com React 19 e TypeScript 5.9. O template vinha com TypeScript 7 e oxlint; os dois foram trocados pelo ESLint e pelo Prettier da Rocketseat (`@rocketseat/eslint-config`), que pedem ESLint 8 e TypeScript 5. O backend é NestJS 11 com TypeORM. PostgreSQL 17 sobe pelo `docker-compose.yml` da raiz, com usuário, senha e banco `colabora` na porta 5432.

Commits seguem o padrão conventional, com commitlint no hook `commit-msg` do Husky.

## Fase 2 — tarefas e produtividade

A API expõe `POST /tasks`, `GET /tasks`, `GET /tasks/:id`, `PATCH /tasks/:id`, `DELETE /tasks/:id`, `POST /tasks/:id/start` e `POST /tasks/:id/complete`. O corpo passa por `ValidationPipe` com whitelist. O CORS aceita a origem da interface (`WEB_ORIGIN`, padrão `http://localhost:5173`). Em desenvolvimento o TypeORM sincroniza o schema; em produção, não.

Cada tarefa tem título, descrição, categoria, prioridade, cor, data, local, anexos, tempo estimado, tempo real e status (`pending`, `in_progress`, `completed`). A prioridade (`low`, `medium`, `high`) entrou para a ordenação da lista. O padrão é `medium`.

`POST /tasks/:id/start` grava `startedAt` e muda o status para `in_progress`. `POST /tasks/:id/complete` usa o `actualTime` enviado ou os minutos decorridos desde o início. Sem um dos dois, a API responde 400.

Se o tempo real passa da margem configurável, a resposta inclui `productivityAdvice`: "Considere dividir esta tarefa em partes menores da próxima vez." A margem vem de `PRODUCTIVITY_MARGIN_PERCENT` e o padrão é 20. A conta é inteira: o conselho só aparece quando `actualTime * 100` é maior que `estimatedTime * (100 + margem)`. Sessenta minutos estimados e 72 reais, com margem 20, não geram conselho. Setenta e três minutos geram.

## Fase 3 — tema e layout

O visual usa Tailwind 4 pelo plugin do Vite. Não há `tailwind.config.js`: as cores pastel (vermelho, azul, amarelo, verde, roxo e laranja) são tokens no CSS, claros no `:root` e mais escuros em `.dark`, com texto contrastante nos dois temas.

O tema claro/escuro usa `next-themes` na estratégia de classe e começa no tema do sistema. A fonte é Geist. Os componentes de botão, campo, rótulo, diálogo e collapsible vieram do shadcn no preset radix-nova.

No desktop a navegação é uma sidebar fixa, o conteúdo fica em cards e o botão Criar tarefa permanece no topo. No celular a sidebar some e a navegação vai para a barra inferior. As seções Hoje, Tarefas e Agenda são estado local do React. React Router chegou a ser instalado e foi removido: a versão 8 publica módulos ESM que o Jest deste projeto não transforma.

## Fase 4 — formulário, cards e API

O cliente fala com a API por `fetch`, em `web/src/features/tasks/api/tasks-api.ts`. A base é `VITE_API_URL`, com fallback `http://localhost:3000`. O Vite injeta essa variável em build; os testes leem `process.env` e usam o mesmo fallback.

O formulário abre pelo botão Criar tarefa. Título, descrição, categoria, prioridade, cor, data e tempo estimado ficam à vista. Anexos e localização ficam em Opções avançadas. O anexo é simulado: só o nome do arquivo é guardado. A data do campo `datetime-local` vira ISO antes de sair para a API.

A lista ordena por data, prioridade ou categoria e filtra por categoria. O card usa a cor da tarefa, mostra o status e oferece editar, iniciar, concluir e excluir. Ao concluir, se a tarefa não foi iniciada, o tempo real é obrigatório. Se foi iniciada, o campo vazio deixa a API medir o intervalo.

Quando a conclusão devolve `productivityAdvice`, um diálogo mostra o conselho. Se a API não responde, a tela avisa "Não foi possível falar com a API." e o formulário permanece aberto.

O painel Hoje conta as tarefas concluídas e a linha do tempo usa a cor e a data de cada tarefa.

## Fase 5 — testes

A API tem testes de unidade do serviço de tarefas e do conselho de produtividade, com o repositório e a configuração simulados. Cobrem a margem padrão, uma margem de 10%, o tempo medido a partir de `startedAt`, a conclusão sem tempo e a tarefa inexistente.

A interface testa a formatação de duração (`45 min`, `1 h`, `1 h 30 min`), a classe pastel do card (`bg-pastel-red` e `bg-pastel-blue`), a presença do diálogo de conselho só quando existe texto, a criação a partir dos campos essenciais e a casca do painel (progresso, linha do tempo, cores e navegação). O `tasksApi` é simulado nesses testes para não depender do PostgreSQL.

`window.matchMedia` é definido no setup do Jest porque o `next-themes` consulta o tema do sistema.

## O que ficou de fora da verificação ao vivo

Nesta máquina o daemon do Docker não estava acessível, então a API não foi exercitada contra o PostgreSQL. O fluxo de criar, iniciar, concluir e ver o conselho foi coberto pelos testes de unidade e pelo cliente com a API simulada. Com o Docker no ar, `docker compose up -d` seguido de `npm run dev:api` completa esse caminho no navegador.
