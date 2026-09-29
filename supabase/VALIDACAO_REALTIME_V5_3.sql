-- SUPRIR Educação V5.3.0 — validação da publicação Realtime
select
  expected.tablename,
  exists (
    select 1
    from pg_publication_tables p
    where p.pubname = 'supabase_realtime'
      and p.schemaname = 'public'
      and p.tablename = expected.tablename
  ) as realtime_ativo
from (values
  ('requests'),
  ('request_items'),
  ('deliveries'),
  ('delivery_items'),
  ('materials'),
  ('inventory_movements'),
  ('request_events')
) as expected(tablename)
order by expected.tablename;
