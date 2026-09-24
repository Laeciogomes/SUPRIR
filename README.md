# SUPRIR Educação — Canindé V5.1.15

**Gestão de pedidos, autorização, separação, expedição e recebimento de materiais da rede municipal de ensino.**

O SUPRIR Educação organiza o fluxo entre escolas, Secretaria Municipal de Educação e almoxarifado, com responsabilidades separadas, auditoria e regras de segurança no Supabase.

## Fluxo da V5.1.15

1. **Escola** cria e envia o pedido.
2. **SME — Análise e autorização** recebe, analisa, autoriza ou rejeita.
3. **Almoxarifado — Separação e expedição** separa os materiais e registra a remessa.
4. **Escola** confirma o recebimento da remessa no próprio portal.
5. **Administrador do sistema** acompanha e administra toda a operação.

A V5.1.15 remove o antigo perfil de entregador. Não existe mais usuário `delivery_agent`, atribuição de remessa a entregador ou confirmação intermediária por equipe de entrega.

## Perfis

| Perfil | Código | Responsabilidade principal |
|---|---|---|
| Escola | `school_user` | Solicitar, acompanhar e confirmar o recebimento da própria unidade |
| SME — Análise e autorização | `sme_authorizer` | Receber, analisar, autorizar e rejeitar pedidos |
| Almoxarifado | `warehouse_operator` | Separar materiais e registrar a expedição/remessa |
| Administrador do sistema | `system_admin` | Administração total, cadastros e visão global |

As permissões são aplicadas na interface, nas RPCs e nas políticas RLS do Supabase.

## Banco de dados

### Instalação nova

Execute:

```txt
supabase/BANCO_COMPLETO_V5_1.sql
```

### Banco já atualizado para V5.0

Execute:

```txt
supabase/migrations/010_remover_entregador_confirmacao_escola_v5_1.sql
```

### Banco ainda na V4.8

Execute, nesta ordem:

```txt
supabase/migrations/009_perfis_operacionais_v5.sql
supabase/migrations/010_remover_entregador_confirmacao_escola_v5_1.sql
```

Faça backup antes de qualquer migração.

## Estrutura principal

```txt
src/                         aplicação web
functions/                   APIs administrativas do Cloudflare Pages
public/                      PWA, assets e arquivos públicos
supabase/                     SQL completo e migrações
data/                         catálogo inicial de materiais
private/importacao/           modelos de importação
docs/                         documentação operacional
```

## Configuração

Variáveis públicas recomendadas:

```env
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=SUA_CHAVE_PUBLICA
VITE_NOME_SISTEMA="SUPRIR Educação"
VITE_SUBTITULO_SISTEMA="Gestão de pedidos e distribuição de materiais"
VITE_MUNICIPIO_NOME="Prefeitura Municipal de Canindé"
VITE_SECRETARIA_NOME="Secretaria Municipal de Educação"
VITE_TITULO_SISTEMA="SUPRIR Educação — Gestão de Pedidos e Distribuição de Materiais"
VITE_SCHOOL_LOGIN_DOMAIN=escolas.caninde.ce.gov.br
```

Variáveis secretas das Functions:

```env
SUPABASE_URL=https://SEU-PROJETO.supabase.co
SUPABASE_SERVICE_ROLE_KEY=SUA_CHAVE_SECRETA
SCHOOL_LOGIN_DOMAIN=escolas.caninde.ce.gov.br
```

## Execução local

```powershell
npm.cmd install
npm.cmd run dev
```

## Publicação

No Cloudflare Pages:

```txt
Projeto: suprir
Build command: npm run build
Build output directory: dist
Domínio oficial: https://suprir.caninde.codeedu.dev
```

Publicação manual:

```powershell
npm run build
npx wrangler pages deploy dist --project-name suprir
```

Repositório oficial: `https://github.com/Laeciogomes/SUPRIR`.

Antes de publicar em produção, use `docs/CHECKLIST_PUBLICACAO.md`.


## Indexação no Google

A V5.1.15 inclui metadados SEO, dados estruturados, `robots.txt` e `sitemap.xml`. Consulte `docs/SEO_GOOGLE.md` antes da publicação, principalmente se for usado domínio próprio em vez do endereço padrão do Cloudflare Pages.
