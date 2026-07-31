-- Migração de identidade visual para bancos que já usam a versão 2.
-- Execute este arquivo no SQL Editor do Supabase uma única vez.

begin;

alter table public.system_settings
  add column if not exists compact_logo_url text not null default '/assets/brand/brasao-caninde.webp';

alter table public.system_settings
  add column if not exists planning_logo_url text not null default '/assets/brand/brasao-caninde.webp';

alter table public.system_settings alter column municipality_name set default 'Prefeitura Municipal de Canindé';
alter table public.system_settings alter column department_name set default 'Secretaria Municipal de Educação';
alter table public.system_settings alter column logo_url set default '/assets/brand/logo-secretaria-educacao-caninde.png';
alter table public.system_settings alter column compact_logo_url set default '/assets/brand/brasao-caninde.webp';
alter table public.system_settings alter column planning_logo_url set default '/assets/brand/brasao-caninde.webp';
alter table public.system_settings alter column report_title set default 'Sistema Integrado de Pedidos e Entrega de Materiais';

update public.system_settings
set
  municipality_name = case
    when municipality_name in ('Município', 'Nome do Município') then 'Prefeitura Municipal de Canindé'
    else municipality_name
  end,
  department_name = case
    when department_name = 'Secretaria Municipal de Educação' then 'Secretaria Municipal de Educação'
    else department_name
  end,
  logo_url = case
    when logo_url is null or logo_url = '' or logo_url = '/logo-municipio.svg'
      then '/assets/brand/logo-secretaria-educacao-caninde.png'
    else logo_url
  end,
  compact_logo_url = coalesce(nullif(compact_logo_url, ''), '/assets/brand/brasao-caninde.webp'),
  planning_logo_url = coalesce(nullif(planning_logo_url, ''), '/assets/brand/brasao-caninde.webp'),
  report_title = case
    when report_title = 'Sistema de Pedidos e Entrega de Materiais'
      then 'Sistema Integrado de Pedidos e Entrega de Materiais'
    else report_title
  end
where id = 1;

commit;
