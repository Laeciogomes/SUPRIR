-- Versão 4.3 — reforço da permissão para exclusão segura de escolas.
-- Execute somente se a política de exclusão não existir ou se o Supabase bloquear a ação pela tela.

alter table public.schools enable row level security;

grant select, insert, update, delete on table public.schools to authenticated;

drop policy if exists schools_delete_sme_admin on public.schools;

create policy schools_delete_sme_admin
on public.schools for delete to authenticated
using (public.is_sme_admin(auth.uid()));
