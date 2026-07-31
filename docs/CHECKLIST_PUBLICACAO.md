# Checklist de publicação — Canindé

## Supabase

- [ ] Backup do banco realizado.
- [ ] Em instalação nova, `supabase_schema_v4.sql` executado sem erro.
- [ ] Em atualização da V2, as migrações `002_identidade_visual_caninde.sql` e `003_acessos_escolas_por_codigo.sql` foram executadas.
- [ ] Tabelas e políticas RLS conferidas.
- [ ] Primeiro administrador promovido para `sme_admin`.
- [ ] Cadastro público desabilitado.
- [ ] Escola de teste, materiais e usuários de teste cadastrados.

## Cloudflare Pages

- [ ] Build command: `npm run build`.
- [ ] Output directory: `dist`.
- [ ] `VITE_SUPABASE_URL` configurada.
- [ ] `VITE_SUPABASE_ANON_KEY` configurada com chave pública.
- [ ] `SUPABASE_URL` configurada para as Functions.
- [ ] `SUPABASE_SERVICE_ROLE_KEY` cadastrada como segredo.
- [ ] Nenhuma chave secreta usa o prefixo `VITE_`.
- [ ] Novo deploy realizado após alterar variáveis.

## Identidade visual

- [ ] Marca horizontal aparece no login e no menu.
- [ ] Brasão compacto aparece no carregamento e no celular.
- [ ] Brasão / marca institucional aparece na central de relatórios.
- [ ] Relatório impresso mostra a marca sobre fundo grafite.
- [ ] Nome do município, núcleo, endereço, telefone e rodapé revisados.

## Testes por perfil

- [ ] Escola cria, salva e envia pedido.
- [ ] Escola não vê dados de outra unidade.
- [ ] Operador recebe pedido, separa e registra remessa.
- [ ] Gestor autoriza/rejeita com auditoria.
- [ ] Administrador cria usuário e redefine senha.
- [ ] Recebimento registra entregador, recebedor e responsáveis pelos lançamentos.
- [ ] Entrega parcial mantém saldo correto.
- [ ] Escola confirma o recebimento.
- [ ] Relatórios de pedidos, materiais e entregas filtram, imprimem e exportam CSV.

## Segurança

- [ ] Usuário inativo não acessa o sistema.
- [ ] Tentativas de alteração indevida são bloqueadas pelo RLS.
- [ ] Segredos não aparecem em repositório, print ou código do navegador.
- [ ] `.env.local` e `.dev.vars` permanecem fora do Git.

## Versão 4 — login e importação das escolas

- [ ] Migração `003_acessos_escolas_por_codigo.sql` executada.
- [ ] Coluna `schools.login_code` visível no Table Editor.
- [ ] `VITE_SCHOOL_LOGIN_DOMAIN` configurado no build.
- [ ] `SCHOOL_LOGIN_DOMAIN` configurado nas Pages Functions.
- [ ] Os dois domínios têm exatamente o mesmo valor.
- [ ] Administrador da SME consegue abrir **Usuários > Importar escolas**.
- [ ] Arquivo `escolas_caninde_credenciais.csv` foi processado.
- [ ] Resultado mostra 59 linhas.
- [ ] Uma escola de teste consegue entrar com código e PIN.
- [ ] O primeiro acesso exige senha nova de 8 ou mais caracteres.
- [ ] Reimportação com redefinição desmarcada preserva a senha alterada.
- [ ] CSV com credenciais foi removido do computador de trabalho ou guardado em local restrito.
