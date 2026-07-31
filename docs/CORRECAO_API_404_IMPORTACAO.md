# Correção do erro 404 na importação de escolas

Erro comum:

```text
POST http://192.168.0.11:5173/api/users/import-schools 404 (Not Found)
Não foi possível processar o lote 1.
```

Isso acontece quando o sistema é aberto pelo servidor Vite puro, normalmente na porta `5173`. Esse modo abre somente o front-end e não carrega as Cloudflare Pages Functions da pasta `functions/`.

A importação de escolas usa a função:

```text
functions/api/users/import-schools.js
```

Por isso o sistema precisa ser aberto pelo ambiente local do Cloudflare Pages.

## Como resolver no Windows

Na pasta do projeto, pare o servidor atual com `Ctrl + C` e rode:

```powershell
npm.cmd install
npm.cmd run dev
```

Na versão 4.1, o comando `npm.cmd run dev` já executa o ambiente correto do Cloudflare Pages.

Se preferir chamar explicitamente:

```powershell
npm.cmd run pages:dev
```

Abra a URL mostrada pelo terminal, geralmente:

```text
http://127.0.0.1:8788
```

ou, na rede local:

```text
http://192.168.0.11:8788
```

Não use a URL da porta `5173` para testar importação, criação de usuário ou redefinição de senha.

## Arquivos de ambiente necessários

Crie `.env.local` a partir de `.env.example` e preencha as variáveis públicas:

```text
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=SUA_CHAVE_PUBLICA
```

Crie `.dev.vars` a partir de `.dev.vars.example` e preencha as variáveis secretas das funções:

```text
SUPABASE_URL=https://SEU-PROJETO.supabase.co
SUPABASE_SERVICE_ROLE_KEY=SUA_CHAVE_SERVICE_ROLE_SECRETA
SCHOOL_LOGIN_DOMAIN=escolas.caninde.ce.gov.br
```

Nunca coloque `SUPABASE_SERVICE_ROLE_KEY` em variável `VITE_*`.
