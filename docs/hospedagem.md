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

O `vercel.json` seleciona explicitamente o builder do `package.json`. Isso impede
que a pasta de código-fonte `api` seja interpretada como dezenas de funções
independentes. O pacote final contém apenas uma função para a API completa.

Cada push na `main` dispara uma publicação. O endereço principal permanece o
mesmo. Páginas que já estavam abertas podem precisar ser recarregadas para usar
a nova versão. Alterações apenas no computador não atualizam o site publicado.

## Banco e anexos persistentes

Conectar ao projeto, pelo painel Storage da Vercel:

1. PostgreSQL do Neon no plano gratuito, configurando `DATABASE_URL`.
2. Vercel Blob **privado**, configurando `BLOB_READ_WRITE_TOKEN`.

Variáveis utilizadas no servidor:

| Variável                    | Uso                                                                        |
| --------------------------- | -------------------------------------------------------------------------- |
| `DATABASE_URL`              | Conexão PostgreSQL; fornecida pela integração                              |
| `DATABASE_URL_UNPOOLED`     | Conexão direta para migrações, quando fornecida pelo Neon                  |
| `DB_SSL`                    | `true` se o provedor exigir TLS; certificados são validados                |
| `DB_POOL_SIZE`              | Máximo de conexões por instância; padrão `5`                               |
| `BLOB_READ_WRITE_TOKEN`     | Acesso ao armazenamento privado; somente no servidor                       |
| `NODE_ENV`                  | `production`                                                               |
| `SESSION_SECRET`            | Segredo aleatório de pelo menos 32 caracteres, apenas no servidor          |
| `SESSION_IDLE_MINUTES`      | Inatividade máxima; padrão `30`                                            |
| `SESSION_ABSOLUTE_HOURS`    | Duração máxima da sessão; padrão `168`                                     |
| `WEB_ORIGIN`                | Origem HTTPS exata, se houver front em outra origem; nunca `*`             |
| `VAPID_PUBLIC_KEY`          | Chave pública usada pelo navegador para registrar o push                   |
| `VAPID_PRIVATE_KEY`         | Chave privada Web Push, somente no servidor                                |
| `VAPID_SUBJECT`             | Contato VAPID no formato `mailto:`                                         |
| `REMINDER_DISPATCH_SECRET`  | Segredo compartilhado entre a API Vercel e a função agendada Neon          |
| `BREVO_API_KEY`             | Chave da API Brevo para enviar e-mails de recuperação; somente no servidor |
| `PASSWORD_RESET_FROM_EMAIL` | Remetente verificado no Brevo                                              |
| `PASSWORD_RESET_FROM_NAME`  | Nome do remetente; padrão `Colabora`                                       |
| `PUBLIC_APP_URL`            | Origem HTTPS usada nos links de redefinição                                |

O build usa `VITE_API_URL` vazio para acessar a API no mesmo domínio e habilita
`VITE_CLOUD_UPLOADS`. Não colocar senhas, tokens ou a conexão do banco em variáveis
`VITE_*`.

### Recuperação de senha

O cadastro exige senha com pelo menos 6 caracteres, incluindo letra maiúscula,
minúscula, número e caractere especial. A tela de login permite mostrar/ocultar
a senha e solicitar um link de recuperação. O link expira em 30 minutos, só pode
ser usado uma vez, e a troca encerra as sessões existentes da conta.

Para enviar os links, configure uma conta Brevo no plano gratuito, crie e valide
um remetente e cadastre `BREVO_API_KEY`, `PASSWORD_RESET_FROM_EMAIL` e
`PUBLIC_APP_URL=https://colabora-rouge.vercel.app` nas variáveis de produção da
Vercel. A conta gratuita permite 300 envios por dia. O Brevo permite verificar
um endereço remetente por código de e-mail; autenticar um domínio próprio melhora
a entrega. Sem chave e remetente configurados, a API retorna indisponibilidade
para a tela de recuperação e não consulta a existência da conta.

### Push e lembretes

O navegador precisa ativar notificações em cada dispositivo. No iPhone/iPad,
primeiro adicione o site à Tela de Início e abra o app instalado; o Safari só
permite Web Push para web apps adicionados assim. A assinatura do aparelho é
salva na conta autenticada. A API manda avisos de criação, alteração, conclusão e
remoção de tarefas, além de eventos e projetos da agenda.

Gere uma única chave VAPID com `npx web-push generate-vapid-keys` e configure a
chave pública, a privada e `VAPID_SUBJECT` na API (local ou variáveis de produção
da Vercel). Gere `REMINDER_DISPATCH_SECRET` com um gerador criptográfico e grave
o mesmo valor na Vercel e na função Neon. Nunca coloque esses segredos em
variáveis `VITE_*` nem no Git.

Em uma API com processo contínuo (`npm run start:prod` ou desenvolvimento),
os lembretes são verificados automaticamente ao iniciar e a cada 15 segundos.
Não é necessário chamar a rota de disparo manualmente nesse ambiente.
Na Vercel, o processo pode ser suspenso entre requisições; por isso o agendador
externo descrito abaixo continua obrigatório. Sem o trigger ativo, os avisos
de alterações funcionam, mas os lembretes de horário ficam pendentes.

A configuração de produção usa o banco `colabora-db` em São Paulo e um projeto
separado **Free**, `colabora-reminders`, em N. Virginia (`aws-us-east-1`), apenas
para executar o agendador. Functions não estão disponíveis em São Paulo.
O projeto do agendador não é conectado como banco da aplicação: não substituir
`DATABASE_URL` da Vercel por uma conexão desse projeto.

| Recurso | Identificação |
| --- | --- |
| Projeto Neon do agendador | `mute-hat-84564929` |
| Branch | `main` (`br-super-math-bbooes41`) |
| Function | `reminders` |
| Trigger | `colabora-task-reminders` |
| Agenda | `* * * * *` (UTC, a cada minuto) |
| API | `https://colabora-rouge.vercel.app` |

O vínculo local do agendador fica em `infra/neon/.neon` (ignorado pelo Git).
Para refazer esse vínculo sem baixar ou trocar conexões do banco:

```bash
cd infra/neon
neon link --project-id mute-hat-84564929 --branch main --no-env-pull --no-config --yes
```

A fila atende tarefas, eventos e projetos. Tarefas mantêm os avisos padrão
de 10 minutos antes e no horário marcado enquanto a configuração não for
personalizada. Para eventos e projetos, os lembretes usam a data de início.
Antes de publicar esta versão, aplique a migração
`ConfigurableReminders1794441600000` no banco do ambiente de destino.
Para o serviço gratuito continuar verificando os lembretes mesmo com o app
fechado, publique
`infra/neon/functions/reminders.ts` como uma Neon Function `reminders`, configure
`COLABORA_API_URL=https://colabora-rouge.vercel.app` e
`REMINDER_DISPATCH_SECRET` nela e crie um Function Trigger `schedule` com cron
`* * * * *` em UTC. A Neon aceita agenda por minuto e executa mesmo com o banco
em scale-to-zero. Isso significa que um lembrete pode chegar com até cerca de um
minuto de atraso; não há garantia de entrega exata no segundo. Os Function
Triggers estão disponíveis no plano gratuito da Neon; cada navegador/aparelho
também precisa permitir notificações.

Para publicar a função, instale a CLI Neon e rode `npm install` em
`infra/neon`. Vincule esse diretório ao projeto do agendador conforme acima,
exporte `REMINDER_DISPATCH_SECRET` no terminal e rode:

```bash
neon functions deploy reminders --src functions/reminders.ts \
  --env COLABORA_API_URL=https://colabora-rouge.vercel.app \
  --env REMINDER_DISPATCH_SECRET="$REMINDER_DISPATCH_SECRET"
```

O trigger de produção já está criado. Para uma instalação nova, crie-o
somente se ele ainda não existir:

```bash
neon triggers list --output json
neon triggers create --function-slug reminders --name colabora-task-reminders --cron '* * * * *' --enabled
```

Verifique os disparos com `neon logs query --source function`. Cada execução
registra o identificador da invocação, o status HTTP da API e a quantidade de
lembretes processados, sem registrar o segredo ou dados das tarefas. Armazene o
mesmo segredo como variável de produção na Vercel. O painel Vercel precisa também
das chaves VAPID. Configure essas variáveis antes de
publicar a aplicação.

Deploy da aplicação exige que as chaves VAPID e o segredo do despachador existam
na Vercel. Depois de configurar esses segredos, publicar o app e ativar a função
e o trigger Neon, o push e os lembretes ficam operacionais. A configuração da
função Neon é separada do deploy Vercel.

As migrações rodam durante o build da Vercel, antes da publicação, com bloqueio
contra duas migrações simultâneas. O banco não usa sincronização automática de
esquema em produção. Cada alteração futura de esquema precisa de nova migração.
O build falha se banco, armazenamento privado ou SESSION_SECRET não estiverem configurados. Não publique a versão de autenticação antes de configurar esse segredo. Trocar o segredo invalida os cookies existentes.

Os arquivos de até 10 MB são enviados diretamente ao Blob privado, sem passar
pelo limite de corpo das funções. O backend autoriza o upload e serve os arquivos
pela rota `/api/uploads/agenda/:filename`, protegida junto com a aplicação.

Os planos gratuitos têm cotas. Não ativar Pro, cobrança por excedente ou planos
pagos sem autorização. Na cota esgotada, o serviço pode ser suspenso até a renovação.

## Acesso e contas

A versão de autenticação implementa contas próprias da aplicação: cadastro, login, logout e propriedade por usuário. Use a mesma conta Colabora em seus dispositivos para acessar seus dados. Sessões persistem no PostgreSQL compartilhado, sem Redis. Cookie de produção: `__Host-colabora.sid`, HttpOnly, Secure, SameSite=Lax e Path=/.

Manter **Vercel Authentication → All Deployments** ativa durante a transição. Essa proteção adicional não foi desativada. Visitantes ainda precisam ser autorizados pela Vercel para alcançar o app. A publicação da nova autenticação não foi feita nesta implementação; um build local não comprova publicação.

A API usa `/api`: verificar `/api/auth/me` e `/api/tasks` sem sessão deve retornar 401 depois da barreira Vercel. `/health` continua público dentro da aplicação. Mutations requerem origem autorizada e `X-CSRF-Token`; ferramentas administrativas HTTP também devem obter uma sessão e o token.

### Transição dos dados antigos

A migração conserva todos os registros existentes e adiciona propriedade inicialmente nula. Esses registros ficam fora das listagens até que um administrador verifique a conta correta e faça a vinculação. **O primeiro cadastro não recebe dados antigos.** E-mail informado no cadastro não comprova titularidade; confirme também o ID da conta com o proprietário por um canal confiável.

Depois de criar a conta de destino, com conexão administrativa ao banco correto em um ambiente seguro, executar na pasta `api` (os valores abaixo são exemplos):

```bash
npm run build
# DATABASE_URL / DATABASE_URL_UNPOOLED e DB_SSL devem estar no ambiente do processo.
npm run legacy:assign -- --user-id UUID-DA-CONTA-VERIFICADA --email dono@example.com --confirm
```

O comando verifica ID + e-mail normalizado em transação, vincula somente registros ainda sem dono e registra referências de anexos antigos. É idempotente. Não cria conta, não configura senha nem copia arquivos entre armazenamentos. Se existirem sessões de foco antigas simultaneamente ativas, examine-as com o proprietário: a constraint permite apenas uma sessão ativa por usuário, e a transação falha sem alterar dados.

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

### Vincular Google Agenda pelo Perfil

Em Perfil → Google Agenda, cada pessoa escolhe a própria conta Google.
O retorno da autorização reabre essa opção, exibe o e-mail vinculado e permite
desconectar ou enviar uma tarefa com data e horário ao calendário principal.
O envio é confirmado pelo usuário. Reenviar atualiza o mesmo evento.

Para ativar em produção, configure uma vez um projeto no Google Cloud.

1. Ative a Google Calendar API.
2. Configure a tela de consentimento OAuth para usuários externos com os escopos
   `openid`, `email` e
   `https://www.googleapis.com/auth/calendar.events.owned`.
3. Crie um cliente OAuth do tipo Aplicativo da Web e cadastre o URI de retorno
   `https://colabora-rouge.vercel.app/api/google/callback`.
4. Cadastre na Vercel, no ambiente Production, `GOOGLE_CLIENT_ID`,
   `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` e
   `GOOGLE_TOKEN_ENCRYPTION_KEY`. A chave de criptografia deve ter 32 bytes
   aleatórios em base64 e ser independente da chave de sessão. O servidor usa
   essa chave para proteger tokens de atualização e o e-mail conectado.
5. Confira `PUBLIC_APP_URL=https://colabora-rouge.vercel.app`, defina
   `GOOGLE_ENABLED=true` e publique novamente. O build valida a configuração.
   Preserve a chave de criptografia em republicações para manter os vínculos.

Enquanto a tela de consentimento estiver em testes, cadastre cada conta de
teste no Google Cloud. Para oferecer o vínculo publicamente, conclua os
requisitos de publicação e verificação indicados pelo Google para os escopos
solicitados. As credenciais do cliente pertencem ao aplicativo. Os usuários
conectam suas contas pela autorização do Google.

Preview continua usando apenas credenciais prefixadas e um banco isolado,
conforme `COLABORA_PREVIEW_DEPLOYMENT.md`.
