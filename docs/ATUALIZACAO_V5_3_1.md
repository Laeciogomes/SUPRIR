# Atualização V5.3.1 — editar e excluir pedidos antes da autorização

A V5.3.1 mantém o Realtime da V5.3.0 e acrescenta duas ações ao portal da escola:

- **Editar pedido** enquanto o status for `draft`, `submitted` ou `under_review`.
- **Excluir pedido** enquanto o status for `draft`, `submitted` ou `under_review`.

Assim que a SME autorizar o pedido (`approved`), ou o pedido entrar em qualquer etapa posterior/final, as duas ações ficam bloqueadas na interface e também no banco de dados.

## Atualização do banco

Para uma instalação que já está na V5.3.0, execute somente:

1. `supabase/migrations/013_edicao_exclusao_pedido_escola_v5_3_1.sql`
2. `supabase/VALIDACAO_PEDIDOS_V5_3_1.sql`

A validação deve retornar `true` para os três campos.

## Comportamento da edição

Se o pedido já tiver sido enviado ou recebido pela SME, a edição preserva o status atual. Ela não devolve o pedido para rascunho. A alteração é registrada no histórico e aparece via Realtime para a SME.

## Comportamento da exclusão

A exclusão remove o pedido operacional e seus itens/eventos relacionados, mas antes grava uma cópia de auditoria em `request_deletion_audit`. Somente o administrador do sistema pode consultar essa tabela diretamente.

## Teste recomendado

1. Escola cria e envia um pedido.
2. Escola edita: a SME deve receber a alteração automaticamente.
3. Escola exclui outro pedido ainda não autorizado: ele deve desaparecer das telas em tempo real.
4. Crie um novo pedido e autorize pela SME.
5. Volte ao portal da escola: os botões **Editar pedido** e **Excluir pedido** não devem mais aparecer.
