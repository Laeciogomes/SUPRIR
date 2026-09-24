# V5.2.1 — pesquisa e paginação em Usuários e Materiais

## 5.2.1

- Adiciona pesquisa por nome na tela de Usuários.
- Adiciona pesquisa por nome na tela de Materiais/Estoque.
- Pesquisa ignora diferenças de maiúsculas/minúsculas e acentos.
- Pagina as duas listas em 15 registros por página.
- Adiciona controles Anterior/Próxima e resumo de registros exibidos.
- Não altera banco de dados, estoque, permissões ou fluxo operacional.

# V5.2.0 — Controle de estoque integrado

## 5.2.0

- Adiciona saldo físico de estoque por material.
- Escola visualiza somente materiais ativos com saldo disponível.
- SME passa a consultar o estoque atual e vê o saldo no momento da autorização.
- Almoxarifado e administrador podem cadastrar materiais e registrar novas entradas sempre que houver recebimento.
- Saídas/remessas baixam o estoque automaticamente e de forma transacional.
- Adiciona histórico auditável de entradas e saídas com saldo anterior e posterior, documento, usuário e data.
- Impede solicitação, autorização ou expedição acima do saldo disponível.
- Mantém estoque mínimo para alertas de reposição.

# V5.1.19 — correção do ícone do menu lateral recolhido

## 5.1.19

- Substituído o símbolo antigo do menu lateral recolhido pelo mesmo ícone usado no favicon.
- Ajustado o tamanho do ícone compacto do menu lateral para melhor visualização.
- Mantida a padronização da marca do SUPRIR na tela de login.

# V5.1.18 — padronização da marca do SUPRIR com o favicon

## 5.1.18

- Substituída a logo textual do SUPRIR exibida acima do card de acesso pelo mesmo ícone do favicon.
- Mantida a faixa superior apenas com a marca da Prefeitura Municipal de Canindé / Secretaria de Educação.
- Ajustado o tamanho do símbolo para ficar proporcional e limpo na tela de login.

# V5.1.17 — remoção do símbolo extra no topo do login

## 5.1.17

- Removido o símbolo do SUPRIR do lado direito da faixa superior da tela de login.
- Mantida apenas a marca da Prefeitura Municipal de Canindé / Secretaria de Educação no topo.
- Mantida a logo do SUPRIR acima do card “Acesso ao sistema”.

# V5.1.16 — atualização das marcas e refinamento da tela de acesso

## 5.1.16

- Substituída a marca antiga do SUPRIR pela marca atual nas áreas de login.
- Adicionada a logo completa do SUPRIR acima do card de acesso ao sistema.
- Melhorada a legibilidade da marca municipal no menu lateral com superfície clara.

## 5.1.14

- Mantém `suprir` como nome atual do projeto Cloudflare Pages.
- Reconhece `sistema-materiais-caninde.pages.dev` como subdomínio técnico original e imutável do Pages.
- Mantém `https://suprir.caninde.codeedu.dev` como único domínio oficial/canônico.
- Redireciona o alias técnico original para o domínio oficial.
- Corrige documentação para não indicar `suprir.pages.dev` como endereço existente.
- Não altera banco, perfis, permissões ou fluxo operacional.

# V5.1.14 — Renomeação oficial Cloudflare/GitHub

## 5.1.14

- Nome do projeto Cloudflare Pages: `suprir`.
- Repositório GitHub oficial passa a ser `Laeciogomes/SUPRIR`.
- Mantém `https://suprir.caninde.codeedu.dev` como domínio canônico oficial.
- Mantém `sistema-materiais-caninde.pages.dev` como alias técnico imutável do Cloudflare Pages.
- Redireciona esse alias técnico para o domínio oficial.
- Atualiza documentação e cache do PWA.
- Não altera banco, perfis, permissões ou fluxo operacional.

# V5.1.12 — Domínio oficial e SEO

## 5.1.12

- Define `https://suprir.caninde.codeedu.dev` como URL pública oficial.
- Atualiza canonical, Open Graph, Twitter Cards, Schema.org, robots.txt e sitemap.xml.
- Adiciona redirecionamento 301 do alias `sistema-materiais-caninde.pages.dev` para o domínio oficial.
- Recuperação de senha passa a usar o domínio oficial em produção e mantém localhost no desenvolvimento.
- Atualiza a documentação de Supabase Auth e Google Search Console.
- Não altera banco, perfis, permissões nem fluxo operacional.

# V5.1.11 — Melhor aproveitamento do painel institucional do login

## 5.1.11
- Corrigidos canonical, Open Graph, robots.txt e sitemap.xml para o domínio real de produção: https://sistema-materiais-caninde.pages.dev/.
- Atualizado o cache do Service Worker para evitar carregar arquivos antigos após a publicação.


- Aumenta título, subtítulo e cards do lado esquerdo em notebooks e monitores de baixa altura, como 1366×600.
- Elimina o vazio visual excessivo entre a marca institucional e o bloco de conteúdo.
- Mantém o login integralmente dentro da viewport, sem rolagem.
- Não altera banco de dados, permissões ou fluxo operacional.

# V5.1.6 — Correção de build do SEO

- Corrigido erro `EISDIR: illegal operation on a directory, read` no `vite build`.
- O `canonical`, `og:url` e o link do sitemap agora usam URL absoluta, evitando que o Vite tente processar `/` como asset local.
- Nenhuma alteração de banco de dados, permissões, fluxo ou interface.

# V5.1.5 — Login responsivo, menu compacto e preparação para Google

- Reorganiza o conteúdo institucional do lado esquerdo do login para eliminar o grande vazio em telas baixas.
- Mantém o login sem rolagem e com adaptação automática à largura e à altura disponíveis.
- Corrige o rodapé do menu lateral recolhido: remove as iniciais redundantes e mantém apenas a ação de saída, com tooltip.
- Mantém tooltips nos itens do menu quando recolhido.
- Reforça a compactação do menu em telas de pouca altura, sem barra de rolagem.
- PWA passa a permitir orientação horizontal e vertical (`orientation: any`).
- Adiciona metadados SEO, canonical, Open Graph, Twitter Cards e Schema.org.
- Adiciona `robots.txt` e `sitemap.xml` para descoberta por mecanismos de busca.
- Remove a regra `_redirects` que o Wrangler marcava como loop inválido.

# Changelog

## V5.1.4 — 23/09/2026
- Restaura o login clássico de Canindé, preservando apenas o símbolo discreto do SUPRIR Educação.
- Login passa a ocupar exatamente a viewport, sem rolagem, com adaptação automática para horizontal e vertical.
- Menu lateral deixa de usar rolagem interna e comprime espaçamentos conforme a altura disponível.
- Adiciona botão hambúrguer para recolher/expandir o menu em desktop.
- No modo recolhido ficam apenas os ícones; os nomes aparecem em tooltip ao passar o mouse ou focar pelo teclado.
- Em celular, o hambúrguer continua abrindo o menu lateral completo.

## 5.1.3 — Login clássico restaurado e responsivo

- Restaura a tela de login ao padrão visual original de Canindé.
- Mantém a identidade institucional da Prefeitura/Secretaria sem substituição.
- Adiciona somente o símbolo do SUPRIR Educação ao cabeçalho institucional.
- Mantém o painel institucional visível também em celulares.
- Ajusta o login para desktop, tablet e celular, em orientação horizontal e vertical.
- Não altera banco de dados, perfis, permissões nem o fluxo operacional da V5.1.1.

## V5.1.2 — Login clássico restaurado

- Restaurado o layout de login da versão anterior, mantendo a identidade institucional de Canindé como antes.
- Mantido **SUPRIR Educação** como nome do produto.
- Adicionada marca própria do SUPRIR Educação sem substituir a marca da Prefeitura/Secretaria.
- Textos do login atualizados para o fluxo atual: Escola → SME → Almoxarifado → Escola confirma recebimento.
- Nenhuma alteração nas regras de banco, perfis ou permissões da V5.1.1.

## V5.1.1 — Correção SQL de instalação

- Corrigida a declaração do campo de retorno `position` na função legada `list_delivery_agents()` da migração 009.
- O identificador agora é citado como `"position"`, evitando erro de sintaxe do PostgreSQL/Supabase.
- Corrigidos `009_perfis_operacionais_v5.sql`, `BANCO_COMPLETO_V5_0.sql` e `BANCO_COMPLETO_V5_1.sql`.
- Criado `MIGRACAO_V4_8_PARA_V5_1_1.sql` para atualização em uma única execução.
- Nenhuma alteração funcional no fluxo V5.1: o perfil de entregador continua removido e a escola confirma o recebimento.

## V5.1 — Confirmação pela escola

- Removido o perfil operacional de Entrega/entregador.
- Perfis atuais: Escola, SME — Análise e autorização, Almoxarifado e Administrador do sistema.
- Almoxarifado registra a remessa sem selecionar entregador.
- A escola passa a registrar diretamente a data e a confirmação de recebimento.
- Usuário da escola e data/hora da confirmação ficam gravados na auditoria.
- Removidas a fila exclusiva de entregas e a RPC de confirmação por entregador.
- Removidos os campos de atribuição nominal `assigned_delivery_user_*`.
- Nova migração `010_remover_entregador_confirmacao_escola_v5_1.sql`.
- Novo SQL completo `BANCO_COMPLETO_V5_1.sql`.
- Cache do PWA atualizado para a V5.1.

## V5.0 — SUPRIR Educação

- Nova identidade do sistema: **SUPRIR Educação**.
- Login e navegação redesenhados com linguagem visual mais institucional e sóbria.
- Novo RBAC com cinco perfis: Escola, SME/Análise, Almoxarifado, Entrega e Administrador do sistema.
- Separação de permissões aplicada na interface, RPCs e políticas RLS do Supabase.
- Perfil SME/Análise dedicado ao recebimento, análise, autorização e rejeição.
- Perfil Almoxarifado dedicado à separação e expedição.
- Perfil Entrega dedicado às remessas atribuídas ao usuário.
- Nova vinculação da remessa a um entregador cadastrado, com snapshots para auditoria.
- Migração automática dos papéis legados para os novos perfis.
- Painéis e menus específicos para cada função.
- Fluxo das escolas preservado.
- Novo SQL completo `BANCO_COMPLETO_V5_0.sql` e migração `009_perfis_operacionais_v5.sql`.

# Versão 4.8

- Relatório de pedidos agora sai detalhado por produto, discriminando cada material do pedido.
- Na tela de relatórios, cada pedido mostra a tabela com material, categoria, unidade, quantidade solicitada, quantidade autorizada, quantidade entregue, saldo e observações.
- Na impressão/PDF, o relatório de pedidos possui resumo geral e uma seção por pedido com todos os produtos discriminados.
- Exportação CSV de pedidos passou a gerar uma linha por produto do pedido, facilitando conferência e prestação de contas.
- Mantidas as correções de PWA, instalação como app, logo centralizada, modais e demais melhorias anteriores.

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
