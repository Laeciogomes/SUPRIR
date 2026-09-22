-- ============================================================================
-- MIGRAÇÃO 003 — LOGIN NUMÉRICO E IMPORTAÇÃO DE ACESSOS DAS ESCOLAS
-- Execute depois das versões 2/3, antes de usar a importação em lote.
-- ============================================================================

begin;

alter table public.schools
  add column if not exists login_code text;

update public.schools
set login_code = regexp_replace(inep, '[^0-9]', '', 'g')
where (login_code is null or btrim(login_code) = '')
  and inep is not null
  and btrim(inep) <> '';

create unique index if not exists schools_login_code_unique_idx
  on public.schools (login_code)
  where login_code is not null and btrim(login_code) <> '';

comment on column public.schools.login_code is
  'Código numérico utilizado pela escola na tela de login.';

commit;
