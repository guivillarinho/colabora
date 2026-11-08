# Colabora — guia para agentes

## Projeto

Colabora é um aplicativo web em português para tarefas, agenda, foco/Pomodoro, lembretes, autenticação e assistência. É um monorepo npm com frontend e API separados, implantado como aplicação web e função serverless na Vercel.

## Ferramentas e tecnologias

- Node.js 24 e npm workspaces por diretório (raiz, `web/`, `api/`).
- Frontend: React 19, TypeScript, Vite 8, Tailwind CSS 4, tw-animate-css, shadcn/ui sobre Radix UI, Lucide, next-themes e Geist Variable. Jest, Testing Library e jsdom para testes.
- API: TypeScript, NestJS 11, Express, PostgreSQL, TypeORM e migrations explícitas. Jest, ts-jest e Supertest para testes.
- Infraestrutura: Docker Compose para desenvolvimento/testes; Vercel para hospedagem; scripts `scripts/` para empacotamento, política isolada de Preview e cabeçalhos HTTP.

## Organização

- `web/src/app/`: composição da aplicação e tema.
- `web/src/features/`: funcionalidades por domínio (`auth`, `tasks`, `dashboard`/agenda, `timer`, `assistant`, `google`); componentes e testes de cada domínio ficam próximos.
- `web/src/components/`: componentes compartilhados, layout, controles, diálogos e paleta.
- `web/src/lib/`: cliente HTTP, feedback tátil, formatação e utilitários.
- `api/src/modules/`: módulos NestJS por domínio; em cada módulo separar controller, service, DTOs, entidades e testes.
- `api/src/database/`: configuração, schema e migrations versionadas. Não habilitar `synchronize` nem rodar migrations contra produção sem autorização explícita.
- `scripts/`, `infra/`, `docs/`: automação e configuração de infraestrutura, utilitários de build/políticas, documentação técnica e operacional.

## Interface visual

- Estilos utilitários Tailwind CSS 4; componentes seguem shadcn/ui e tokens semânticos CSS definidos em `web/src/index.css`.
- Suportar tema claro e escuro por tokens (background, foreground, card, border, primary, muted, destructive, ring), sem cores avulsas quando existir token equivalente.
- Identidade minimalista com branco, lilás claro, roxo nos destaques, superfícies sólidas e tipografia Geist. Não usar glassmorphism, desfoques ou degradês. Respeitar `prefers-reduced-motion`.
- Categorias de tarefa usam swatches pastéis com texto de contraste correspondente (ver `web/src/components/pastel.ts`): vermelho, azul, amarelo, verde, roxo e laranja. Estados usam cores semânticas dos tokens, não apenas cor para comunicar informação.
- Interface e mensagens para o usuário são em português. Priorizar controles acessíveis, nomes claros, foco visível, uso por teclado/toque e alvos de toque confortáveis.

## Convenções para mudanças

- Siga o padrão TypeScript existente, mantenha validação e autorização no servidor e prefira mudanças localizadas por domínio.
- Adicione ou atualize testes junto à funcionalidade alterada. Rode `npm run lint`, `npm test` e `npm run build` quando apropriado; testes HTTP exigem o banco descartável descrito no README.
- Nunca coloque segredos em código, frontend ou logs. Preview Vercel usa política e banco isolados; leia `docs/COLABORA_PREVIEW_DEPLOYMENT.md` antes de alterar configuração/deploy. Deployment Preview não significa autorização para promover a Production.
- Não execute comandos destrutivos de banco nem altere dados de produção sem autorização explícita.

## Comandos comuns

- `npm run dev:web` / `npm run dev:api`: iniciar interface e API.
- `npm run lint`, `npm test`, `npm run build`: verificações agregadas da raiz.
- `npm --prefix api run test:e2e -- --runInBand`: testes HTTP usando a configuração de banco descartável indicada no README.
