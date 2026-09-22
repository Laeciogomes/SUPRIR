-- V4.6 — Corrige a logo principal usada no login, menus e relatórios.
-- Execute no SQL Editor do Supabase se a tela de login estiver exibindo ícone de imagem quebrada.

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
