# Manual de instalação — SUPRIR Educação V5.3.0

## 1. Faça backup do Supabase

Antes da migração, gere um backup ou snapshot do banco de produção.

## 2. Atualize o banco

Para uma base que já está na V5.2.x, execute somente:

```txt
supabase/migrations/012_realtime_v5_3.sql
```

Se a base ainda está na V5.1.x, execute nesta ordem:

```txt
supabase/migrations/011_estoque_v5_2.sql
supabase/migrations/012_realtime_v5_3.sql
```

Para uma instalação nova, use:

```txt
supabase/BANCO_COMPLETO_V5_3.sql
```

A migração 012 não altera saldos. Ela habilita as tabelas operacionais na publicação do Supabase Realtime para sincronização automática entre os portais.

## 3. Cadastre o estoque físico inicial

Após a migração, os materiais existentes ficam com saldo zero. Entre com um usuário `warehouse_operator` ou `system_admin` e acesse **Estoque**.

Para cada material existente:

1. Clique em **Entrada**;
2. informe a quantidade física existente no almoxarifado;
3. informe documento/observação, se houver;
4. confirme.

Somente depois da entrada o material passa a aparecer para as escolas.

## 4. Perfis

- `school_user`: solicita apenas o que estiver disponível;
- `sme_authorizer`: consulta saldos e autoriza pedidos;
- `warehouse_operator`: cadastra materiais, registra entradas e expede;
- `system_admin`: administração completa.

## 5. Teste obrigatório de estoque

Faça um teste com um material de saldo conhecido, por exemplo `100` unidades:

1. Registre entrada de `100`;
2. confirme que a escola enxerga o material;
3. crie um pedido de `20`;
4. autorize `20` na SME;
5. registre remessa de `20` no almoxarifado;
6. confira que o estoque passou automaticamente para `80`;
7. confira a movimentação `Saída -20` no histórico;
8. confirme o recebimento pela escola.

Também teste que uma saída maior que o saldo é bloqueada.

## 6. Teste obrigatório de tempo real

Abra o sistema em dois navegadores ou duas janelas, usando contas de perfis diferentes:

1. Escola envia um pedido;
2. confirme que ele aparece na fila da SME sem atualizar a página;
3. SME autoriza o pedido;
4. confirme que ele aparece no Almoxarifado sem F5;
5. confira na Escola que o status mudou automaticamente;
6. Almoxarifado expede;
7. confira a atualização automática da Escola e da SME.

Execute também `supabase/VALIDACAO_REALTIME_V5_3.sql`: todas as linhas devem retornar `true`.

## 7. Supabase Auth

- Site URL: `https://suprir.caninde.codeedu.dev`
- Redirect URL: `https://suprir.caninde.codeedu.dev/**`
- Desenvolvimento: `http://localhost:8788/**`

## 8. Build e Cloudflare

```powershell
npm install
npm run build
npx wrangler pages deploy dist --project-name suprir
```

O cache PWA da V5.3.0 possui nova chave para forçar a atualização da interface.
