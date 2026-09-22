# Versão 4.8

- Relatório de pedidos agora sai detalhado por produto, discriminando cada material do pedido.
- Na tela de relatórios, cada pedido mostra a tabela com material, categoria, unidade, quantidade solicitada, quantidade autorizada, quantidade entregue, saldo e observações.
- Na impressão/PDF, o relatório de pedidos possui resumo geral e uma seção por pedido com todos os produtos discriminados.
- Exportação CSV de pedidos passou a gerar uma linha por produto do pedido, facilitando conferência e prestação de contas.
- Mantidas as correções de PWA, instalação como app, logo centralizada, modais e demais melhorias anteriores.

# Changelog

## V4.6

- Aplicada a logo definitiva da Secretaria Municipal de Educação de Canindé.
- Substituídos também os arquivos de compatibilidade usados pelas versões antigas, para impedir que a marca anterior apareça se o banco ainda estiver apontando para caminhos antigos.
- Adicionada migração `008_logo_definitiva_secretaria_educacao.sql` para forçar a logo nova no banco.
- Criado `supabase/BANCO_COMPLETO_V4_6.sql` para instalação completa do banco em uma única execução.
- Atualizado o cache do PWA para `materiais-caninde-v4-6-0`.
- Melhorada a leitura da logo no login.
- Incluída validação mais clara quando `SUPABASE_SERVICE_ROLE_KEY` é preenchida com chave pública `sb_publishable_...`.
- Mantidas as melhorias anteriores: fonte maior, modais institucionais, fechamento de modais, exclusão de escolas, catálogo inicial, importação de escolas e app instalável.

## V4.5

- Correção de caminho de logo e fallback visual.

## V4.4

- Inclusão da marca da Secretaria Municipal de Educação.

## V4.3

- Fonte ampliada.
- Modais substituindo alertas do navegador.
- Correção de fechamento de modais.
- Exclusão de escolas pelo sistema.
- Transformação em PWA instalável.

## V4.2

- Catálogo inicial de materiais.

## V4.1

- Correção do ambiente local para Cloudflare Pages Functions.

## V4.0

- Login por código da escola.
- Importação das 59 escolas com senhas iniciais.
