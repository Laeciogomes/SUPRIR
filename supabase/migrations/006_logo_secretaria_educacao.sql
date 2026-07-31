-- Atualiza a identidade visual para a marca da Secretaria de Educação de Canindé.
-- Use em bancos que já tinham a identidade visual anterior.

begin;

alter table public.system_settings alter column department_name set default 'Secretaria Municipal de Educação';
alter table public.system_settings alter column logo_url set default '/assets/brand/logo-secretaria-educacao-caninde.png';
alter table public.system_settings alter column planning_logo_url set default '/assets/brand/brasao-caninde.webp';

insert into public.system_settings (id)
values (1)
on conflict (id) do nothing;

update public.system_settings
set
  department_name = 'Secretaria Municipal de Educação',
  logo_url = '/assets/brand/logo-secretaria-educacao-caninde.png',
  planning_logo_url = '/assets/brand/brasao-caninde.webp',
  compact_logo_url = coalesce(nullif(compact_logo_url, ''), '/assets/brand/brasao-caninde.webp'),
  updated_at = now()
where id = 1;

commit;
