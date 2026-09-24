# Manual de instalação — SUPRIR Educação V5.1.15

## 1. Banco de dados

Faça backup do Supabase antes da atualização.

### Instalação nova

Execute no SQL Editor:

```txt
supabase/BANCO_COMPLETO_V5_1.sql
```

### Atualização de uma V5.0

Execute:

```txt
supabase/migrations/010_remover_entregador_confirmacao_escola_v5_1.sql
```

### Atualização de uma V4.8

Execute, nesta ordem:

```txt
supabase/migrations/009_perfis_operacionais_v5.sql
supabase/migrations/010_remover_entregador_confirmacao_escola_v5_1.sql
```

A V5.1.15 mantém apenas quatro perfis: `school_user`, `sme_authorizer`, `warehouse_operator` e `system_admin`.

Se uma base V5.0 possuir contas `delivery_agent`, a migração as converte para `warehouse_operator` **desativado**, evitando concessão automática de novas permissões. O administrador pode revisar e reativar apenas as contas que realmente devam operar no almoxarifado.

## 2. Administrador do sistema

Crie o usuário em **Supabase > Authentication > Users** e depois execute:

```sql
update public.profiles
set
  account_type = 'sme',
  permission_level = 'system_admin',
  role = 'admin',
  active = true,
  must_change_password = false,
  school_id = null,
  updated_at = now()
where lower(email) = lower('SEU_EMAIL_AQUI');
```

## 3. Equipe interna

Pelo próprio sistema, o administrador pode criar:

- **SME — Análise e autorização** (`sme_authorizer`);
- **Almoxarifado — Separação e expedição** (`warehouse_operator`);
- **Administrador do sistema** (`system_admin`).

A escola permanece com `school_user` e confirma o recebimento da própria remessa.

## 4. Variáveis de ambiente

```env
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=SUA_CHAVE_PUBLICA
VITE_NOME_SISTEMA="SUPRIR Educação"
VITE_SUBTITULO_SISTEMA="Gestão de pedidos e distribuição de materiais"
VITE_MUNICIPIO_NOME="Prefeitura Municipal de Canindé"
VITE_SECRETARIA_NOME="Secretaria Municipal de Educação"
VITE_SCHOOL_LOGIN_DOMAIN=escolas.caninde.ce.gov.br
VITE_PUBLIC_URL=https://suprir.caninde.codeedu.dev
```

Functions:

```env
SUPABASE_URL=https://SEU-PROJETO.supabase.co
SUPABASE_SERVICE_ROLE_KEY=SUA_CHAVE_SECRETA_DO_SUPABASE
SCHOOL_LOGIN_DOMAIN=escolas.caninde.ce.gov.br
```

## 5. Domínio oficial e Supabase Auth

Domínio oficial de produção:

`https://suprir.caninde.codeedu.dev`

No Supabase, em **Authentication > URL Configuration**, use:

- Site URL: `https://suprir.caninde.codeedu.dev`
- Redirect URL: `https://suprir.caninde.codeedu.dev/**`
- Desenvolvimento local: `http://localhost:8788/**`

O frontend usa `VITE_PUBLIC_URL` opcionalmente; se não for informado, o padrão já é `https://suprir.caninde.codeedu.dev`.

## 6. Teste local

```powershell
npm.cmd install
npm.cmd run dev
```

## 7. Teste do fluxo

Use contas diferentes e valide:

1. Escola cria e envia o pedido.
2. SME recebe, analisa e autoriza.
3. Almoxarifado inicia a separação e registra a remessa.
4. A remessa fica como **Aguardando recebimento**.
5. A própria escola informa a data e confirma o recebimento.
6. O sistema registra o usuário da escola responsável e recalcula automaticamente a situação do pedido.
7. Administrador confere o histórico e os relatórios.

## 8. Cloudflare Pages

```txt
Projeto Cloudflare Pages: suprir
Build command: npm run build
Build output directory: dist
Domínio oficial: https://suprir.caninde.codeedu.dev
```

Para publicar manualmente:

```powershell
npm run build
npx wrangler pages deploy dist --project-name suprir
```

O cache do PWA da V5.1.15 usa uma nova chave. Se um aparelho insistir em exibir a versão anterior, remova/reinstale o app ou limpe os dados do site.
