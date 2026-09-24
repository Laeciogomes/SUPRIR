# Estrutura de pastas — SUPRIR Educação V5.1

```text
suprir-educacao-caninde/
├── public/
│   ├── assets/brand/                 marcas institucionais
│   ├── assets/pwa/                   ícones do aplicativo
│   ├── manifest.webmanifest          metadados do PWA
│   └── sw.js                         service worker
├── src/
│   ├── app/                          estado, ações, formulários e regras de interface
│   ├── auth/                         login e credenciais das escolas
│   ├── config/                       configuração do produto/município
│   ├── constants/workflow.js         status e níveis de acesso
│   ├── modals/                       modais operacionais
│   ├── services/                     integração com Supabase e downloads
│   ├── styles/                       componentes, marca municipal e refinamento V5
│   ├── views/                        painéis e telas por área
│   └── main.js                       entrada do Vite
├── functions/
│   ├── _shared/                      validações/serviços de servidor
│   └── api/users/                    criação, importação e redefinição de acessos
├── private/importacao/               arquivos de importação restritos
├── supabase/
│   ├── migrations/009_perfis_operacionais_v5.sql
│   ├── migrations/010_remover_entregador_confirmacao_escola_v5_1.sql
│   └── BANCO_COMPLETO_V5_1.sql
├── docs/                              documentação operacional
└── README_INSTALACAO.md
```

## Regras de manutenção

- Perfis e estados: `src/constants/workflow.js` + RPC/RLS no Supabase.
- Identidade do produto: `src/config/app-config.js` e `src/styles/product-v5.css`.
- Identidade municipal: `src/styles/branding-caninde.css` e `public/assets/brand/`.
- Chaves secretas: somente em Functions/variáveis protegidas do Cloudflare.
- Credenciais de escolas: nunca em `public/` nem em repositório público.
- Alterações de banco: sempre em nova migração numerada e refletidas no SQL completo da versão.
