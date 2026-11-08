# Consolidação para main — 2026-11-08

Base: feat/colabora-evolucao em faa055b, preservando o visual minimalista lilás/roxo e os ajustes recentes de cards, endereço e responsáveis.

Integração: histórico de feat/ai-autonomous-dev incorporado por merge. Mantidas as correções de idempotência do assistente, limite/backoff dos lembretes, janela de horário no chat e indicador acessível do timer. O fluxo atual de anexos privados via Blob e suas validações prevalece sobre a implementação alternativa de uploads no PostgreSQL; a migração dessa alternativa não foi incorporada. A criação de tarefa mantém o fluxo mais recente, evitando a duplicação de envio e de payload produzida pelo merge automático. Main já era ancestral da base.

Validação: 187 testes web e 92 API aprovados; builds web/API e lint sem alterações automáticas aprovados. Testes HTTP com banco descartável não executados neste ambiente.

Estado remoto: escrita no GitHub ainda indisponível (push retorna ausência de credenciais). A main local consolida os históricos; main remota e branches remotas ainda não alteradas/removidas.

Release Production pendente: publicar main no GitHub, conferir/aplicar migrações pendentes no banco de produção por procedimento explícito, criar build Production e validar login, anexos e tarefas antes de concluir a liberação pública. Não usar as credenciais ou o banco isolado de Preview em Production. O domínio de produção existente é colabora-rouge.vercel.app e a proteção Vercel está restrita a Preview. Nenhum domínio próprio foi fornecido.
