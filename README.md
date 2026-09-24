# SUPRIR Educação — Canindé V5.2.1

**Gestão de pedidos, estoque, autorização, separação, expedição e recebimento de materiais da rede municipal de ensino.**

A V5.2.1 incorpora controle físico de estoque ao fluxo já existente. O saldo é mantido pelo almoxarifado, consultado pela SME, usado para limitar as solicitações das escolas e baixado automaticamente quando a remessa sai do almoxarifado.

## Fluxo operacional

1. **Almoxarifado** cadastra o material e registra as entradas de estoque.
2. **Escola** enxerga somente materiais ativos com saldo maior que zero e cria o pedido dentro do estoque disponível.
3. **SME — Análise e autorização** consulta o saldo atual e autoriza as quantidades.
4. **Almoxarifado — Separação e expedição** registra a saída/remessa.
5. A saída **baixa automaticamente o estoque** e gera uma movimentação auditável.
6. **Escola** confirma o recebimento no próprio portal.
7. **Administrador do sistema** acompanha toda a operação.

## Perfis

| Perfil | Código | Estoque / responsabilidade |
|---|---|---|
| Escola | `school_user` | Só visualiza e solicita materiais com estoque disponível |
| SME — Análise e autorização | `sme_authorizer` | Consulta o estoque e autoriza pedidos |
| Almoxarifado | `warehouse_operator` | Cadastra materiais, registra entradas, separa e expede |
| Administrador | `system_admin` | Acesso completo, inclusive estoque e cadastros |

## Controle de estoque

Cada material possui:

- `stock_quantity`: saldo físico atual;
- `quantidade_minima`: nível usado para alerta de estoque baixo;
- `stock_updated_at`: última alteração do saldo.

A tabela `inventory_movements` registra as entradas e saídas com saldo anterior, saldo posterior, documento, usuário, pedido/remessa e data.

O estoque **não é reduzido na autorização**. A baixa ocorre na expedição física. O sistema revalida o saldo no momento da saída para impedir estoque negativo.

## Banco de dados

### Atualização da V5.1.x para V5.2.1

Execute no SQL Editor do Supabase:

```txt
supabase/migrations/011_estoque_v5_2.sql
```

ou:

```txt
supabase/MIGRACAO_V5_1_PARA_V5_2_0.sql
```

### Instalação nova

Execute:

```txt
supabase/BANCO_COMPLETO_V5_2.sql
```

**Importante:** após a migração, os materiais existentes começam com saldo `0`. O almoxarifado deve registrar o estoque físico real como entrada antes de liberar os materiais às escolas.

## Configuração

```env
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=SUA_CHAVE_PUBLICA
VITE_NOME_SISTEMA="SUPRIR Educação"
VITE_SUBTITULO_SISTEMA="Gestão de pedidos e distribuição de materiais"
VITE_MUNICIPIO_NOME="Prefeitura Municipal de Canindé"
VITE_SECRETARIA_NOME="Secretaria Municipal de Educação"
VITE_SCHOOL_LOGIN_DOMAIN=escolas.caninde.ce.gov.br
VITE_PUBLIC_URL=https://suprir.caninde.codeedu.dev
```

## Execução local

```powershell
npm install
npm run dev
```

## Publicação

```powershell
npm run build
npx wrangler pages deploy dist --project-name suprir
```

- GitHub: `https://github.com/Laeciogomes/SUPRIR`
- Produção: `https://suprir.caninde.codeedu.dev`

Consulte `docs/ATUALIZACAO_V5_2.md` antes da atualização do banco em produção.
