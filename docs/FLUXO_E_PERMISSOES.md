# Fluxo operacional e permissões

## 1. Papéis do sistema

### Usuário da escola

Enxerga apenas a unidade vinculada ao seu perfil. Pode criar rascunhos, enviar pedidos, acompanhar o processo, consultar decisões da SME, verificar entregas, confirmar recebimento e emitir relatórios da escola.

### Operador da SME

Atua no fluxo operacional. Pode receber pedidos, iniciar a separação, registrar remessas, informar entregador, registrar quem recebeu na escola e consultar os relatórios da rede. Não pode autorizar pedidos nem administrar usuários.

### Gestor/autorizador da SME

Possui as funções do operador e pode definir as quantidades autorizadas, registrar justificativas, rejeitar solicitações, cancelar pedidos antes da expedição e manter os cadastros de escolas e materiais.

### Administrador da SME

Possui todas as permissões anteriores. Também cria usuários, redefine senhas, ativa ou desativa acessos, altera vínculos e configura os dados institucionais usados na interface e nos relatórios.

## 2. Matriz de permissões

| Operação | Escola | Operador SME | Gestor SME | Administrador SME |
|---|:---:|:---:|:---:|:---:|
| Consultar catálogo de materiais | Sim | Sim | Sim | Sim |
| Criar/editar rascunho da própria escola | Sim | Não | Não | Não |
| Enviar pedido | Sim | Não | Não | Não |
| Consultar pedidos de toda a rede | Não | Sim | Sim | Sim |
| Receber pedido na SME | Não | Sim | Sim | Sim |
| Autorizar ou rejeitar | Não | Não | Sim | Sim |
| Iniciar separação | Não | Sim | Sim | Sim |
| Registrar remessa | Não | Sim | Sim | Sim |
| Registrar recebimento na escola | Não | Sim | Sim | Sim |
| Confirmar recebimento pela escola | Sim | Não | Não | Não |
| Manter escolas e materiais | Não | Consulta | Sim | Sim |
| Gerenciar usuários | Não | Não | Não | Sim |
| Alterar identidade institucional | Não | Não | Não | Sim |
| Relatórios da própria escola | Sim | Sim | Sim | Sim |
| Relatórios de toda a rede | Não | Sim | Sim | Sim |

## 3. Estados do pedido

### Rascunho (`draft`)

O pedido foi salvo pela escola, mas ainda não foi enviado. Pode ser editado ou cancelado pela própria escola.

### Aguardando recebimento (`submitted`)

A escola enviou o pedido e recebeu um protocolo. Ainda pode cancelar enquanto a SME não iniciar a análise.

### Em análise (`under_review`)

Um usuário da SME registrou o recebimento. O sistema salva nome, e-mail, data e hora dessa ação.

### Autorizado (`approved`)

Um gestor definiu as quantidades aprovadas. O sistema salva quem autorizou, quando autorizou e as observações da decisão.

### Rejeitado (`rejected`)

O gestor rejeitou o pedido e registrou a justificativa, que fica visível para a escola.

### Em separação (`preparing`)

A equipe iniciou a preparação física dos materiais.

### Em transporte (`dispatched`)

Uma remessa foi criada. O registro contém documento, data de saída, entregador, setor, itens, quantidades e usuário que lançou a saída.

### Entrega parcial (`partially_delivered`)

A escola recebeu parte das quantidades autorizadas e ainda existe saldo para outra remessa.

### Concluído (`delivered`)

Todas as quantidades autorizadas foram registradas como recebidas. A escola ainda pode confirmar cada remessa no sistema.

### Cancelado (`cancelled`)

O pedido foi cancelado com justificativa, usuário, data e hora.

## 4. Auditoria registrada

O sistema mantém snapshots textuais para que o histórico continue legível mesmo depois de alterações cadastrais:

- quem criou o pedido;
- quem recebeu o pedido na SME;
- quem autorizou ou rejeitou;
- quem cancelou;
- quem registrou cada remessa;
- quem fez fisicamente a entrega;
- quem recebeu na escola;
- quem registrou o recebimento no sistema;
- quem confirmou o recebimento pelo portal da escola;
- data e hora de cada evento;
- situação anterior e nova situação.

## 5. Entregas parciais

Um pedido autorizado pode gerar várias remessas. Antes de aceitar uma nova remessa, o banco soma tudo o que já foi expedido e impede que a quantidade total ultrapasse o autorizado para cada item.

Exemplo:

```text
Solicitado: 100 resmas
Autorizado: 80 resmas
Primeira remessa: 50 resmas
Saldo disponível para nova remessa: 30 resmas
```

A conclusão ocorre quando a soma das remessas recebidas chega à quantidade total autorizada.

## 6. Relatórios

### Relatório de pedidos

Apresenta protocolo, escola, finalidade, totais solicitados, autorizados e entregues e situação atual.

### Consolidado de materiais

Agrupa os itens e mostra quantidade solicitada, autorizada, entregue, número de pedidos, escolas atendidas e percentual de atendimento.

### Relatório de entregas

Mostra remessa, pedido, escola, saída, recebimento, entregador, recebedor, usuário que registrou e confirmação da escola.

Os filtros disponíveis incluem período, escola e situação. Os resultados podem ser impressos, salvos como PDF pelo navegador ou exportados em CSV.

## Acesso das escolas na versão 4

- A escola seleciona o portal **Escola**.
- O identificador visível é `schools.login_code`, normalmente igual ao INEP.
- O PIN de 6 dígitos é temporário e usado somente no primeiro acesso ou após redefinição administrativa.
- Depois do primeiro login, o perfil `school_user` deve criar uma senha pessoal com pelo menos 8 caracteres.
- A escola não recebe acesso às unidades de outras escolas; o vínculo continua sendo reforçado pelas políticas RLS e por `profiles.school_id`.

## Importação em lote

Somente `sme_admin` pode chamar a função protegida de importação. O processo cria ou atualiza a escola, cria ou vincula o usuário do Supabase Auth e atualiza o perfil. A opção de sobrescrever senhas fica desmarcada por padrão para não substituir senhas pessoais já cadastradas.
