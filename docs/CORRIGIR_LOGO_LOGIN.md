# Correção da logo no login

Se a logo aparecer como imagem quebrada:

1. Confirme que o arquivo existe no projeto:
   `public/assets/brand/logo-secretaria-educacao-caninde.png`
2. Use no `.env`:
   `VITE_LOGO_URL=/assets/brand/logo-secretaria-educacao-caninde.png`
3. Execute no Supabase:
   `supabase/migrations/007_corrigir_logo_login.sql`
4. Pare o servidor e rode novamente:
   `npm.cmd run dev`
5. Abra no navegador:
   `/assets/brand/logo-secretaria-educacao-caninde.png`
   Se abrir a imagem, o caminho está correto.
6. Limpe o cache do PWA/service worker se a versão antiga continuar aparecendo.
