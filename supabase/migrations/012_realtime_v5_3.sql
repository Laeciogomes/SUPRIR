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
  foreach v_table in array v_tables loop

    if to_regclass(format('public.%I', v_table)) is null then
      raise exception 'Tabela public.% não encontrada.', v_table;
    end if;

    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = v_table
    ) then
      execute format(
        'alter publication supabase_realtime add table public.%I',
        v_table
      );
    end if;

  end loop;
end $$;

commit;