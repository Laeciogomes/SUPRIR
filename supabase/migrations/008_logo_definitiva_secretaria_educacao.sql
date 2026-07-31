-- V4.6 — Logo definitiva da Secretaria Municipal de Educação.
-- Execute esta migração em bancos que já foram usados com as versões anteriores.
-- Ela força a marca nova no login, menu, relatórios e evita que caminhos antigos exibam a marca Casa da Avaliação.

begin;

alter table public.system_settings alter column municipality_name set default 'Prefeitura Municipal de Canindé';
alter table public.system_settings alter column department_name set default 'Secretaria Municipal de Educação';
alter table public.system_settings alter column report_title set default 'Sistema Integrado de Pedidos e Entrega de Materiais';
alter table public.system_settings alter column logo_url set default '/assets/brand/logo-secretaria-educacao-caninde.png';
alter table public.system_settings alter column compact_logo_url set default '/assets/brand/brasao-caninde.webp';
alter table public.system_settings alter column planning_logo_url set default '/assets/brand/brasao-caninde.webp';

insert into public.system_settings (id)
values (1)
on conflict (id) do nothing;

update public.system_settings
set
  municipality_name = 'Prefeitura Municipal de Canindé',
  department_name = 'Secretaria Municipal de Educação',
  report_title = 'Sistema Integrado de Pedidos e Entrega de Materiais',
  logo_url = '/assets/brand/logo-secretaria-educacao-caninde.png',
  compact_logo_url = '/assets/brand/brasao-caninde.webp',
  planning_logo_url = '/assets/brand/brasao-caninde.webp',
  updated_at = now()
where id = 1;

commit;
