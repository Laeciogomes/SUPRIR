# Atualização V5.2.0 — Controle de estoque

## Objetivo

A V5.2.0 transforma o catálogo de materiais em um estoque operacional auditável.

## Regra principal

- **Entrada:** soma ao saldo.
- **Pedido:** não altera saldo.
- **Autorização:** não altera saldo.
- **Expedição:** baixa o saldo automaticamente.
- **Confirmação da escola:** não altera saldo; apenas confirma o recebimento.

## Visibilidade

- Escola: recebe pelo RLS somente materiais `ativo = true` e `stock_quantity > 0`.
- SME: consulta todos os materiais e respectivos saldos.
- Almoxarifado/Admin: consultam e registram entradas; almoxarifado também pode cadastrar/editar materiais.

## Segurança

A coluna de saldo não é alterada diretamente pelo navegador. As alterações passam pelas RPCs `register_stock_entry` e `register_dispatch`, executadas de forma transacional.

A expedição bloqueia a operação se a quantidade solicitada ultrapassar o estoque físico naquele instante. Se qualquer item falhar, toda a remessa é revertida pela transação.

## Histórico

`inventory_movements` registra:

- material;
- tipo (`entry` ou `dispatch`);
- quantidade;
- saldo antes;
- saldo depois;
- documento;
- pedido/remessa, quando aplicável;
- usuário responsável;
- data/hora.

## Primeira implantação

Todos os materiais existentes recebem saldo inicial zero. Isso é intencional: o sistema não inventa um estoque a partir de pedidos anteriores.

O almoxarifado deve fazer uma conferência física e registrar o saldo real por material como entrada inicial.
