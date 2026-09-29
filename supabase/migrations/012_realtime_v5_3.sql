-- SUPRIR Educação V5.3.0
-- Sincronização automática entre Escola, SME e Almoxarifado via Supabase Realtime.
-- Esta migração é aditiva e idempotente: apenas inclui as tabelas operacionais
-- na publicação supabase_realtime quando ainda não estiverem publicadas.

begin;

do $$
declare
  v_table text;
  v_tables text[] := array[
    'requests',
    'request_items',
    'deliveries',
    'delivery_items',
    'materials',
    'inventory_movements',
    'request_events'
  ];
begin
  if not exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) then
    raise exception 'A publicação supabase_realtime não existe neste projeto Supabase.';
  end if;

  foreach v_table in array v_tables loop
    if to_regclass(format('public.%I', v_table)) is null then
      raise exception 'Tabela public.% não encontrada. Aplique primeiro as migrações anteriores do SUPRIR.', v_table;
    end if;

    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = v_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', v_table);
    end if;
  end loop;
end $$;

commit;

-- Conferência: devem ser retornadas as 7 tabelas abaixo.
select tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
  and schemaname = 'public'
  and tablename in (
    'requests',
    'request_items',
    'deliveries',
    'delivery_items',
    'materials',
    'inventory_movements',
    'request_events'
  )
order by tablename;
