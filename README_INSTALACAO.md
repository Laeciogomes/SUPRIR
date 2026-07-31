Versão 4.8 — Sistema de Pedidos e Entrega de Materiais de Canindé

# Manual de instalação — Sistema Canindé V4.8

## 1. Preparar o banco no Supabase

Para uma instalação nova, abra o Supabase, entre em **SQL Editor**, crie uma nova query e execute o arquivo:

```txt
supabase/BANCO_COMPLETO_V4_7.sql
```

Esse arquivo cria as tabelas, políticas de segurança, funções, configurações, permissões, catálogo inicial de materiais e identidade visual definitiva.

Se você já estava usando a versão anterior e quer apenas aplicar a logo nova, execute:

```txt
supabase/migrations/008_logo_definitiva_secretaria_educacao.sql
```

## 2. Criar o administrador da SME

No Supabase, vá em **Authentication > Users** e crie o usuário da SME.

Depois, no **SQL Editor**, rode:

```sql
update public.profiles
set
  account_type = 'sme',
  permission_level = 'sme_admin',
  role = 'admin',
  active = true,
  must_change_password = false,
  school_id = null,
  updated_at = now()
where lower(email) = lower('SEU_EMAIL_AQUI');
```

Confira:

```sql
select email, account_type, permission_level, active
from public.profiles
where lower(email) = lower('SEU_EMAIL_AQUI');
```

O resultado precisa mostrar:

```txt
account_type: sme
permission_level: sme_admin
active: true
```

## 3. Configurar o sistema local

Copie os arquivos de exemplo:

```powershell
Copy-Item .env.example .env -Force
Copy-Item .dev.vars.example .dev.vars -Force
```

Abra o `.env`:

```powershell
notepad .env
```

Preencha:

```env
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=SUA_CHAVE_PUBLICA
VITE_MUNICIPIO_NOME="Prefeitura Municipal de Canindé"
VITE_SECRETARIA_NOME="Secretaria Municipal de Educação"
VITE_TITULO_SISTEMA="Sistema Integrado de Pedidos e Entrega de Materiais"
VITE_LOGO_URL=/assets/brand/logo-secretaria-educacao-caninde.png
VITE_LOGO_COMPACTA_URL=/assets/brand/brasao-caninde.webp
VITE_LOGO_PLANEJAMENTO_URL=/assets/brand/brasao-caninde.webp
VITE_LOGO_FALLBACK_URL=/assets/brand/brasao-caninde.webp
VITE_SCHOOL_LOGIN_DOMAIN=escolas.caninde.ce.gov.br
```

Abra o `.dev.vars`:

```powershell
notepad .dev.vars
```

Preencha:

```env
SUPABASE_URL=https://SEU-PROJETO.supabase.co
SUPABASE_SERVICE_ROLE_KEY=SUA_CHAVE_SECRETA_DO_SUPABASE
SCHOOL_LOGIN_DOMAIN=escolas.caninde.ce.gov.br
```

Atenção: `SUPABASE_SERVICE_ROLE_KEY` não é a chave pública. Não coloque `sb_publishable_...` nessa variável. Use `sb_secret_...` ou a chave `service_role` legacy.

## 4. Rodar localmente

No PowerShell, dentro da pasta do projeto:

```powershell
npm.cmd install
npm.cmd run dev
```

Abra:

```txt
http://127.0.0.1:8788
```

Não use a porta `5173` para importação de escolas. A importação usa as Functions do Cloudflare e precisa rodar pela porta `8788`.

## 5. Importar as escolas

Entre pelo portal **SME** com o administrador.

Vá em:

```txt
Usuários → Importar escolas
```

Use o arquivo:

```txt
private/importacao/escolas_caninde_credenciais.csv
```

Na primeira importação, deixe desmarcada a opção de redefinir senhas existentes.

## 6. Conferir a logo

Teste direto no navegador:

```txt
http://127.0.0.1:8788/assets/brand/logo-secretaria-educacao-caninde.png
```

Se aparecer a logo da Secretaria Municipal de Educação, o arquivo está correto.

Se a logo antiga aparecer por cache do PWA:

1. Aperte `Ctrl + Shift + R`.
2. Se continuar, aperte `F12`.
3. Vá em **Application > Service Workers**.
4. Clique em **Unregister**.
5. Vá em **Storage**.
6. Clique em **Clear site data**.
7. Abra o sistema novamente.

## 7. Publicar no Cloudflare Pages

No projeto do Cloudflare Pages, configure:

```txt
Build command: npm run build
Build output directory: dist
```

Adicione as mesmas variáveis públicas do `.env` e as variáveis secretas do `.dev.vars` em **Settings > Variables and Secrets**.

A variável `SUPABASE_SERVICE_ROLE_KEY` deve ser marcada como segredo.


## Atualização V4.8

- Relatório de pedidos detalhado por produto, com material, categoria, unidade, quantidade solicitada, autorizada, entregue, saldo e observações.
- Impressão/PDF e exportação CSV geram os produtos discriminados por pedido.
