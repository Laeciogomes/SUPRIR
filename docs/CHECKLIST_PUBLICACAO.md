# Checklist de publicação — SUPRIR Educação V5.1

## Banco

- [ ] Backup do Supabase realizado.
- [ ] Instalação nova: `supabase/BANCO_COMPLETO_V5_1.sql` executado sem erro.
- [ ] V5.0 existente: migração `010_remover_entregador_confirmacao_escola_v5_1.sql` executada.
- [ ] V4.8 existente: migrações 009 e 010 executadas, nessa ordem.
- [ ] Não existem perfis ativos com nível antigo de entrega.

## Perfis

- [ ] Administrador (`system_admin`) acessa todo o sistema.
- [ ] SME/Análise (`sme_authorizer`) recebe, autoriza e rejeita.
- [ ] Almoxarifado (`warehouse_operator`) separa e registra remessas.
- [ ] Escola (`school_user`) confirma apenas remessas da própria escola.

## Fluxo funcional

- [ ] Escola cria e envia pedido.
- [ ] SME recebe o pedido.
- [ ] SME autoriza quantidades.
- [ ] Almoxarifado inicia separação.
- [ ] Almoxarifado registra saída/remessa sem selecionar entregador.
- [ ] Remessa fica como `dispatched` / aguardando recebimento.
- [ ] Escola visualiza a remessa enviada.
- [ ] Escola informa a data e confirma o recebimento.
- [ ] Usuário da escola fica gravado na auditoria.
- [ ] Pedido muda para `partially_delivered` ou `delivered` conforme as quantidades.

## Segurança

- [ ] Escola não vê pedidos de outra unidade.
- [ ] SME/Análise não consegue registrar remessa.
- [ ] Almoxarifado não consegue autorizar pedido.
- [ ] Usuário comum não consegue alterar perfil/permissão.

## Publicação

- [ ] `npm install` executado.
- [ ] `npm run build` concluído.
- [ ] Variáveis do Cloudflare revisadas.
- [ ] PWA atualizado para cache V5.1.
- [ ] Teste em desktop e celular realizado.
