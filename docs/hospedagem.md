# Hospedagem do Colabora na Vercel

## Configuração

O projeto é publicado como uma única aplicação Vercel: front estático, API NestJS
em uma função Node.js 24 e rotas da API no mesmo domínio. Não é necessário
configurar CORS entre front e API nem expor credenciais no JavaScript do navegador.

- Repositório: `guivillarinho/colabora`.
- Root Directory: raiz do repositório (`.`), sem selecionar `web` ou `api`.
- Framework Preset: Other.
- Production Branch: `main`.
- Instalação e build: definidos no `vercel.json`.
- Pacote gerado: `.vercel/output`, seguindo a Build Output API da Vercel.

Cada push na `main` dispara uma publicação. O endereço principal permanece o
mesmo. Páginas que já estavam abertas podem precisar ser recarregadas para usar
a nova versão. Alterações apenas no computador não atualizam o site publicado.

## Banco e anexos persistentes

Conectar ao projeto, pelo painel Storage da Vercel:

1. PostgreSQL do Neon no plano gratuito, configurando `DATABASE_URL`.
2. Vercel Blob **privado**, configurando `BLOB_READ_WRITE_TOKEN`.

Variáveis utilizadas no servidor:

| Variável                | Uso                                                         |
| ----------------------- | ----------------------------------------------------------- |
| `DATABASE_URL`          | Conexão PostgreSQL; fornecida pela integração               |
| `DATABASE_URL_UNPOOLED` | Conexão direta para migrações, quando fornecida pelo Neon   |
| `DB_SSL`                | `true` se o provedor exigir TLS; certificados são validados |
| `DB_POOL_SIZE`          | Máximo de conexões por instância; padrão `5`                |
| `BLOB_READ_WRITE_TOKEN` | Acesso ao armazenamento privado; somente no servidor        |
| `NODE_ENV`              | `production`                                                |

O build usa `VITE_API_URL` vazio para acessar a API no mesmo domínio e habilita
`VITE_CLOUD_UPLOADS`. Não colocar senhas, tokens ou a conexão do banco em variáveis
`VITE_*`.

As migrações rodam durante o build da Vercel, antes da publicação, com bloqueio
contra duas migrações simultâneas. O banco não usa sincronização automática de
esquema em produção. Cada alteração futura de esquema precisa de nova migração.
O build falha se banco ou armazenamento privado não estiverem configurados.

Os arquivos de até 10 MB são enviados diretamente ao Blob privado, sem passar
pelo limite de corpo das funções. O backend autoriza o upload e serve os arquivos
pela rota `/uploads/agenda/:filename`, protegida junto com a aplicação.

Os planos gratuitos têm cotas. Não ativar Pro, cobrança por excedente ou planos
pagos sem autorização. Na cota esgotada, o serviço pode ser suspenso até a renovação.

## Acesso pessoal

Antes de usar dados pessoais, ativar **Vercel Authentication → All Deployments**
na proteção do projeto. Isso deve proteger o domínio principal, previews, API e
anexos. Testar o domínio e `/tasks` sem autenticação: devem exigir login.

Nos outros dispositivos, entrar na mesma conta Vercel autorizada. A lista de
tarefas é compartilhada entre esses dispositivos; o app não oferece contas
separadas para múltiplos usuários. Não desativar a proteção: CORS não substitui
controle de acesso.

## Dados locais

A publicação não copia automaticamente o PostgreSQL nem os anexos deste computador.
A transferência desses dados precisa ser feita separadamente, após confirmar
o destino e a proteção de acesso. Nenhum arquivo de `api/uploads` é versionado.

## Desenvolvimento local e alternativa em container

Os comandos `npm run dev:web` e `npm run dev:api` permanecem disponíveis. Os anexos
locais continuam em `api/uploads/agenda`. O `api/Dockerfile` permite executar a API
em outro host com um volume persistente e PostgreSQL remoto, caso necessário.

## Estado de publicação

Consultar o painel da Vercel para verificar o resultado efetivo da publicação.
A existência destes arquivos e um build local bem-sucedido não confirmam que
a aplicação já está online.
