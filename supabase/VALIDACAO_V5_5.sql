-- SUPRIR Educacao V5.5.0 — validacao de estrutura (sem alterar dados)
-- O esperado e todas as linhas com ok = true.
SELECT 'coluna_material_autorizado' AS verificacao,
       EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name='request_items'
                 AND column_name='approved_material_id') AS ok
UNION ALL
SELECT 'snapshot_nome_autorizado',
       EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name='request_items'
                 AND column_name='approved_material_name_snapshot')
UNION ALL
SELECT 'snapshot_unidade_autorizada',
       EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name='request_items'
                 AND column_name='approved_unit_snapshot')
UNION ALL
SELECT 'funcao_acerto_estoque',
       to_regprocedure('public.adjust_stock_quantity(uuid,numeric,text,text)') IS NOT NULL
UNION ALL
SELECT 'funcao_autorizacao',
       to_regprocedure('public.authorize_request(uuid,jsonb,text)') IS NOT NULL
UNION ALL
SELECT 'funcao_expedicao',
       to_regprocedure('public.register_dispatch(uuid,date,text,text,jsonb)') IS NOT NULL
UNION ALL
SELECT 'movimentacao_ajuste',
       EXISTS (
         SELECT 1 FROM pg_constraint
         WHERE conrelid='public.inventory_movements'::regclass
           AND conname='inventory_movements_type_check'
           AND pg_get_constraintdef(oid) LIKE '%adjustment_in%'
           AND pg_get_constraintdef(oid) LIKE '%adjustment_out%'
       )
UNION ALL
SELECT 'funcao_autorizacao_usa_material_autorizado',
       EXISTS (
         SELECT 1 FROM pg_proc
         WHERE oid = to_regprocedure('public.authorize_request(uuid,jsonb,text)')
           AND pg_get_functiondef(oid) LIKE '%approved_material_id%'
       )
UNION ALL
SELECT 'expedicao_baixa_material_autorizado',
       EXISTS (
         SELECT 1 FROM pg_proc
         WHERE oid = to_regprocedure('public.register_dispatch(uuid,date,text,text,jsonb)')
           AND pg_get_functiondef(oid) LIKE '%v_req_item.approved_material_id%'
       )
ORDER BY verificacao;
