# Fluxo operacional e permissões — SUPRIR Educação V5.1

## Perfis

### Escola — `school_user`

Cria pedidos, acompanha o andamento e confirma o recebimento das remessas vinculadas à própria unidade. Não acessa pedidos de outras escolas.

### SME — Análise e autorização — `sme_authorizer`

Recebe pedidos enviados pelas escolas, analisa, define quantidades autorizadas, registra justificativas e autoriza ou rejeita. Não separa nem expede materiais.

### Almoxarifado — `warehouse_operator`

Recebe pedidos já autorizados, inicia a separação física e registra a saída/remessa com data, documento, quantidades e observações. Não autoriza pedidos.

### Administrador do sistema — `system_admin`

Possui visão global, administra usuários, escolas, materiais e configurações e pode acompanhar todas as etapas.

## Matriz resumida

| Ação | Escola | SME/Análise | Almoxarifado | Admin |
|---|---:|---:|---:|---:|
| Criar pedido | Sim | Não | Não | Não |
| Receber pedido para análise | Não | Sim | Não | Sim |
| Autorizar/rejeitar | Não | Sim | Não | Sim |
| Iniciar separação | Não | Não | Sim | Sim |
| Registrar remessa | Não | Não | Sim | Sim |
| Confirmar recebimento | Própria escola | Não | Não | Não |
| Gerenciar usuários | Não | Não | Não | Sim |
| Gerenciar escolas/materiais | Não | Não | Não | Sim |

## Fluxo de situação

1. `draft` — rascunho da escola.
2. `submitted` — enviado à SME.
3. `under_review` — em análise.
4. `approved` — autorizado.
5. `preparing` — em separação no almoxarifado.
6. `dispatched` — remessa expedida e aguardando confirmação da escola.
7. `partially_delivered` — parte do autorizado foi recebida e ainda existe saldo.
8. `delivered` — todas as quantidades autorizadas foram confirmadas como recebidas.

## Confirmação pela escola

Ao confirmar uma remessa, a escola informa a data real do recebimento e pode registrar observações. O sistema salva:

- usuário da escola que confirmou;
- nome do usuário;
- data/hora da confirmação;
- data do recebimento;
- observações;
- evento de auditoria correspondente.

Não existe usuário de entrega nem atribuição de remessa a motorista/entregador.

## Segurança

As restrições existem em três camadas:

1. interface: menus e ações por perfil;
2. RPCs: validação da responsabilidade antes de qualquer alteração;
3. RLS: escola acessa somente sua unidade e equipe interna acessa somente o escopo permitido.
