# SUPRIR Educação — V5.5.0

Atualização **incremental sobre a V5.4.1**. Preserva as correções de segurança e a redefinição de senhas em lotes. Não modifica saldos nem pedidos existentes ao instalar, exceto pelo preenchimento do vínculo do material já autorizado em pedidos anteriores.

## Novidades

1. **Acerto de inventário pelo Almoxarifado/Administrador.** Em Estoque → botão **Ajustar saldo** (na linha do material, ou no topo para escolher um material). Informe o **saldo final físico** — não a diferença —, justificativa obrigatória e, se houver, número de documento. Pode aumentar ou reduzir o saldo. Cada alteração gera movimentação `adjustment_in` ou `adjustment_out`, preservando saldo anterior, saldo posterior, quantidade, usuário e justificativa. A opção **Registrar entrada** continua para o recebimento normal de novos materiais.
2. **Substituição autorizada pela SME.** Na autorização, cada item tem campo **Material que a SME autoriza** e quantidade. O material **pedido pela escola fica inalterado**. Quando trocado, exige justificativa e mesma unidade de medida. A autorização checa o saldo do material substituto e a soma de quantidades se duas linhas usarem o mesmo substituto. Exemplo: solicitadas 2 unidades de ar-condicionado 12.000 BTUs; autorizadas 2 unidades de ar-condicionado 18.000 BTUs. Na remessa, o Almoxarifado vê e expede **18.000 BTUs**, com baixa **apenas desse material**. A escola vê a substituição no pedido e nos relatórios.
3. **Termo de entrega em 2 vias.** Logo após confirmar a remessa aparece **Remessa expedida → Imprimir termo (2 vias)**. Também pode ser reimpresso pelo botão **Termo 2 vias** na lista de remessas e no detalhe de cada pedido. O documento imprime duas vias identificadas, uma **Almoxarifado** e outra **Escola**, com cabeçalho oficial, número da remessa/pedido, material realmente expedido, indicação de substituição, nomes dos responsáveis, linhas para ressalvas e assinaturas físicas. No diálogo de impressão, escolha a impressora ou **Salvar como PDF**. A confirmação eletrônica pela escola continua obrigatória.

## Instalação (ordem obrigatória)

1. Faça backup do banco no Supabase antes de alterar o esquema.
2. Supabase → SQL Editor → execute **apenas** `supabase/migrations/014_ajuste_estoque_substituicao_termo_v5_5.sql`. Não execute `BANCO_COMPLETO` nem migrações anteriores. A migração é transacional e idempotente apenas quanto às colunas; as funções são sobrescritas para a V5.5.0.
3. Rode `supabase/VALIDACAO_V5_5.sql`. As 9 verificações devem retornar `ok = true`.
4. Extraia o **pacote de atualização** por cima da pasta atual da V5.4.1, substituindo os arquivos. O pacote não contém `package.json`/`package-lock.json`, para **preservar as dependências já auditadas com zero vulnerabilidades**.
5. No PowerShell, dentro da pasta do projeto, execute:

   ```powershell
   npm version 5.5.0 --no-git-tag-version
   npm audit
   npm run build
   ```

6. Faça teste com uma **escola de demonstração**, sem movimentar indevidamente o estoque físico: teste autorização com troca, verificação do produto no Almoxarifado, impressão do termo em duas vias e o registro de acerto do inventário. Não confunda **cadastrar entrada** com **acertar saldo final**.
7. Se todas as verificações passarem, publique no GitHub e depois Cloudflare:

   ```powershell
   git add -A
   git diff --cached --check
   git commit -m "SUPRIR Educação v5.5.0 - acerto de estoque, substituição SME e termo em duas vias"
   git push origin main
   git tag -a v5.5.0 -m "SUPRIR Educação v5.5.0"
   git push origin v5.5.0
   npx wrangler pages deploy dist --project-name suprir
   git status
   npx wrangler pages deployment list --project-name suprir
   ```

## Regras de segurança

- Somente `sme_authorizer` e `system_admin` podem autorizar substituições.
- Somente `warehouse_operator` e `system_admin` podem realizar acertos de inventário e expedição.
- A base protege isso **nas RPCs**, não somente escondendo botões.
- A escola vê o nome do produto solicitado e do autorizado, sem mostrar o estoque físico.
- A remessa é descontada do saldo físico autorizado, sob bloqueio transacional, evitando saldo negativo.
- Não existe edição/exclusão arbitrária das movimentações antigas.
- Em teste de impressão o termo é **gerado a partir de dados reais da remessa**, que fica armazenada no banco. A assinatura física é colhida à parte.

## Verificação ilustrativa

Pedido: 2 × **AR CONDICIONADO 12000 BTUS** → SME autoriza 2 × **AR CONDICIONADO 18000 BTUS**.

- Pedido original: `material_id` continua sendo 12.000 BTUs.
- Item autorizado: `approved_material_id` aponta a 18.000 BTUs; razão em `sme_notes` e em `request_events.metadata.substitutions`.
- Expedição: `delivery_items.material_id` e `inventory_movements.material_id` apontam a 18.000 BTUs.
- Termo: identifica material entregue 18.000 BTUs e solicitado 12.000 BTUs.
