# SEO e indexação no Google — SUPRIR Educação

A V5.1.19 está preparada para o domínio oficial:

`https://suprir.caninde.codeedu.dev/`

## O que já está configurado

- `canonical` apontando para o domínio oficial;
- Open Graph e Twitter Cards com URLs absolutas;
- dados estruturados Schema.org;
- `robots.txt` liberando a página pública e indicando o sitemap;
- `sitemap.xml` apontando para o domínio oficial;
- redirecionamento 301 do alias técnico `sistema-materiais-caninde.pages.dev` para o domínio oficial;
- mantém redirecionamento do alias legado `sistema-materiais-caninde.pages.dev` para o domínio oficial;
- recuperação de senha usando o domínio oficial em produção.

## Supabase Auth

Em Authentication > URL Configuration, configure:

Site URL:
`https://suprir.caninde.codeedu.dev`

Redirect URLs:
`https://suprir.caninde.codeedu.dev/**`

Para desenvolvimento local, mantenha também:
`http://localhost:8788/**`

## Google Search Console

1. Adicione a propriedade de domínio `suprir.caninde.codeedu.dev`.
2. Valide por DNS TXT no Cloudflare.
3. Envie `sitemap.xml`.
4. Inspecione `https://suprir.caninde.codeedu.dev/` e solicite indexação.
5. Depois da indexação, teste a pesquisa `site:suprir.caninde.codeedu.dev`.

As áreas autenticadas não devem ser indexadas; o conteúdo público indexável é a página de acesso.

## Nomes oficiais da publicação

- Projeto Cloudflare Pages: `suprir`
- Repositório GitHub: `Laeciogomes/SUPRIR`
- Domínio oficial: `https://suprir.caninde.codeedu.dev/`
- Alias técnico Pages (imutável): `https://sistema-materiais-caninde.pages.dev/` (redirecionado para o domínio oficial)


## Favicon do Google

A V5.1.19 inclui um favicon próprio do SUPRIR Educação em `/favicon.ico`, `/favicon-48x48.png`, `/favicon-96x96.png` e `/favicon-192x192.png`. Os ícones do PWA e o `apple-touch-icon` usam a mesma identidade visual.

Após publicar a versão, solicite novamente a inspeção/indexação da página inicial no Google Search Console. A troca do favicon nos resultados de pesquisa depende de novo rastreamento pelo Google e pode não ser imediata.
