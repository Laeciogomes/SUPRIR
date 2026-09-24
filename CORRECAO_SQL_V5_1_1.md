# Correção SQL — V5.1.1

O erro `syntax error at or near "position"` vinha da função legada `list_delivery_agents()` na migração 009.

## Se a migração 009 falhou na linha 228

Como a migração usa `BEGIN`/`COMMIT`, execute novamente o arquivo corrigido:

1. `supabase/migrations/009_perfis_operacionais_v5.sql`
2. `supabase/migrations/010_remover_entregador_confirmacao_escola_v5_1.sql`

Ou, de forma mais simples, execute apenas:

`supabase/MIGRACAO_V4_8_PARA_V5_1_1.sql`

## Instalação nova

Use `supabase/BANCO_COMPLETO_V5_1.sql`, já corrigido.
