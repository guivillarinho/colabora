# Etapa 1: Arquitetura, Padrões e Regras de Negócio

## Objetivo
Configurar a base do projeto fullstack (Front-end e Back-end) utilizando as melhores práticas do mercado, foco em tipagem estática e padronização de código.

## Stack Tecnológico
- **Front-end:** React (Vite), TypeScript, Tailwind CSS, Shadcn UI.
- **Back-end:** Node.js (NestJS), TypeScript, TypeORM, Banco de Dados Relacional (MySQL ou PostgreSQL).
- **Testes:** Jest e React Testing Library no front-end.

## Padrões de Código
- Utilizar o padrão de configuração do ESLint e Prettier da Rocketseat (pacote `@rocketseat/eslint-config`).
- Estrutura de pastas modular focada em domínios/features.
- Commits semânticos (Conventional Commits).

## Regras de UX ("Não me faça pensar" - Steve Krug)
- A interface deve ser autoexplicativa. Botões de "Criar Tarefa" devem ser óbvios e estar sempre acessíveis.
- Hierarquia visual clara: o que é mais importante deve ser maior ou ter mais contraste.
- Reduzir a carga cognitiva: formulários de criação de tarefas devem ter apenas o essencial visível inicialmente, com opções avançadas (anexos, localização) em abas ou expansões.

## Instrução para o Cursor
Crie a estrutura inicial de pastas para um monorepo ou pastas separadas (`/web` e `/api`). Configure o `package.json`, instale as dependências base do React e Node.js, e configure o ESLint/Prettier com o padrão Rocketseat em ambos os ambientes.