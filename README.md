# Colabora

Aplicativo de gestão de tarefas inteligente. A interface fica em `web/` (React) e a API em `api/` (NestJS). O banco é PostgreSQL.

## Como rodar

Na raiz do repositório:

```bash
npm install
npm --prefix web install
npm --prefix api install
cp api/.env.example api/.env
cp web/.env.example web/.env
docker compose up -d
npm run dev:api
npm run dev:web
```

A interface sobe em `http://localhost:5173` e a API em `http://localhost:3000`. O health check é `GET /health`.

## Scripts

Na raiz: `npm run dev:web`, `npm run dev:api`, `npm run build`, `npm run lint`, `npm run test` e `npm run format`.

O relato de como o projeto foi construído está em [docs/processo.md](docs/processo.md).
