# Logo definitiva da Secretaria Municipal de Educação

A versão V4.6 já vem com a logo correta aplicada no sistema.

Arquivo principal:

```txt
public/assets/brand/logo-secretaria-educacao-caninde.png
```

Caminho usado pelo sistema:

```env
VITE_LOGO_URL=/assets/brand/logo-secretaria-educacao-caninde.png
```

Configuração que deve estar no banco:

```sql
update public.system_settings
set
  logo_url = '/assets/brand/logo-secretaria-educacao-caninde.png',
  compact_logo_url = '/assets/brand/brasao-caninde.webp',
  planning_logo_url = '/assets/brand/brasao-caninde.webp'
where id = 1;
```

Para atualizar bancos antigos, execute:

```txt
supabase/migrations/008_logo_definitiva_secretaria_educacao.sql
```

Os arquivos antigos de compatibilidade também foram substituídos pela marca nova, para evitar que a logo anterior apareça caso o banco ainda tenha um caminho antigo salvo.
