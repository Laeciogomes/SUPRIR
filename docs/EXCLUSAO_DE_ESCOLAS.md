# Exclusão de escolas

A versão 4.3 permite excluir escolas pela tela:

```text
SME → Escolas → botão excluir
```

## Regras

- Somente usuários com permissão `sme_admin` podem excluir escolas.
- Escolas com pedidos ou movimentações não devem ser excluídas, para preservar relatórios e auditoria.
- Quando houver histórico, use a opção de deixar a escola inativa no cadastro.

## Banco de dados

A instalação completa já possui a política de exclusão. Se o Supabase bloquear a ação, execute:

```text
supabase/migrations/005_permissao_excluir_escolas.sql
```
