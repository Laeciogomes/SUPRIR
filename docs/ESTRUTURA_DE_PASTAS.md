# Estrutura de pastas — versão 4

```text
sistema-pedidos-materiais-caninde-v4/
├── public/
│   ├── assets/brand/                 imagens institucionais otimizadas
│   ├── _headers                      cabeçalhos de segurança do Cloudflare
│   └── _redirects                    fallback da aplicação SPA
├── src/
│   ├── app/application.js            telas, estado e eventos
│   ├── auth/school-credentials.js    login numérico e PIN inicial
│   ├── config/app-config.js          variáveis VITE e caminhos padrão
│   ├── constants/workflow.js         situações, prioridades e perfis
│   ├── styles/
│   │   ├── index.css                 entrada dos estilos
│   │   ├── tokens.css                cores, sombras e medidas
│   │   ├── core.css                  componentes e responsividade
│   │   ├── branding-caninde.css      identidade visual e importação
│   │   └── print-template.js         relatórios impressos
│   ├── ui/icons.js                   biblioteca de ícones SVG
│   ├── utils/
│   │   ├── formatters.js             datas, números e escape de HTML
│   │   └── csv.js                    leitura e validação de importações
│   └── main.js                       entrada do Vite
├── functions/
│   ├── _shared/
│   │   ├── http.js                   respostas JSON
│   │   ├── passwords.js              senhas temporárias da SME
│   │   ├── school-credentials.js     PIN e login técnico da escola
│   │   └── supabase-admin.js         validação do administrador
│   └── api/users/
│       ├── create.js                 criação individual
│       ├── import-schools.js         importação em lote
│       └── reset-password.js         redefinição de senha/PIN
├── private/importacao/
│   ├── escolas_caninde_credenciais.csv  59 escolas, uso local restrito
│   ├── modelo_importacao_escolas.csv    modelo sem dados reais
│   └── LEIA-ME.md                       orientação de segurança
├── supabase/
│   ├── migrations/                   atualizações incrementais
│   └── supabase_schema_v4_completo.sql
├── docs/                              documentação operacional
├── supabase_schema_v4.sql             instalação completa
└── README_INSTALACAO.md
```

## Regras de manutenção

- Identidade visual: `src/styles/branding-caninde.css` e `tokens.css`.
- Lógica de login da escola: manter cliente e servidor compatíveis em `src/auth/` e `functions/_shared/`.
- Chaves secretas: somente em `functions/` e nas variáveis protegidas do Cloudflare.
- Arquivos com credenciais: nunca em `public/` e nunca em repositório público.
- Alterações de banco: criar nova migração numerada em `supabase/migrations/`.
- Estados do pedido: atualizar `src/constants/workflow.js` e as funções SQL correspondentes.
