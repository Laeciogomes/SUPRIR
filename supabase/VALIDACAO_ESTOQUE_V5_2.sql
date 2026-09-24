-- Execute após a migração 011_estoque_v5_2.sql.

select 'stock_quantity em materials' as teste,
       exists (
         select 1 from information_schema.columns
         where table_schema = 'public' and table_name = 'materials' and column_name = 'stock_quantity'
       ) as ok
union all
select 'inventory_movements criada',
       to_regclass('public.inventory_movements') is not null
union all
select 'register_stock_entry criada',
       to_regprocedure('public.register_stock_entry(uuid,numeric,text,text)') is not null
union all
select 'save_warehouse_material criada',
       to_regprocedure('public.save_warehouse_material(uuid,text,text,text,text,numeric,text,boolean,numeric)') is not null
union all
select 'register_dispatch V5.2 disponível',
       to_regprocedure('public.register_dispatch(uuid,date,text,text,jsonb)') is not null;

select
  id,
  nome,
  unidade,
  ativo,
  stock_quantity,
  quantidade_minima,
  stock_updated_at
from public.materials
order by nome;

select
  movement_type,
  count(*) as movimentacoes,
  sum(quantity) as quantidade_movimentada
from public.inventory_movements
group by movement_type
order by movement_type;
