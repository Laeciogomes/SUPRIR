# Atualização para SUPRIR Educação V5.1

A V5.1 remove o perfil de entregador e simplifica o fluxo para:

**Escola solicita → SME autoriza → Almoxarifado expede → Escola confirma o recebimento.**

## Se o banco já está na V5.0

1. Faça backup.
2. Execute:

```txt
supabase/migrations/010_remover_entregador_confirmacao_escola_v5_1.sql
```

3. Publique o frontend V5.1.
4. Teste uma remessa completa.

## Se o banco ainda está na V4.8

Execute, nesta ordem:

```txt
supabase/migrations/009_perfis_operacionais_v5.sql
supabase/migrations/010_remover_entregador_confirmacao_escola_v5_1.sql
```

## O que a migração 010 faz

- remove `delivery_agent` da lista de níveis válidos;
- desativa contas que eventualmente tenham sido criadas como `delivery_agent`;
- remove a RPC de confirmação por entregador;
- remove a lista de entregadores;
- remove o vínculo `assigned_delivery_user_*` das remessas;
- altera `register_dispatch` para não exigir usuário de entrega;
- altera a confirmação da escola para registrar o recebimento diretamente;
- ajusta RLS e administração de perfis.

Registros históricos de remessas e recebimentos são preservados.
