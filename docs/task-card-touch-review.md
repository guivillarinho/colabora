# Revisão do toque no card de Hoje — 2026-11-06

## Comparação com main

A referência `origin/main` foi atualizada via fetch e está em `0937ab5`.
Nessa versão, `task-timeline.tsx` captura o ponteiro no início do gesto e não abre detalhes ao tocar no corpo do card. O limiar de ação é 48 px, com deslocamento limitado a 96 px e confirmação para excluir.

A branch adicionou abertura de detalhes no corpo do card, reconhecimento de direção, captura tardia, feedback tátil no limiar, tratamento de cancelamento, visual translúcido e um puxador móvel nos commits `9c1b2c1` e `1770f0e`. O código permitia reconsiderar como horizontal um gesto iniciado na vertical. A captura de ponteiro também não impede, por si só, que o navegador assuma um gesto de toque para rolagem.

## Correção

- Detalhes passam a abrir pelo botão Visualizar detalhes, acessível por toque e teclado; ao fechar, o foco retorna ao botão.
- O corpo todo do card aceita arrasto. O puxador separado foi removido.
- Eventos nativos de toque usam um listener de movimento não passivo: gestos horizontais impedem a rolagem do navegador; gestos verticais mantêm a rolagem e não se convertem em ações.
- Mouse e caneta continuam usando Pointer Events, com captura desde o início.
- Cancelamento e múltiplos dedos restauram a posição sem executar ações. Links e botões não iniciam arrasto.
- O clique residual após arrastar é bloqueado somente dentro do card, preservando botões dos diálogos renderizados em portal e ativação pelo teclado.
- Limiares, permissões, confirmação de exclusão e feedback tátil foram preservados.

A abertura por toque não foi comprovada como causa única do relato. A correção trata tanto a disputa com a rolagem quanto a ambiguidade entre toque e arrasto. Os resultados dispensaram rollback completo.

## Validação

- Jest: 3 suítes, 47 testes passaram (task-timeline, task-board e agenda-page).
- Chromium com viewport 390 × 844 e entrada nativa de toque via CDP: conclusão; exclusão com cancelar, repetir e confirmar; rolagem vertical sem ações; detalhes somente pelo botão; arrasto curto seguido de abertura de detalhes. Todos passaram, sem exceções JavaScript.
- A validação no navegador usou dados simulados e uma página temporária que foi removida. Não houve validação em aparelho físico.

## Deploy Vercel — 2026-11-06

- Publicado via CLI a partir da cópia local com a correção do card: `dpl_BA3usnkRSUo41XJH3p7HA83BtVZF`.
- Preview: https://colabora-jjphupktt-villarinhoguis-projects.vercel.app
- Vercel confirmou Ready; build remoto em 1m49s e função em gru1.
- GET autenticado pela CLI em `/`: HTTP 200, HTML com título Colabora. GET `/health`: HTTP 200, `{"status":"ok"}`.
- A proteção de acesso Vercel está habilitada. O deploy foi realizado em Preview, sem promoção a Production ou migração de banco.

## Variante para validar abertura no card — 2026-11-06

A pedido do usuário, esta variante restaura detalhes por clique/toque no card e remove o botão Visualizar detalhes. Enter/espaço também abrem o diálogo, e fechar retorna o foco ao card. Links, edição e botões de diálogos não abrem detalhes. O tratamento nativo do arrasto é preservado, incluindo bloqueio do clique residual após movimentos/cancelamentos.

Validação desta variante: 51 testes em 3 suítes passaram; lint, build web e diff check passaram. Chromium com toque nativo em 390 × 844 confirmou conclusão, exclusão com cancelar/repetir/confirmar, rolagem vertical sem ação, toque para detalhes e arrasto curto sem abertura acidental seguido de toque válido. Clique com mouse em 1280 × 900 abriu detalhes e o foco voltou ao card ao fechar. Sem exceções JavaScript na validação móvel. Página de teste temporária removida.

Esses resultados permitem comparar esta variante com o Preview anterior em aparelho físico; não comprovam isoladamente a causa do bug relatado no aparelho do usuário.

Deploy desta variante: https://colabora-9z75rhl57-villarinhoguis-projects.vercel.app — `dpl_DNDaZsKziCrcCRT26Te1HHYxqAkt`, Ready, Preview com proteção Vercel. GET `/` e `/health` retornaram HTTP 200, saúde `{"status":"ok"}`. Sem promoção a Production.
