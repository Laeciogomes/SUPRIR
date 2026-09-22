Versão 4.8 — Sistema de Pedidos e Entrega de Materiais de Canindé

# Sistema Integrado de Pedidos e Entrega de Materiais — Canindé V4.8

Sistema web para a Secretaria Municipal de Educação controlar pedidos, autorizações, entregas, recebimentos e relatórios de materiais solicitados pelas escolas.

## Destaques da V4.8

- Logo definitiva da Secretaria Municipal de Educação aplicada no login, sistema e relatórios.
- Compatibilidade com caminhos antigos de logo: mesmo se o banco ainda apontar para a logo anterior, a imagem exibida será a nova.
- Cache PWA atualizado para evitar exibição da marca antiga.
- Fonte ampliada para melhor leitura.
- Todas as mensagens importantes em modais do próprio sistema.
- Correção do fechamento de modais.
- Exclusão de escolas pelo sistema, somente para administrador da SME e com proteção de histórico.
- App instalável no Android, iPhone e computador.
- Importação em lote das 59 escolas com código e senha inicial.
- Catálogo inicial com 215 materiais separados por categoria.
- Cloudflare Pages Functions para criação de usuários, redefinição de senha e importação das escolas.

## Estrutura principal

```txt
src/                         código do sistema
functions/                   APIs administrativas do Cloudflare Pages
public/assets/brand/          logos, brasão e identidade visual
public/assets/pwa/            ícones do aplicativo instalável
supabase/                     SQL completo e migrações
data/                         catálogo inicial de materiais
private/importacao/           CSV das escolas e modelo de importação
docs/                         documentação de apoio
```

## Instalação rápida

Leia primeiro o arquivo:

```txt
LEIA_PRIMEIRO.txt
```

Para banco novo, execute no Supabase:

```txt
supabase/BANCO_COMPLETO_V4_7.sql
```

Para banco já usado e só corrigir a logo definitiva:

```txt
supabase/migrations/008_logo_definitiva_secretaria_educacao.sql
```

Depois configure `.env` e `.dev.vars`, rode:

```powershell
npm.cmd install
npm.cmd run dev
```

Abra:

```txt
http://127.0.0.1:8788
```

## Publicação no Cloudflare Pages

```txt
Build command: npm run build
Build output directory: dist
```

Variáveis públicas:

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

Variáveis secretas das Functions:

```env
SUPABASE_URL=https://SEU-PROJETO.supabase.co
SUPABASE_SERVICE_ROLE_KEY=SUA_CHAVE_SECRETA
SCHOOL_LOGIN_DOMAIN=escolas.caninde.ce.gov.br
```

A `SUPABASE_SERVICE_ROLE_KEY` deve ser a chave secreta, normalmente `sb_secret_...`, ou a `service_role` legacy. Não use `sb_publishable_...` nessa variável.


## Atualização V4.8

- Relatório de pedidos detalhado por produto, com material, categoria, unidade, quantidade solicitada, autorizada, entregue, saldo e observações.
- Impressão/PDF e exportação CSV geram os produtos discriminados por pedido.
