# SUPRIR Educação V5.3.0 — atualização em tempo real

A V5.3.0 adiciona sincronização automática entre os portais Escola, SME e Almoxarifado usando Supabase Realtime.

## Fluxo em tempo real

- Escola envia um pedido → a fila da SME é atualizada automaticamente.
- SME inicia/análise/autoriza/rejeita → a escola recebe a nova situação automaticamente.
- Pedido autorizado → aparece automaticamente para o Almoxarifado.
- Almoxarifado separa/expede → escola e SME recebem a nova situação automaticamente.
- Escola confirma recebimento → SME e Almoxarifado visualizam a conclusão sem F5.
- Entrada ou saída de estoque → saldos e catálogo são sincronizados automaticamente.

O frontend mantém também um fallback silencioso a cada 60 segundos e uma sincronização ao voltar para a aba do navegador. Isso cobre perda temporária de conexão Realtime sem exigir atualização manual.

## Banco de dados

Em uma base já atualizada para a V5.2.x execute apenas:

`supabase/migrations/012_realtime_v5_3.sql`

Depois valide com:

`supabase/VALIDACAO_REALTIME_V5_3.sql`

As sete linhas devem retornar `realtime_ativo = true`.

## Estoque

A tela Estoque passa a destacar no topo:

- quantidade de materiais com saldo positivo;
- total de unidades físicas em estoque;
- quantidade de itens com estoque baixo;
- quantidade de materiais ativos sem estoque.

A migração 012 não altera saldos, pedidos, usuários, permissões ou histórico.
