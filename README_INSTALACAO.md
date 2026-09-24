# Manual de instalação — SUPRIR Educação V5.2.1

## 1. Faça backup do Supabase

Antes da migração, gere um backup ou snapshot do banco de produção.

## 2. Atualize o banco

Para uma base que já está na V5.1.x, execute somente:

```txt
supabase/migrations/011_estoque_v5_2.sql
```

Para uma instalação nova, use:

```txt
supabase/BANCO_COMPLETO_V5_2.sql
```

A migração adiciona o saldo físico dos materiais, o histórico de movimentações e as RPCs de entrada/saída de estoque.

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

## 5. Teste obrigatório

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

## 6. Supabase Auth

- Site URL: `https://suprir.caninde.codeedu.dev`
- Redirect URL: `https://suprir.caninde.codeedu.dev/**`
- Desenvolvimento: `http://localhost:8788/**`

## 7. Build e Cloudflare

```powershell
npm install
npm run build
npx wrangler pages deploy dist --project-name suprir
```

O cache PWA da V5.2.1 possui nova chave para forçar a atualização da interface.
