-- ================================================================
-- INSTALAÇÃO COMPLETA DO BANCO — SISTEMA DE MATERIAIS CANINDÉ V4.7
-- Execute este arquivo no SQL Editor do Supabase para banco novo.
-- Para banco já existente, execute apenas as migrações pendentes, principalmente a 008; a V4.7 não exige alteração adicional no banco.
-- ================================================================

-- ============================================================================
-- SISTEMA INTEGRADO DE PEDIDOS E ENTREGA DE MATERIAIS — CANINDÉ — VERSÃO 4
-- Supabase / PostgreSQL
--
-- Instalação completa do banco: dois portais de acesso, pedidos, autorização,
-- expedição, recebimento, confirmação, relatórios e trilha de auditoria.
-- Também inclui a identidade institucional da Prefeitura de Canindé e do
-- Secretaria Municipal de Educação.
--
-- Antes de executar em um banco com dados reais, faça um backup.
-- Supabase: SQL Editor > New query > cole todo o arquivo > Run.
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- Funções básicas
-- ----------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- Perfis e dois portais de acesso
-- account_type: school | sme
-- permission_level: school_user | sme_operator | sme_manager | sme_admin
-- ----------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role text not null default 'operador',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles add column if not exists account_type text;
alter table public.profiles add column if not exists permission_level text;
alter table public.profiles add column if not exists school_id uuid;
alter table public.profiles add column if not exists active boolean not null default true;
alter table public.profiles add column if not exists position text;
alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists must_change_password boolean not null default false;
alter table public.profiles add column if not exists created_by uuid references auth.users(id) on delete set null;

-- Migra usuários da primeira versão para o portal SME.
update public.profiles
set
  account_type = coalesce(account_type, 'sme'),
  permission_level = coalesce(
    permission_level,
    case when role = 'admin' then 'sme_admin' else 'sme_operator' end
  )
where account_type is null or permission_level is null;

alter table public.profiles alter column account_type set default 'school';
alter table public.profiles alter column permission_level set default 'school_user';
alter table public.profiles alter column account_type set not null;
alter table public.profiles alter column permission_level set not null;

-- Os constraints são adicionados somente quando ainda não existem.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_account_type_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_account_type_check
      check (account_type in ('school', 'sme'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_permission_level_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_permission_level_check
      check (permission_level in ('school_user', 'sme_operator', 'sme_manager', 'sme_admin'));
  end if;
end $$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Escolas e materiais (compatível com a primeira versão)
-- ----------------------------------------------------------------------------

create table if not exists public.schools (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  inep text,
  endereco text,
  diretor text,
  telefone text,
  ativa boolean not null default true,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.schools add column if not exists codigo text;
alter table public.schools add column if not exists login_code text;
alter table public.schools add column if not exists email text;
alter table public.schools add column if not exists bairro text;
alter table public.schools add column if not exists observacoes text;

create index if not exists schools_nome_idx on public.schools using btree (nome);
create unique index if not exists schools_inep_unique_idx
  on public.schools (inep) where inep is not null and btrim(inep) <> '';

-- O login numérico das escolas é mantido separado do e-mail interno usado pelo Supabase Auth.
update public.schools
set login_code = regexp_replace(inep, '[^0-9]', '', 'g')
where (login_code is null or btrim(login_code) = '')
  and inep is not null
  and btrim(inep) <> '';

create unique index if not exists schools_login_code_unique_idx
  on public.schools (login_code) where login_code is not null and btrim(login_code) <> '';

comment on column public.schools.login_code is 'Código numérico utilizado pela escola na tela de login.';

drop trigger if exists schools_set_updated_at on public.schools;
create trigger schools_set_updated_at
before update on public.schools
for each row execute function public.set_updated_at();

-- Agora que a tabela schools existe, adiciona a FK do perfil.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_school_id_fkey'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_school_id_fkey
      foreign key (school_id) references public.schools(id) on delete set null;
  end if;
end $$;

create index if not exists profiles_school_id_idx on public.profiles (school_id);
create index if not exists profiles_account_type_idx on public.profiles (account_type, permission_level);

create table if not exists public.materials (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  categoria text,
  unidade text not null default 'un',
  descricao text,
  ativo boolean not null default true,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.materials add column if not exists codigo text;
alter table public.materials add column if not exists quantidade_minima numeric(14,2);

create index if not exists materials_nome_idx on public.materials using btree (nome);
create unique index if not exists materials_codigo_unique_idx
  on public.materials (codigo) where codigo is not null and btrim(codigo) <> '';

drop trigger if exists materials_set_updated_at on public.materials;
create trigger materials_set_updated_at
before update on public.materials
for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Configurações institucionais exibidas no sistema e nos relatórios
-- ----------------------------------------------------------------------------

create table if not exists public.system_settings (
  id smallint primary key default 1 check (id = 1),
  municipality_name text not null default 'Prefeitura Municipal de Canindé',
  department_name text not null default 'Secretaria Municipal de Educação',
  logo_url text not null default '/assets/brand/logo-secretaria-educacao-caninde.png',
  compact_logo_url text not null default '/assets/brand/brasao-caninde.webp',
  planning_logo_url text not null default '/assets/brand/brasao-caninde.webp',
  report_title text not null default 'Sistema Integrado de Pedidos e Entrega de Materiais',
  address text,
  phone text,
  email text,
  footer_text text,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Compatibilidade com bancos que já receberam a versão anterior do sistema.
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

insert into public.system_settings (id)
values (1)
on conflict (id) do nothing;

-- Atualiza apenas os textos e a marca provisórios da versão anterior.
update public.system_settings
set municipality_name = 'Prefeitura Municipal de Canindé'
where id = 1 and municipality_name in ('Município', 'Nome do Município');

update public.system_settings
set department_name = 'Secretaria Municipal de Educação'
where id = 1 and department_name = 'Secretaria Municipal de Educação';

update public.system_settings
set
  logo_url = '/assets/brand/logo-secretaria-educacao-caninde.png',
  compact_logo_url = '/assets/brand/brasao-caninde.webp',
  planning_logo_url = '/assets/brand/brasao-caninde.webp'
where id = 1;

update public.system_settings
set report_title = 'Sistema Integrado de Pedidos e Entrega de Materiais'
where id = 1 and report_title = 'Sistema de Pedidos e Entrega de Materiais';

drop trigger if exists system_settings_set_updated_at on public.system_settings;
create trigger system_settings_set_updated_at
before update on public.system_settings
for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Pedidos e itens
-- ----------------------------------------------------------------------------

create sequence if not exists public.request_protocol_seq start 1;

create table if not exists public.requests (
  id uuid primary key default gen_random_uuid(),
  protocol_number text unique,
  school_id uuid not null references public.schools(id) on delete restrict,
  status text not null default 'draft',
  priority text not null default 'normal',
  purpose text not null,
  requested_delivery_date date,
  notes text,
  school_contact_name text,
  school_contact_phone text,

  created_by uuid not null references auth.users(id) on delete restrict default auth.uid(),
  created_by_name text,
  created_by_email text,
  submitted_at timestamptz,

  received_by uuid references auth.users(id) on delete set null,
  received_by_name text,
  received_by_email text,
  received_at timestamptz,

  authorized_by uuid references auth.users(id) on delete set null,
  authorized_by_name text,
  authorized_by_email text,
  authorized_at timestamptz,
  authorization_notes text,

  rejected_by uuid references auth.users(id) on delete set null,
  rejected_by_name text,
  rejected_at timestamptz,
  rejection_reason text,

  cancelled_by uuid references auth.users(id) on delete set null,
  cancelled_by_name text,
  cancelled_at timestamptz,
  cancellation_reason text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'requests_status_check'
      and conrelid = 'public.requests'::regclass
  ) then
    alter table public.requests add constraint requests_status_check check (
      status in (
        'draft', 'submitted', 'under_review', 'approved', 'rejected',
        'preparing', 'dispatched', 'partially_delivered', 'delivered', 'cancelled'
      )
    );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'requests_priority_check'
      and conrelid = 'public.requests'::regclass
  ) then
    alter table public.requests add constraint requests_priority_check
      check (priority in ('low', 'normal', 'high', 'urgent'));
  end if;
end $$;

create index if not exists requests_school_created_idx
  on public.requests (school_id, created_at desc);
create index if not exists requests_status_created_idx
  on public.requests (status, created_at desc);
create index if not exists requests_protocol_idx on public.requests (protocol_number);

drop trigger if exists requests_set_updated_at on public.requests;
create trigger requests_set_updated_at
before update on public.requests
for each row execute function public.set_updated_at();

create or replace function public.assign_request_protocol()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.protocol_number is null or btrim(new.protocol_number) = '' then
    new.protocol_number := 'PED-' || to_char(current_date, 'YYYY') || '-' ||
      lpad(nextval('public.request_protocol_seq')::text, 6, '0');
  end if;
  return new;
end;
$$;

drop trigger if exists requests_assign_protocol on public.requests;
create trigger requests_assign_protocol
before insert on public.requests
for each row execute function public.assign_request_protocol();

create table if not exists public.request_items (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests(id) on delete cascade,
  material_id uuid not null references public.materials(id) on delete restrict,
  requested_quantity numeric(14,2) not null check (requested_quantity > 0),
  approved_quantity numeric(14,2) not null default 0 check (approved_quantity >= 0),
  material_name_snapshot text not null,
  unit_snapshot text not null,
  school_notes text,
  sme_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (request_id, material_id)
);

create index if not exists request_items_request_idx on public.request_items (request_id);
create index if not exists request_items_material_idx on public.request_items (material_id);

drop trigger if exists request_items_set_updated_at on public.request_items;
create trigger request_items_set_updated_at
before update on public.request_items
for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Entregas/remessas. A estrutura anterior é mantida e ampliada.
-- ----------------------------------------------------------------------------

create sequence if not exists public.delivery_protocol_seq start 1;

create table if not exists public.deliveries (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  delivery_date date not null default current_date,
  document_number text,
  delivered_by_name text not null,
  delivered_by_department text,
  received_by_name text,
  observations text,
  registered_by uuid not null references auth.users(id) on delete restrict default auth.uid(),
  registered_by_email text,
  registered_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.deliveries add column if not exists request_id uuid references public.requests(id) on delete restrict;
alter table public.deliveries add column if not exists delivery_number text;
alter table public.deliveries add column if not exists status text not null default 'delivered';
alter table public.deliveries add column if not exists dispatch_date date;
alter table public.deliveries add column if not exists receipt_date date;
alter table public.deliveries add column if not exists received_by_position text;
alter table public.deliveries add column if not exists received_by_document text;
alter table public.deliveries add column if not exists receipt_notes text;
alter table public.deliveries add column if not exists receipt_registered_by uuid references auth.users(id) on delete set null;
alter table public.deliveries add column if not exists receipt_registered_by_name text;
alter table public.deliveries add column if not exists receipt_registered_by_email text;
alter table public.deliveries add column if not exists school_confirmed_by uuid references auth.users(id) on delete set null;
alter table public.deliveries add column if not exists school_confirmed_by_name text;
alter table public.deliveries add column if not exists school_confirmed_at timestamptz;
alter table public.deliveries add column if not exists school_confirmation_notes text;

update public.deliveries
set
  dispatch_date = coalesce(dispatch_date, delivery_date),
  receipt_date = coalesce(receipt_date, delivery_date),
  status = coalesce(status, 'delivered')
where dispatch_date is null or receipt_date is null or status is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'deliveries_status_check'
      and conrelid = 'public.deliveries'::regclass
  ) then
    alter table public.deliveries add constraint deliveries_status_check
      check (status in ('dispatched', 'delivered', 'cancelled'));
  end if;
end $$;

create unique index if not exists deliveries_number_unique_idx
  on public.deliveries (delivery_number) where delivery_number is not null;
create index if not exists deliveries_request_idx on public.deliveries (request_id, created_at desc);
create index if not exists deliveries_school_date_idx on public.deliveries (school_id, delivery_date desc);
create index if not exists deliveries_status_idx on public.deliveries (status, created_at desc);

drop trigger if exists deliveries_set_updated_at on public.deliveries;
create trigger deliveries_set_updated_at
before update on public.deliveries
for each row execute function public.set_updated_at();

create or replace function public.assign_delivery_number()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.delivery_number is null or btrim(new.delivery_number) = '' then
    new.delivery_number := 'REM-' || to_char(current_date, 'YYYY') || '-' ||
      lpad(nextval('public.delivery_protocol_seq')::text, 6, '0');
  end if;
  return new;
end;
$$;

drop trigger if exists deliveries_assign_number on public.deliveries;
create trigger deliveries_assign_number
before insert on public.deliveries
for each row execute function public.assign_delivery_number();

create or replace function public.set_delivery_registration_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_name text;
begin
  if TG_OP = 'INSERT' then
    select p.email, p.full_name into v_email, v_name
    from public.profiles p where p.id = auth.uid();

    new.registered_by := coalesce(auth.uid(), new.registered_by);
    new.registered_by_email := coalesce(v_email, auth.jwt() ->> 'email', new.registered_by_email);
    new.registered_by_name := coalesce(v_name, new.registered_by_email, new.registered_by_name);
    return new;
  end if;

  new.registered_by := old.registered_by;
  new.registered_by_email := old.registered_by_email;
  new.registered_by_name := old.registered_by_name;
  return new;
end;
$$;

drop trigger if exists deliveries_registration_audit on public.deliveries;
create trigger deliveries_registration_audit
before insert or update on public.deliveries
for each row execute function public.set_delivery_registration_audit();

create table if not exists public.delivery_items (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.deliveries(id) on delete cascade,
  material_id uuid not null references public.materials(id) on delete restrict,
  quantity numeric(14,2) not null check (quantity > 0),
  unit_snapshot text,
  material_name_snapshot text,
  notes text,
  created_at timestamptz not null default now()
);

alter table public.delivery_items add column if not exists request_item_id uuid references public.request_items(id) on delete restrict;

create index if not exists delivery_items_delivery_idx on public.delivery_items (delivery_id);
create index if not exists delivery_items_material_idx on public.delivery_items (material_id);
create index if not exists delivery_items_request_item_idx on public.delivery_items (request_item_id);

-- ----------------------------------------------------------------------------
-- Histórico/auditoria de cada pedido
-- ----------------------------------------------------------------------------

create table if not exists public.request_events (
  id bigint generated by default as identity primary key,
  request_id uuid not null references public.requests(id) on delete cascade,
  delivery_id uuid references public.deliveries(id) on delete cascade,
  event_type text not null,
  from_status text,
  to_status text,
  description text not null,
  actor_id uuid references auth.users(id) on delete set null,
  actor_name text,
  actor_email text,
  actor_account_type text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists request_events_request_idx
  on public.request_events (request_id, created_at desc);

-- ----------------------------------------------------------------------------
-- Migração das entregas registradas na primeira versão
--
-- Cada entrega antiga passa a aparecer no novo histórico como um pedido legado.
-- Como a primeira versão não possuía etapas de recebimento e autorização, esses
-- responsáveis permanecem em branco para não criar uma auditoria fictícia.
-- O bloco é idempotente: processa apenas entregas ainda sem request_id.
-- ----------------------------------------------------------------------------

do $$
declare
  v_delivery public.deliveries%rowtype;
  v_request_id uuid;
  v_request_item_id uuid;
  v_item record;
begin
  update public.deliveries
  set delivery_number = 'LEG-' || upper(replace(id::text, '-', ''))
  where request_id is null
    and (delivery_number is null or btrim(delivery_number) = '');

  for v_delivery in
    select *
    from public.deliveries
    where request_id is null
    order by created_at, id
    for update
  loop
    insert into public.requests (
      school_id, status, priority, purpose, requested_delivery_date, notes,
      created_by, created_by_name, created_by_email, submitted_at, created_at, updated_at
    ) values (
      v_delivery.school_id,
      'delivered',
      'normal',
      'Entrega migrada da versão anterior',
      v_delivery.delivery_date,
      nullif(btrim(coalesce(v_delivery.observations, '')), ''),
      v_delivery.registered_by,
      coalesce(v_delivery.registered_by_name, v_delivery.registered_by_email, 'Usuário da versão anterior'),
      v_delivery.registered_by_email,
      v_delivery.created_at,
      v_delivery.created_at,
      coalesce(v_delivery.updated_at, v_delivery.created_at)
    ) returning id into v_request_id;

    for v_item in
      select
        di.material_id,
        sum(di.quantity)::numeric(14,2) as quantity,
        coalesce(max(di.material_name_snapshot), max(m.nome), 'Material') as material_name,
        coalesce(max(di.unit_snapshot), max(m.unidade), 'un') as unit_name,
        nullif(string_agg(di.notes, '; ' order by di.created_at) filter (where di.notes is not null and btrim(di.notes) <> ''), '') as notes
      from public.delivery_items di
      left join public.materials m on m.id = di.material_id
      where di.delivery_id = v_delivery.id
      group by di.material_id
    loop
      insert into public.request_items (
        request_id, material_id, requested_quantity, approved_quantity,
        material_name_snapshot, unit_snapshot, school_notes, sme_notes, created_at, updated_at
      ) values (
        v_request_id, v_item.material_id, v_item.quantity, v_item.quantity,
        v_item.material_name, v_item.unit_name, null, v_item.notes,
        v_delivery.created_at, coalesce(v_delivery.updated_at, v_delivery.created_at)
      ) returning id into v_request_item_id;

      update public.delivery_items
      set
        request_item_id = v_request_item_id,
        material_name_snapshot = coalesce(material_name_snapshot, v_item.material_name),
        unit_snapshot = coalesce(unit_snapshot, v_item.unit_name)
      where delivery_id = v_delivery.id
        and material_id = v_item.material_id;
    end loop;

    update public.deliveries
    set
      request_id = v_request_id,
      status = 'delivered',
      dispatch_date = coalesce(dispatch_date, delivery_date),
      receipt_date = coalesce(receipt_date, delivery_date)
    where id = v_delivery.id;

    insert into public.request_events (
      request_id, delivery_id, event_type, from_status, to_status, description,
      actor_id, actor_name, actor_email, actor_account_type, metadata, created_at
    ) values (
      v_request_id,
      v_delivery.id,
      'legacy_delivery_migrated',
      null,
      'delivered',
      'Entrega da versão anterior migrada para o novo fluxo. O sistema antigo não registrava as etapas de recebimento e autorização.',
      v_delivery.registered_by,
      coalesce(v_delivery.registered_by_name, v_delivery.registered_by_email, 'Usuário da versão anterior'),
      v_delivery.registered_by_email,
      'sme',
      jsonb_build_object('legacy', true),
      v_delivery.created_at
    );
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- Criação automática do perfil de novos usuários
-- ----------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account_type text;
  v_permission_level text;
  v_school_id uuid;
  v_active boolean;
begin
  v_account_type := coalesce(new.raw_user_meta_data ->> 'account_type', 'school');
  v_permission_level := coalesce(
    new.raw_user_meta_data ->> 'permission_level',
    case when v_account_type = 'sme' then 'sme_operator' else 'school_user' end
  );

  v_active := lower(coalesce(new.raw_user_meta_data ->> 'provisioned_by_sme', 'false')) = 'true';

  begin
    v_school_id := nullif(new.raw_user_meta_data ->> 'school_id', '')::uuid;
  exception when others then
    v_school_id := null;
  end;

  insert into public.profiles (
    id, email, full_name, account_type, permission_level, school_id,
    active, must_change_password
  ) values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', new.email),
    v_account_type,
    v_permission_level,
    v_school_id,
    v_active,
    lower(coalesce(new.raw_user_meta_data ->> 'must_change_password', 'false')) = 'true'
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = coalesce(public.profiles.full_name, excluded.full_name),
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- Funções de autorização usadas pela RLS e pelas operações de negócio
-- ----------------------------------------------------------------------------

create or replace function public.is_active_user(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = p_user_id and p.active = true
  );
$$;

create or replace function public.is_sme(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = p_user_id and p.active = true and p.account_type = 'sme'
  );
$$;

create or replace function public.is_sme_manager(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = p_user_id
      and p.active = true
      and p.account_type = 'sme'
      and p.permission_level in ('sme_manager', 'sme_admin')
  );
$$;

create or replace function public.is_sme_admin(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = p_user_id
      and p.active = true
      and p.account_type = 'sme'
      and p.permission_level = 'sme_admin'
  );
$$;

-- Compatibilidade com a primeira versão.
create or replace function public.is_admin(user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_sme_admin(user_id);
$$;

create or replace function public.current_school_id(p_user_id uuid default auth.uid())
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.school_id
  from public.profiles p
  where p.id = p_user_id and p.active = true and p.account_type = 'school';
$$;

-- Registra um evento com o usuário real da sessão.
create or replace function public.log_request_event(
  p_request_id uuid,
  p_event_type text,
  p_from_status text,
  p_to_status text,
  p_description text,
  p_delivery_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_email text;
  v_account_type text;
begin
  select full_name, email, account_type
  into v_name, v_email, v_account_type
  from public.profiles
  where id = auth.uid();

  insert into public.request_events (
    request_id, delivery_id, event_type, from_status, to_status,
    description, actor_id, actor_name, actor_email, actor_account_type, metadata
  ) values (
    p_request_id, p_delivery_id, p_event_type, p_from_status, p_to_status,
    p_description, auth.uid(), v_name, v_email, v_account_type, coalesce(p_metadata, '{}'::jsonb)
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- RPC: escola salva ou envia um pedido (operação transacional)
-- ----------------------------------------------------------------------------

create or replace function public.save_school_request(
  p_request_id uuid,
  p_priority text,
  p_purpose text,
  p_requested_delivery_date date,
  p_notes text,
  p_school_contact_name text,
  p_school_contact_phone text,
  p_items jsonb,
  p_submit boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_request public.requests%rowtype;
  v_item record;
  v_material public.materials%rowtype;
  v_request_id uuid;
  v_new_status text;
begin
  select * into v_profile from public.profiles where id = auth.uid();

  if v_profile.id is null or not v_profile.active or v_profile.account_type <> 'school' or v_profile.school_id is null then
    raise exception 'Seu usuário não está vinculado a uma escola ativa.';
  end if;

  if p_priority not in ('low', 'normal', 'high', 'urgent') then
    raise exception 'Prioridade inválida.';
  end if;

  if nullif(btrim(coalesce(p_purpose, '')), '') is null then
    raise exception 'Informe a finalidade do pedido.';
  end if;

  if p_requested_delivery_date is not null and p_requested_delivery_date < current_date then
    raise exception 'A data desejada não pode ser anterior à data atual.';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Adicione pelo menos um material ao pedido.';
  end if;

  if p_request_id is null then
    insert into public.requests (
      school_id, status, priority, purpose, requested_delivery_date, notes,
      school_contact_name, school_contact_phone,
      created_by, created_by_name, created_by_email
    ) values (
      v_profile.school_id, 'draft', p_priority, btrim(p_purpose), p_requested_delivery_date, nullif(btrim(p_notes), ''),
      nullif(btrim(p_school_contact_name), ''), nullif(btrim(p_school_contact_phone), ''),
      auth.uid(), v_profile.full_name, v_profile.email
    ) returning * into v_request;
  else
    select * into v_request
    from public.requests
    where id = p_request_id
    for update;

    if v_request.id is null or v_request.school_id <> v_profile.school_id then
      raise exception 'Pedido não encontrado para esta escola.';
    end if;

    if v_request.status <> 'draft' then
      raise exception 'Somente pedidos em rascunho podem ser alterados.';
    end if;

    update public.requests set
      priority = p_priority,
      purpose = btrim(p_purpose),
      requested_delivery_date = p_requested_delivery_date,
      notes = nullif(btrim(p_notes), ''),
      school_contact_name = nullif(btrim(p_school_contact_name), ''),
      school_contact_phone = nullif(btrim(p_school_contact_phone), '')
    where id = v_request.id
    returning * into v_request;

    delete from public.request_items where request_id = v_request.id;
  end if;

  for v_item in
    select * from jsonb_to_recordset(p_items)
      as x(material_id uuid, quantity numeric, notes text)
  loop
    if v_item.material_id is null or v_item.quantity is null or v_item.quantity <= 0 then
      raise exception 'Existe um item com material ou quantidade inválida.';
    end if;

    select * into v_material
    from public.materials
    where id = v_item.material_id and ativo = true;

    if v_material.id is null then
      raise exception 'Um dos materiais não existe ou está inativo.';
    end if;

    insert into public.request_items (
      request_id, material_id, requested_quantity, approved_quantity,
      material_name_snapshot, unit_snapshot, school_notes
    ) values (
      v_request.id, v_material.id, v_item.quantity, 0,
      v_material.nome, v_material.unidade, nullif(btrim(v_item.notes), '')
    );
  end loop;

  v_request_id := v_request.id;

  if coalesce(p_submit, false) then
    update public.requests
    set status = 'submitted', submitted_at = now()
    where id = v_request_id;

    perform public.log_request_event(
      v_request_id,
      'request_submitted',
      'draft',
      'submitted',
      'Pedido enviado pela escola para análise da SME.'
    );
  elsif p_request_id is null then
    perform public.log_request_event(
      v_request_id,
      'draft_created',
      null,
      'draft',
      'Rascunho do pedido criado pela escola.'
    );
  else
    perform public.log_request_event(
      v_request_id,
      'draft_updated',
      'draft',
      'draft',
      'Rascunho do pedido atualizado pela escola.'
    );
  end if;

  return v_request_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- RPC: SME recebe o pedido para análise
-- ----------------------------------------------------------------------------

create or replace function public.receive_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.requests%rowtype;
  v_profile public.profiles%rowtype;
begin
  if not public.is_sme(auth.uid()) then
    raise exception 'Apenas usuários da SME podem receber pedidos.';
  end if;

  select * into v_profile from public.profiles where id = auth.uid();
  select * into v_request from public.requests where id = p_request_id for update;

  if v_request.id is null then raise exception 'Pedido não encontrado.'; end if;
  if v_request.status <> 'submitted' then raise exception 'Este pedido não está aguardando recebimento.'; end if;

  update public.requests set
    status = 'under_review',
    received_by = auth.uid(),
    received_by_name = v_profile.full_name,
    received_by_email = v_profile.email,
    received_at = now()
  where id = p_request_id;

  perform public.log_request_event(
    p_request_id, 'request_received', 'submitted', 'under_review',
    'Pedido recebido e colocado em análise pela SME.'
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- RPC: gestor da SME autoriza o pedido e define quantidades
-- ----------------------------------------------------------------------------

create or replace function public.authorize_request(
  p_request_id uuid,
  p_items jsonb,
  p_authorization_notes text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.requests%rowtype;
  v_profile public.profiles%rowtype;
  v_item record;
  v_request_item public.request_items%rowtype;
  v_positive_count integer := 0;
  v_old_status text;
begin
  if not public.is_sme_manager(auth.uid()) then
    raise exception 'Somente gestores ou administradores da SME podem autorizar pedidos.';
  end if;

  select * into v_profile from public.profiles where id = auth.uid();
  select * into v_request from public.requests where id = p_request_id for update;

  if v_request.id is null then raise exception 'Pedido não encontrado.'; end if;
  if v_request.status not in ('submitted', 'under_review') then
    raise exception 'O pedido não está disponível para autorização.';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Informe as quantidades autorizadas.';
  end if;

  v_old_status := v_request.status;

  -- Zera antes de aplicar os valores recebidos.
  update public.request_items
  set approved_quantity = 0, sme_notes = null
  where request_id = p_request_id;

  for v_item in
    select * from jsonb_to_recordset(p_items)
      as x(request_item_id uuid, approved_quantity numeric, notes text)
  loop
    select * into v_request_item
    from public.request_items
    where id = v_item.request_item_id and request_id = p_request_id
    for update;

    if v_request_item.id is null then
      raise exception 'Um dos itens informados não pertence ao pedido.';
    end if;

    if v_item.approved_quantity is null or v_item.approved_quantity < 0
       or v_item.approved_quantity > v_request_item.requested_quantity then
      raise exception 'Quantidade autorizada inválida para o material %.', v_request_item.material_name_snapshot;
    end if;

    update public.request_items set
      approved_quantity = v_item.approved_quantity,
      sme_notes = nullif(btrim(v_item.notes), '')
    where id = v_request_item.id;

    if v_item.approved_quantity > 0 then
      v_positive_count := v_positive_count + 1;
    end if;
  end loop;

  select count(*)
  into v_positive_count
  from public.request_items
  where request_id = p_request_id and approved_quantity > 0;

  if v_positive_count = 0 then
    raise exception 'Autorize ao menos um item ou rejeite o pedido.';
  end if;

  update public.requests set
    status = 'approved',
    received_by = coalesce(received_by, auth.uid()),
    received_by_name = coalesce(received_by_name, v_profile.full_name),
    received_by_email = coalesce(received_by_email, v_profile.email),
    received_at = coalesce(received_at, now()),
    authorized_by = auth.uid(),
    authorized_by_name = v_profile.full_name,
    authorized_by_email = v_profile.email,
    authorized_at = now(),
    authorization_notes = nullif(btrim(p_authorization_notes), ''),
    rejected_by = null,
    rejected_by_name = null,
    rejected_at = null,
    rejection_reason = null
  where id = p_request_id;

  perform public.log_request_event(
    p_request_id, 'request_authorized', v_old_status, 'approved',
    'Pedido autorizado pela SME. As quantidades aprovadas foram registradas.'
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- RPC: gestor da SME rejeita o pedido
-- ----------------------------------------------------------------------------

create or replace function public.reject_request(
  p_request_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.requests%rowtype;
  v_profile public.profiles%rowtype;
begin
  if not public.is_sme_manager(auth.uid()) then
    raise exception 'Somente gestores ou administradores da SME podem rejeitar pedidos.';
  end if;

  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'Informe o motivo da rejeição.';
  end if;

  select * into v_profile from public.profiles where id = auth.uid();
  select * into v_request from public.requests where id = p_request_id for update;

  if v_request.id is null then raise exception 'Pedido não encontrado.'; end if;
  if v_request.status not in ('submitted', 'under_review') then
    raise exception 'O pedido não está disponível para rejeição.';
  end if;

  update public.requests set
    status = 'rejected',
    rejected_by = auth.uid(),
    rejected_by_name = v_profile.full_name,
    rejected_at = now(),
    rejection_reason = btrim(p_reason)
  where id = p_request_id;

  perform public.log_request_event(
    p_request_id, 'request_rejected', v_request.status, 'rejected',
    'Pedido rejeitado pela SME: ' || btrim(p_reason)
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- RPC: SME inicia a separação
-- ----------------------------------------------------------------------------

create or replace function public.start_request_preparation(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.requests%rowtype;
begin
  if not public.is_sme(auth.uid()) then
    raise exception 'Apenas usuários da SME podem iniciar a separação.';
  end if;

  select * into v_request from public.requests where id = p_request_id for update;
  if v_request.id is null then raise exception 'Pedido não encontrado.'; end if;
  if v_request.status not in ('approved', 'partially_delivered') then
    raise exception 'O pedido não está disponível para separação.';
  end if;

  update public.requests set status = 'preparing' where id = p_request_id;

  perform public.log_request_event(
    p_request_id, 'preparation_started', v_request.status, 'preparing',
    'A SME iniciou a separação dos materiais autorizados.'
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- RPC: SME registra uma remessa/saída de materiais
-- ----------------------------------------------------------------------------

create or replace function public.register_dispatch(
  p_request_id uuid,
  p_dispatch_date date,
  p_document_number text,
  p_delivered_by_name text,
  p_delivered_by_department text,
  p_observations text,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.requests%rowtype;
  v_profile public.profiles%rowtype;
  v_delivery_id uuid;
  v_item record;
  v_request_item public.request_items%rowtype;
  v_already_dispatched numeric;
  v_item_count integer := 0;
begin
  if not public.is_sme(auth.uid()) then
    raise exception 'Apenas usuários da SME podem registrar remessas.';
  end if;

  if p_dispatch_date is null then raise exception 'Informe a data da saída.'; end if;
  if p_dispatch_date > current_date then raise exception 'A data da saída não pode estar no futuro.'; end if;
  if nullif(btrim(coalesce(p_delivered_by_name, '')), '') is null then
    raise exception 'Informe quem fará a entrega.';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Adicione ao menos um item à remessa.';
  end if;

  select * into v_profile from public.profiles where id = auth.uid();
  select * into v_request from public.requests where id = p_request_id for update;

  if v_request.id is null then raise exception 'Pedido não encontrado.'; end if;
  if v_request.status not in ('approved', 'preparing', 'partially_delivered') then
    raise exception 'O pedido não está disponível para expedição.';
  end if;

  insert into public.deliveries (
    request_id, school_id, status, dispatch_date, delivery_date,
    document_number, delivered_by_name, delivered_by_department,
    observations, registered_by, registered_by_email, registered_by_name
  ) values (
    p_request_id, v_request.school_id, 'dispatched', p_dispatch_date, p_dispatch_date,
    nullif(btrim(p_document_number), ''), btrim(p_delivered_by_name),
    nullif(btrim(p_delivered_by_department), ''), nullif(btrim(p_observations), ''),
    auth.uid(), v_profile.email, v_profile.full_name
  ) returning id into v_delivery_id;

  for v_item in
    select * from jsonb_to_recordset(p_items)
      as x(request_item_id uuid, quantity numeric, notes text)
  loop
    select * into v_request_item
    from public.request_items
    where id = v_item.request_item_id and request_id = p_request_id
    for update;

    if v_request_item.id is null then
      raise exception 'Um dos itens não pertence ao pedido.';
    end if;
    if v_item.quantity is null or v_item.quantity <= 0 then
      raise exception 'Quantidade de remessa inválida.';
    end if;

    select coalesce(sum(di.quantity), 0)
    into v_already_dispatched
    from public.delivery_items di
    join public.deliveries d on d.id = di.delivery_id
    where di.request_item_id = v_request_item.id
      and d.status in ('dispatched', 'delivered');

    if v_item.quantity > (v_request_item.approved_quantity - v_already_dispatched) then
      raise exception 'A quantidade do material % ultrapassa o saldo autorizado.', v_request_item.material_name_snapshot;
    end if;

    insert into public.delivery_items (
      delivery_id, request_item_id, material_id, quantity,
      unit_snapshot, material_name_snapshot, notes
    ) values (
      v_delivery_id, v_request_item.id, v_request_item.material_id, v_item.quantity,
      v_request_item.unit_snapshot, v_request_item.material_name_snapshot,
      nullif(btrim(v_item.notes), '')
    );

    v_item_count := v_item_count + 1;
  end loop;

  if v_item_count = 0 then raise exception 'Nenhum item válido foi informado.'; end if;

  update public.requests set status = 'dispatched' where id = p_request_id;

  perform public.log_request_event(
    p_request_id, 'delivery_dispatched', v_request.status, 'dispatched',
    'Remessa registrada e materiais enviados para a escola.',
    v_delivery_id,
    jsonb_build_object('document_number', p_document_number, 'dispatch_date', p_dispatch_date)
  );

  return v_delivery_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- RPC: SME registra o recebimento da remessa na escola
-- Salva automaticamente quem fez o registro do recebimento.
-- ----------------------------------------------------------------------------

create or replace function public.register_delivery_receipt(
  p_delivery_id uuid,
  p_receipt_date date,
  p_received_by_name text,
  p_received_by_position text,
  p_received_by_document text,
  p_receipt_notes text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_delivery public.deliveries%rowtype;
  v_request public.requests%rowtype;
  v_profile public.profiles%rowtype;
  v_total_approved numeric;
  v_total_delivered numeric;
  v_open_dispatches integer;
  v_new_status text;
begin
  if not public.is_sme(auth.uid()) then
    raise exception 'Apenas usuários da SME podem registrar o recebimento.';
  end if;

  if p_receipt_date is null then raise exception 'Informe a data do recebimento.'; end if;
  if nullif(btrim(coalesce(p_received_by_name, '')), '') is null then
    raise exception 'Informe quem recebeu na escola.';
  end if;

  select * into v_profile from public.profiles where id = auth.uid();
  select * into v_delivery from public.deliveries where id = p_delivery_id for update;

  if v_delivery.id is null or v_delivery.request_id is null then
    raise exception 'Remessa não encontrada.';
  end if;
  if v_delivery.status <> 'dispatched' then
    raise exception 'Esta remessa já foi recebida ou cancelada.';
  end if;
  if p_receipt_date > current_date then
    raise exception 'A data do recebimento não pode estar no futuro.';
  end if;
  if p_receipt_date < coalesce(v_delivery.dispatch_date, v_delivery.delivery_date) then
    raise exception 'A data do recebimento não pode ser anterior à saída da remessa.';
  end if;

  select * into v_request from public.requests where id = v_delivery.request_id for update;

  update public.deliveries set
    status = 'delivered',
    receipt_date = p_receipt_date,
    delivery_date = p_receipt_date,
    received_by_name = btrim(p_received_by_name),
    received_by_position = nullif(btrim(p_received_by_position), ''),
    received_by_document = nullif(btrim(p_received_by_document), ''),
    receipt_notes = nullif(btrim(p_receipt_notes), ''),
    receipt_registered_by = auth.uid(),
    receipt_registered_by_name = v_profile.full_name,
    receipt_registered_by_email = v_profile.email
  where id = p_delivery_id;

  select coalesce(sum(approved_quantity), 0)
  into v_total_approved
  from public.request_items
  where request_id = v_delivery.request_id;

  select coalesce(sum(di.quantity), 0)
  into v_total_delivered
  from public.delivery_items di
  join public.deliveries d on d.id = di.delivery_id
  where d.request_id = v_delivery.request_id
    and d.status = 'delivered';

  select count(*)
  into v_open_dispatches
  from public.deliveries d
  where d.request_id = v_delivery.request_id
    and d.status = 'dispatched';

  v_new_status := case
    when v_total_delivered >= v_total_approved and v_total_approved > 0 then 'delivered'
    when v_open_dispatches > 0 then 'dispatched'
    else 'partially_delivered'
  end;

  update public.requests set status = v_new_status where id = v_delivery.request_id;

  perform public.log_request_event(
    v_delivery.request_id,
    'delivery_received',
    v_request.status,
    v_new_status,
    'Recebimento da remessa registrado pela SME. Recebedor: ' || btrim(p_received_by_name) || '.',
    p_delivery_id,
    jsonb_build_object('receipt_date', p_receipt_date, 'received_by', p_received_by_name)
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- RPC: escola confirma que visualizou/validou a entrega
-- ----------------------------------------------------------------------------

create or replace function public.confirm_delivery_by_school(
  p_delivery_id uuid,
  p_notes text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_delivery public.deliveries%rowtype;
  v_profile public.profiles%rowtype;
begin
  select * into v_profile from public.profiles where id = auth.uid();

  if v_profile.id is null or not v_profile.active or v_profile.account_type <> 'school' or v_profile.school_id is null then
    raise exception 'Apenas usuários vinculados à escola podem confirmar entregas.';
  end if;

  select * into v_delivery from public.deliveries where id = p_delivery_id for update;

  if v_delivery.id is null or v_delivery.school_id <> v_profile.school_id then
    raise exception 'Entrega não encontrada para esta escola.';
  end if;
  if v_delivery.status <> 'delivered' then
    raise exception 'A entrega ainda não foi registrada como recebida.';
  end if;
  if v_delivery.school_confirmed_at is not null then
    raise exception 'Esta entrega já foi confirmada pela escola.';
  end if;

  update public.deliveries set
    school_confirmed_by = auth.uid(),
    school_confirmed_by_name = v_profile.full_name,
    school_confirmed_at = now(),
    school_confirmation_notes = nullif(btrim(p_notes), '')
  where id = p_delivery_id;

  perform public.log_request_event(
    v_delivery.request_id,
    'delivery_confirmed_by_school',
    null,
    null,
    'A escola confirmou o recebimento da remessa no sistema.',
    p_delivery_id
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- RPC: cancelamento controlado
-- ----------------------------------------------------------------------------

create or replace function public.cancel_request(
  p_request_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.requests%rowtype;
  v_profile public.profiles%rowtype;
  v_allowed boolean := false;
begin
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'Informe o motivo do cancelamento.';
  end if;

  select * into v_profile from public.profiles where id = auth.uid();
  select * into v_request from public.requests where id = p_request_id for update;

  if v_request.id is null then raise exception 'Pedido não encontrado.'; end if;

  if v_profile.account_type = 'school'
     and v_profile.active
     and v_profile.school_id = v_request.school_id
     and v_request.status in ('draft', 'submitted') then
    v_allowed := true;
  end if;

  if public.is_sme_manager(auth.uid())
     and v_request.status in ('draft', 'submitted', 'under_review', 'approved', 'preparing') then
    v_allowed := true;
  end if;

  if not v_allowed then
    raise exception 'Você não tem permissão para cancelar este pedido neste estágio.';
  end if;

  update public.requests set
    status = 'cancelled',
    cancelled_by = auth.uid(),
    cancelled_by_name = v_profile.full_name,
    cancelled_at = now(),
    cancellation_reason = btrim(p_reason)
  where id = p_request_id;

  perform public.log_request_event(
    p_request_id, 'request_cancelled', v_request.status, 'cancelled',
    'Pedido cancelado: ' || btrim(p_reason)
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- RPC: administração de usuários sem expor a service_role no navegador
-- ----------------------------------------------------------------------------

create or replace function public.admin_update_profile(
  p_profile_id uuid,
  p_full_name text,
  p_account_type text,
  p_permission_level text,
  p_school_id uuid,
  p_active boolean,
  p_position text,
  p_phone text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_sme_admin(auth.uid()) then
    raise exception 'Somente administradores da SME podem alterar usuários.';
  end if;

  if p_account_type not in ('school', 'sme') then
    raise exception 'Tipo de conta inválido.';
  end if;

  if p_profile_id = auth.uid()
     and (coalesce(p_active, true) = false or p_account_type <> 'sme' or p_permission_level <> 'sme_admin') then
    raise exception 'O administrador não pode desativar ou remover a própria permissão administrativa.';
  end if;

  if p_account_type = 'school' then
    if p_permission_level <> 'school_user' or p_school_id is null then
      raise exception 'Usuários de escola precisam estar vinculados a uma escola.';
    end if;
  else
    if p_permission_level not in ('sme_operator', 'sme_manager', 'sme_admin') then
      raise exception 'Nível de permissão da SME inválido.';
    end if;
  end if;

  update public.profiles set
    full_name = nullif(btrim(p_full_name), ''),
    account_type = p_account_type,
    permission_level = p_permission_level,
    school_id = case when p_account_type = 'school' then p_school_id else null end,
    active = coalesce(p_active, true),
    position = nullif(btrim(p_position), ''),
    phone = nullif(btrim(p_phone), '')
  where id = p_profile_id;

  if not found then raise exception 'Usuário não encontrado.'; end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- RLS - cada escola enxerga somente os próprios dados; SME enxerga o conjunto.
-- ----------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.schools enable row level security;
alter table public.materials enable row level security;
alter table public.system_settings enable row level security;
alter table public.requests enable row level security;
alter table public.request_items enable row level security;
alter table public.deliveries enable row level security;
alter table public.delivery_items enable row level security;
alter table public.request_events enable row level security;

-- Remove políticas da versão anterior e desta versão para permitir reexecução.
drop policy if exists profiles_select_authenticated on public.profiles;
drop policy if exists profiles_insert_own on public.profiles;
drop policy if exists profiles_update_own on public.profiles;
drop policy if exists profiles_select_scoped on public.profiles;
drop policy if exists profiles_update_own_v2 on public.profiles;

drop policy if exists schools_select_authenticated on public.schools;
drop policy if exists schools_insert_authenticated on public.schools;
drop policy if exists schools_update_authenticated on public.schools;
drop policy if exists schools_delete_admin on public.schools;
drop policy if exists schools_select_scoped on public.schools;
drop policy if exists schools_insert_sme_manager on public.schools;
drop policy if exists schools_update_sme_manager on public.schools;
drop policy if exists schools_delete_sme_admin on public.schools;

drop policy if exists materials_select_authenticated on public.materials;
drop policy if exists materials_insert_authenticated on public.materials;
drop policy if exists materials_update_authenticated on public.materials;
drop policy if exists materials_delete_admin on public.materials;
drop policy if exists materials_select_active_users on public.materials;
drop policy if exists materials_insert_sme_manager on public.materials;
drop policy if exists materials_update_sme_manager on public.materials;
drop policy if exists materials_delete_sme_admin on public.materials;

drop policy if exists deliveries_select_authenticated on public.deliveries;
drop policy if exists deliveries_insert_authenticated on public.deliveries;
drop policy if exists deliveries_update_own_or_admin on public.deliveries;
drop policy if exists deliveries_delete_own_or_admin on public.deliveries;
drop policy if exists deliveries_select_scoped on public.deliveries;

drop policy if exists delivery_items_select_authenticated on public.delivery_items;
drop policy if exists delivery_items_insert_authenticated on public.delivery_items;
drop policy if exists delivery_items_update_own_or_admin on public.delivery_items;
drop policy if exists delivery_items_delete_own_or_admin on public.delivery_items;
drop policy if exists delivery_items_select_scoped on public.delivery_items;

drop policy if exists requests_select_scoped on public.requests;
drop policy if exists request_items_select_scoped on public.request_items;
drop policy if exists request_events_select_scoped on public.request_events;
drop policy if exists settings_select_authenticated on public.system_settings;
drop policy if exists settings_update_admin on public.system_settings;

-- Perfis
create policy profiles_select_scoped
on public.profiles for select to authenticated
using (id = auth.uid() or public.is_sme_admin(auth.uid()));

create policy profiles_update_own_v2
on public.profiles for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());

-- Escolas
create policy schools_select_scoped
on public.schools for select to authenticated
using (
  public.is_sme(auth.uid())
  or id = public.current_school_id(auth.uid())
);

create policy schools_insert_sme_manager
on public.schools for insert to authenticated
with check (public.is_sme_manager(auth.uid()));

create policy schools_update_sme_manager
on public.schools for update to authenticated
using (public.is_sme_manager(auth.uid()))
with check (public.is_sme_manager(auth.uid()));

create policy schools_delete_sme_admin
on public.schools for delete to authenticated
using (public.is_sme_admin(auth.uid()));

-- Materiais
create policy materials_select_active_users
on public.materials for select to authenticated
using (public.is_active_user(auth.uid()));

create policy materials_insert_sme_manager
on public.materials for insert to authenticated
with check (public.is_sme_manager(auth.uid()));

create policy materials_update_sme_manager
on public.materials for update to authenticated
using (public.is_sme_manager(auth.uid()))
with check (public.is_sme_manager(auth.uid()));

create policy materials_delete_sme_admin
on public.materials for delete to authenticated
using (public.is_sme_admin(auth.uid()));

-- Configurações
create policy settings_select_authenticated
on public.system_settings for select to authenticated
using (public.is_active_user(auth.uid()));

create policy settings_update_admin
on public.system_settings for update to authenticated
using (public.is_sme_admin(auth.uid()))
with check (public.is_sme_admin(auth.uid()));

-- Pedidos
create policy requests_select_scoped
on public.requests for select to authenticated
using (
  public.is_sme(auth.uid())
  or school_id = public.current_school_id(auth.uid())
);

create policy request_items_select_scoped
on public.request_items for select to authenticated
using (
  exists (
    select 1 from public.requests r
    where r.id = request_items.request_id
      and (
        public.is_sme(auth.uid())
        or r.school_id = public.current_school_id(auth.uid())
      )
  )
);

-- Entregas
create policy deliveries_select_scoped
on public.deliveries for select to authenticated
using (
  public.is_sme(auth.uid())
  or school_id = public.current_school_id(auth.uid())
);

create policy delivery_items_select_scoped
on public.delivery_items for select to authenticated
using (
  exists (
    select 1 from public.deliveries d
    where d.id = delivery_items.delivery_id
      and (
        public.is_sme(auth.uid())
        or d.school_id = public.current_school_id(auth.uid())
      )
  )
);

-- Histórico
create policy request_events_select_scoped
on public.request_events for select to authenticated
using (
  exists (
    select 1 from public.requests r
    where r.id = request_events.request_id
      and (
        public.is_sme(auth.uid())
        or r.school_id = public.current_school_id(auth.uid())
      )
  )
);

-- ----------------------------------------------------------------------------
-- Privilégios da API
-- ----------------------------------------------------------------------------

grant usage on schema public to authenticated;

revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;
grant update (full_name, phone, position, must_change_password) on table public.profiles to authenticated;

revoke all on table public.schools from anon, authenticated;
grant select, insert, update, delete on table public.schools to authenticated;

revoke all on table public.materials from anon, authenticated;
grant select, insert, update, delete on table public.materials to authenticated;

revoke all on table public.system_settings from anon, authenticated;
grant select, update on table public.system_settings to authenticated;

revoke all on table public.requests from anon, authenticated;
grant select on table public.requests to authenticated;

revoke all on table public.request_items from anon, authenticated;
grant select on table public.request_items to authenticated;

revoke all on table public.deliveries from anon, authenticated;
grant select on table public.deliveries to authenticated;

revoke all on table public.delivery_items from anon, authenticated;
grant select on table public.delivery_items to authenticated;

revoke all on table public.request_events from anon, authenticated;
grant select on table public.request_events to authenticated;

-- Funções auxiliares e RPCs liberadas apenas quando necessário.
revoke all on function public.is_active_user(uuid) from public, anon, authenticated;
revoke all on function public.is_sme(uuid) from public, anon, authenticated;
revoke all on function public.is_sme_manager(uuid) from public, anon, authenticated;
revoke all on function public.is_sme_admin(uuid) from public, anon, authenticated;
revoke all on function public.current_school_id(uuid) from public, anon, authenticated;
revoke all on function public.is_admin(uuid) from public, anon, authenticated;
revoke all on function public.log_request_event(uuid, text, text, text, text, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.save_school_request(uuid, text, text, date, text, text, text, jsonb, boolean) from public, anon;
revoke all on function public.receive_request(uuid) from public, anon;
revoke all on function public.authorize_request(uuid, jsonb, text) from public, anon;
revoke all on function public.reject_request(uuid, text) from public, anon;
revoke all on function public.start_request_preparation(uuid) from public, anon;
revoke all on function public.register_dispatch(uuid, date, text, text, text, text, jsonb) from public, anon;
revoke all on function public.register_delivery_receipt(uuid, date, text, text, text, text) from public, anon;
revoke all on function public.confirm_delivery_by_school(uuid, text) from public, anon;
revoke all on function public.cancel_request(uuid, text) from public, anon;
revoke all on function public.admin_update_profile(uuid, text, text, text, uuid, boolean, text, text) from public, anon;

grant execute on function public.is_active_user(uuid) to authenticated;
grant execute on function public.is_sme(uuid) to authenticated;
grant execute on function public.is_sme_manager(uuid) to authenticated;
grant execute on function public.is_sme_admin(uuid) to authenticated;
grant execute on function public.current_school_id(uuid) to authenticated;

grant execute on function public.save_school_request(uuid, text, text, date, text, text, text, jsonb, boolean) to authenticated;
grant execute on function public.receive_request(uuid) to authenticated;
grant execute on function public.authorize_request(uuid, jsonb, text) to authenticated;
grant execute on function public.reject_request(uuid, text) to authenticated;
grant execute on function public.start_request_preparation(uuid) to authenticated;
grant execute on function public.register_dispatch(uuid, date, text, text, text, text, jsonb) to authenticated;
grant execute on function public.register_delivery_receipt(uuid, date, text, text, text, text) to authenticated;
grant execute on function public.confirm_delivery_by_school(uuid, text) to authenticated;
grant execute on function public.cancel_request(uuid, text) to authenticated;
grant execute on function public.admin_update_profile(uuid, text, text, text, uuid, boolean, text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- PRIMEIRO ADMINISTRADOR
-- Depois de criar o primeiro usuário no Supabase Authentication, execute:
--
-- update public.profiles
-- set account_type = 'sme', permission_level = 'sme_admin', school_id = null,
--     active = true, must_change_password = false
-- where email = 'seu-email@municipio.gov.br';
-- ----------------------------------------------------------------------------

-- ================================================================
-- MIGRAÇÃO 003 — ACESSOS DAS ESCOLAS POR CÓDIGO
-- ================================================================
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

-- ================================================================
-- MIGRAÇÃO 004 — CATÁLOGO INICIAL DE MATERIAIS
-- ================================================================
-- Catálogo inicial de materiais para o Sistema Integrado de Pedidos e Entrega de Materiais
-- Município de Canindé/CE
-- Total de itens: 215
-- Como usar: Supabase > SQL Editor > New query > cole todo este arquivo > Run.
-- O script é seguro para reexecutar: atualiza itens pelo código e evita duplicidade por nome.

begin;

alter table public.materials add column if not exists codigo text;
alter table public.materials add column if not exists quantidade_minima numeric(14,2);

create unique index if not exists materials_codigo_unique_idx
  on public.materials (codigo) where codigo is not null and btrim(codigo) <> '';

create temporary table tmp_catalogo_materiais (
  codigo text primary key,
  nome text not null,
  categoria text not null,
  unidade text not null,
  descricao text,
  ativo boolean not null default true,
  quantidade_minima numeric(14,2) not null default 0
) on commit drop;

insert into tmp_catalogo_materiais
  (codigo, nome, categoria, unidade, descricao, ativo, quantidade_minima)
values
  ('MOB-001', 'Armário de aço 2 portas', 'Mobiliário', 'Unidade', 'Item do catálogo inicial de materiais da categoria Mobiliário.', true, 0),
  ('MOB-002', 'Armário de aço 4 portas', 'Mobiliário', 'Unidade', 'Item do catálogo inicial de materiais da categoria Mobiliário.', true, 0),
  ('MOB-003', 'Arquivo de aço com gavetas', 'Mobiliário', 'Unidade', 'Item do catálogo inicial de materiais da categoria Mobiliário.', true, 0),
  ('MOB-004', 'Estante de aço', 'Mobiliário', 'Unidade', 'Item do catálogo inicial de materiais da categoria Mobiliário.', true, 0),
  ('MOB-005', 'Mesa para professor', 'Mobiliário', 'Unidade', 'Item do catálogo inicial de materiais da categoria Mobiliário.', true, 0),
  ('MOB-006', 'Mesa para aluno', 'Mobiliário', 'Unidade', 'Item do catálogo inicial de materiais da categoria Mobiliário.', true, 0),
  ('MOB-007', 'Cadeira para aluno', 'Mobiliário', 'Unidade', 'Item do catálogo inicial de materiais da categoria Mobiliário.', true, 0),
  ('MOB-008', 'Cadeira para professor', 'Mobiliário', 'Unidade', 'Item do catálogo inicial de materiais da categoria Mobiliário.', true, 0),
  ('MOB-009', 'Conjunto aluno mesa e cadeira', 'Mobiliário', 'Conjunto', 'Item do catálogo inicial de materiais da categoria Mobiliário.', true, 0),
  ('MOB-010', 'Mesa para secretaria', 'Mobiliário', 'Unidade', 'Item do catálogo inicial de materiais da categoria Mobiliário.', true, 0),
  ('MOB-011', 'Cadeira giratória', 'Mobiliário', 'Unidade', 'Item do catálogo inicial de materiais da categoria Mobiliário.', true, 0),
  ('MOB-012', 'Cadeira fixa', 'Mobiliário', 'Unidade', 'Item do catálogo inicial de materiais da categoria Mobiliário.', true, 0),
  ('MOB-013', 'Longarina', 'Mobiliário', 'Unidade', 'Item do catálogo inicial de materiais da categoria Mobiliário.', true, 0),
  ('MOB-014', 'Birô administrativo', 'Mobiliário', 'Unidade', 'Item do catálogo inicial de materiais da categoria Mobiliário.', true, 0),
  ('MOB-015', 'Mesa de reunião', 'Mobiliário', 'Unidade', 'Item do catálogo inicial de materiais da categoria Mobiliário.', true, 0),
  ('MOB-016', 'Quadro branco', 'Mobiliário', 'Unidade', 'Item do catálogo inicial de materiais da categoria Mobiliário.', true, 0),
  ('MOB-017', 'Quadro verde', 'Mobiliário', 'Unidade', 'Item do catálogo inicial de materiais da categoria Mobiliário.', true, 0),
  ('MOB-018', 'Quadro de avisos', 'Mobiliário', 'Unidade', 'Item do catálogo inicial de materiais da categoria Mobiliário.', true, 0),
  ('MOB-019', 'Prateleira', 'Mobiliário', 'Unidade', 'Item do catálogo inicial de materiais da categoria Mobiliário.', true, 0),
  ('MOB-020', 'Banco escolar', 'Mobiliário', 'Unidade', 'Item do catálogo inicial de materiais da categoria Mobiliário.', true, 0),
  ('MOB-021', 'Carteira escolar', 'Mobiliário', 'Unidade', 'Item do catálogo inicial de materiais da categoria Mobiliário.', true, 0),
  ('EXP-001', 'Papel A4', 'Expediente', 'Resma', 'Item do catálogo inicial de materiais da categoria Expediente.', true, 0),
  ('EXP-002', 'Papel ofício', 'Expediente', 'Resma', 'Item do catálogo inicial de materiais da categoria Expediente.', true, 0),
  ('EXP-003', 'Pasta AZ', 'Expediente', 'Unidade', 'Item do catálogo inicial de materiais da categoria Expediente.', true, 0),
  ('EXP-004', 'Pasta suspensa', 'Expediente', 'Unidade', 'Item do catálogo inicial de materiais da categoria Expediente.', true, 0),
  ('EXP-005', 'Pasta catálogo', 'Expediente', 'Unidade', 'Item do catálogo inicial de materiais da categoria Expediente.', true, 0),
  ('EXP-006', 'Pasta com elástico', 'Expediente', 'Unidade', 'Item do catálogo inicial de materiais da categoria Expediente.', true, 0),
  ('EXP-007', 'Envelope A4', 'Expediente', 'Unidade', 'Item do catálogo inicial de materiais da categoria Expediente.', true, 0),
  ('EXP-008', 'Envelope ofício', 'Expediente', 'Unidade', 'Item do catálogo inicial de materiais da categoria Expediente.', true, 0),
  ('EXP-009', 'Caneta azul', 'Expediente', 'Unidade', 'Item do catálogo inicial de materiais da categoria Expediente.', true, 0),
  ('EXP-010', 'Caneta preta', 'Expediente', 'Unidade', 'Item do catálogo inicial de materiais da categoria Expediente.', true, 0),
  ('EXP-011', 'Caneta vermelha', 'Expediente', 'Unidade', 'Item do catálogo inicial de materiais da categoria Expediente.', true, 0),
  ('EXP-012', 'Lápis grafite', 'Expediente', 'Unidade', 'Item do catálogo inicial de materiais da categoria Expediente.', true, 0),
  ('EXP-013', 'Borracha branca', 'Expediente', 'Unidade', 'Item do catálogo inicial de materiais da categoria Expediente.', true, 0),
  ('EXP-014', 'Apontador', 'Expediente', 'Unidade', 'Item do catálogo inicial de materiais da categoria Expediente.', true, 0),
  ('EXP-015', 'Régua 30 cm', 'Expediente', 'Unidade', 'Item do catálogo inicial de materiais da categoria Expediente.', true, 0),
  ('EXP-016', 'Cola branca', 'Expediente', 'Unidade', 'Item do catálogo inicial de materiais da categoria Expediente.', true, 0),
  ('EXP-017', 'Cola bastão', 'Expediente', 'Unidade', 'Item do catálogo inicial de materiais da categoria Expediente.', true, 0),
  ('EXP-018', 'Tesoura sem ponta', 'Expediente', 'Unidade', 'Item do catálogo inicial de materiais da categoria Expediente.', true, 0),
  ('EXP-019', 'Tesoura grande', 'Expediente', 'Unidade', 'Item do catálogo inicial de materiais da categoria Expediente.', true, 0),
  ('EXP-020', 'Grampeador', 'Expediente', 'Unidade', 'Item do catálogo inicial de materiais da categoria Expediente.', true, 0),
  ('EXP-021', 'Grampo para grampeador', 'Expediente', 'Caixa', 'Item do catálogo inicial de materiais da categoria Expediente.', true, 0),
  ('EXP-022', 'Extrator de grampos', 'Expediente', 'Unidade', 'Item do catálogo inicial de materiais da categoria Expediente.', true, 0),
  ('EXP-023', 'Clips', 'Expediente', 'Caixa', 'Item do catálogo inicial de materiais da categoria Expediente.', true, 0),
  ('EXP-024', 'Percevejo', 'Expediente', 'Caixa', 'Item do catálogo inicial de materiais da categoria Expediente.', true, 0),
  ('EXP-025', 'Fita adesiva transparente', 'Expediente', 'Unidade', 'Item do catálogo inicial de materiais da categoria Expediente.', true, 0),
  ('EXP-026', 'Fita crepe', 'Expediente', 'Unidade', 'Item do catálogo inicial de materiais da categoria Expediente.', true, 0),
  ('EXP-027', 'Marcador permanente', 'Expediente', 'Unidade', 'Item do catálogo inicial de materiais da categoria Expediente.', true, 0),
  ('EXP-028', 'Marca-texto', 'Expediente', 'Unidade', 'Item do catálogo inicial de materiais da categoria Expediente.', true, 0),
  ('EXP-029', 'Corretivo', 'Expediente', 'Unidade', 'Item do catálogo inicial de materiais da categoria Expediente.', true, 0),
  ('EXP-030', 'Calculadora', 'Expediente', 'Unidade', 'Item do catálogo inicial de materiais da categoria Expediente.', true, 0),
  ('EXP-031', 'Livro de protocolo', 'Expediente', 'Unidade', 'Item do catálogo inicial de materiais da categoria Expediente.', true, 0),
  ('EXP-032', 'Livro de ata', 'Expediente', 'Unidade', 'Item do catálogo inicial de materiais da categoria Expediente.', true, 0),
  ('EXP-033', 'Carimbo', 'Expediente', 'Unidade', 'Item do catálogo inicial de materiais da categoria Expediente.', true, 0),
  ('EXP-034', 'Almofada para carimbo', 'Expediente', 'Unidade', 'Item do catálogo inicial de materiais da categoria Expediente.', true, 0),
  ('EXP-035', 'Tinta para carimbo', 'Expediente', 'Unidade', 'Item do catálogo inicial de materiais da categoria Expediente.', true, 0),
  ('PED-001', 'Caderno brochura', 'Pedagógico', 'Unidade', 'Item do catálogo inicial de materiais da categoria Pedagógico.', true, 0),
  ('PED-002', 'Caderno universitário', 'Pedagógico', 'Unidade', 'Item do catálogo inicial de materiais da categoria Pedagógico.', true, 0),
  ('PED-003', 'Lápis de cor', 'Pedagógico', 'Caixa', 'Item do catálogo inicial de materiais da categoria Pedagógico.', true, 0),
  ('PED-004', 'Giz de cera', 'Pedagógico', 'Caixa', 'Item do catálogo inicial de materiais da categoria Pedagógico.', true, 0),
  ('PED-005', 'Hidrocor', 'Pedagógico', 'Caixa', 'Item do catálogo inicial de materiais da categoria Pedagógico.', true, 0),
  ('PED-006', 'Tinta guache', 'Pedagógico', 'Caixa', 'Item do catálogo inicial de materiais da categoria Pedagógico.', true, 0),
  ('PED-007', 'Pincel escolar', 'Pedagógico', 'Unidade', 'Item do catálogo inicial de materiais da categoria Pedagógico.', true, 0),
  ('PED-008', 'Cartolina', 'Pedagógico', 'Unidade', 'Item do catálogo inicial de materiais da categoria Pedagógico.', true, 0),
  ('PED-009', 'Papel madeira', 'Pedagógico', 'Unidade', 'Item do catálogo inicial de materiais da categoria Pedagógico.', true, 0),
  ('PED-010', 'Papel crepom', 'Pedagógico', 'Unidade', 'Item do catálogo inicial de materiais da categoria Pedagógico.', true, 0),
  ('PED-011', 'Papel laminado', 'Pedagógico', 'Unidade', 'Item do catálogo inicial de materiais da categoria Pedagógico.', true, 0),
  ('PED-012', 'Papel camurça', 'Pedagógico', 'Unidade', 'Item do catálogo inicial de materiais da categoria Pedagógico.', true, 0),
  ('PED-013', 'EVA', 'Pedagógico', 'Folha', 'Item do catálogo inicial de materiais da categoria Pedagógico.', true, 0),
  ('PED-014', 'TNT', 'Pedagógico', 'Metro', 'Item do catálogo inicial de materiais da categoria Pedagógico.', true, 0),
  ('PED-015', 'Massa de modelar', 'Pedagógico', 'Caixa', 'Item do catálogo inicial de materiais da categoria Pedagógico.', true, 0),
  ('PED-016', 'Cola colorida', 'Pedagógico', 'Caixa', 'Item do catálogo inicial de materiais da categoria Pedagógico.', true, 0),
  ('PED-017', 'Jogo pedagógico', 'Pedagógico', 'Unidade', 'Item do catálogo inicial de materiais da categoria Pedagógico.', true, 0),
  ('PED-018', 'Alfabeto móvel', 'Pedagógico', 'Conjunto', 'Item do catálogo inicial de materiais da categoria Pedagógico.', true, 0),
  ('PED-019', 'Material dourado', 'Pedagógico', 'Conjunto', 'Item do catálogo inicial de materiais da categoria Pedagógico.', true, 0),
  ('PED-020', 'Blocos lógicos', 'Pedagógico', 'Conjunto', 'Item do catálogo inicial de materiais da categoria Pedagógico.', true, 0),
  ('PED-021', 'Dominó pedagógico', 'Pedagógico', 'Unidade', 'Item do catálogo inicial de materiais da categoria Pedagógico.', true, 0),
  ('PED-022', 'Quebra-cabeça pedagógico', 'Pedagógico', 'Unidade', 'Item do catálogo inicial de materiais da categoria Pedagógico.', true, 0),
  ('PED-023', 'Livro paradidático', 'Pedagógico', 'Unidade', 'Item do catálogo inicial de materiais da categoria Pedagógico.', true, 0),
  ('PED-024', 'Dicionário', 'Pedagógico', 'Unidade', 'Item do catálogo inicial de materiais da categoria Pedagógico.', true, 0),
  ('PED-025', 'Globo terrestre', 'Pedagógico', 'Unidade', 'Item do catálogo inicial de materiais da categoria Pedagógico.', true, 0),
  ('PED-026', 'Mapa escolar', 'Pedagógico', 'Unidade', 'Item do catálogo inicial de materiais da categoria Pedagógico.', true, 0),
  ('INF-001', 'Computador desktop', 'Informática e Tecnologia', 'Unidade', 'Item do catálogo inicial de materiais da categoria Informática e Tecnologia.', true, 0),
  ('INF-002', 'Notebook', 'Informática e Tecnologia', 'Unidade', 'Item do catálogo inicial de materiais da categoria Informática e Tecnologia.', true, 0),
  ('INF-003', 'Tablet', 'Informática e Tecnologia', 'Unidade', 'Item do catálogo inicial de materiais da categoria Informática e Tecnologia.', true, 0),
  ('INF-004', 'Monitor', 'Informática e Tecnologia', 'Unidade', 'Item do catálogo inicial de materiais da categoria Informática e Tecnologia.', true, 0),
  ('INF-005', 'Teclado', 'Informática e Tecnologia', 'Unidade', 'Item do catálogo inicial de materiais da categoria Informática e Tecnologia.', true, 0),
  ('INF-006', 'Mouse', 'Informática e Tecnologia', 'Unidade', 'Item do catálogo inicial de materiais da categoria Informática e Tecnologia.', true, 0),
  ('INF-007', 'Caixa de som', 'Informática e Tecnologia', 'Unidade', 'Item do catálogo inicial de materiais da categoria Informática e Tecnologia.', true, 0),
  ('INF-008', 'Projetor multimídia', 'Informática e Tecnologia', 'Unidade', 'Item do catálogo inicial de materiais da categoria Informática e Tecnologia.', true, 0),
  ('INF-009', 'Tela de projeção', 'Informática e Tecnologia', 'Unidade', 'Item do catálogo inicial de materiais da categoria Informática e Tecnologia.', true, 0),
  ('INF-010', 'Impressora', 'Informática e Tecnologia', 'Unidade', 'Item do catálogo inicial de materiais da categoria Informática e Tecnologia.', true, 0),
  ('INF-011', 'Toner para impressora', 'Informática e Tecnologia', 'Unidade', 'Item do catálogo inicial de materiais da categoria Informática e Tecnologia.', true, 0),
  ('INF-012', 'Cartucho de tinta', 'Informática e Tecnologia', 'Unidade', 'Item do catálogo inicial de materiais da categoria Informática e Tecnologia.', true, 0),
  ('INF-013', 'Cabo HDMI', 'Informática e Tecnologia', 'Unidade', 'Item do catálogo inicial de materiais da categoria Informática e Tecnologia.', true, 0),
  ('INF-014', 'Cabo VGA', 'Informática e Tecnologia', 'Unidade', 'Item do catálogo inicial de materiais da categoria Informática e Tecnologia.', true, 0),
  ('INF-015', 'Cabo de rede', 'Informática e Tecnologia', 'Metro', 'Item do catálogo inicial de materiais da categoria Informática e Tecnologia.', true, 0),
  ('INF-016', 'Roteador', 'Informática e Tecnologia', 'Unidade', 'Item do catálogo inicial de materiais da categoria Informática e Tecnologia.', true, 0),
  ('INF-017', 'Nobreak', 'Informática e Tecnologia', 'Unidade', 'Item do catálogo inicial de materiais da categoria Informática e Tecnologia.', true, 0),
  ('INF-018', 'Estabilizador', 'Informática e Tecnologia', 'Unidade', 'Item do catálogo inicial de materiais da categoria Informática e Tecnologia.', true, 0),
  ('INF-019', 'Pendrive', 'Informática e Tecnologia', 'Unidade', 'Item do catálogo inicial de materiais da categoria Informática e Tecnologia.', true, 0),
  ('INF-020', 'HD externo', 'Informática e Tecnologia', 'Unidade', 'Item do catálogo inicial de materiais da categoria Informática e Tecnologia.', true, 0),
  ('INF-021', 'Webcam', 'Informática e Tecnologia', 'Unidade', 'Item do catálogo inicial de materiais da categoria Informática e Tecnologia.', true, 0),
  ('INF-022', 'Microfone', 'Informática e Tecnologia', 'Unidade', 'Item do catálogo inicial de materiais da categoria Informática e Tecnologia.', true, 0),
  ('LIM-001', 'Água sanitária', 'Limpeza e Higiene', 'Litro', 'Item do catálogo inicial de materiais da categoria Limpeza e Higiene.', true, 0),
  ('LIM-002', 'Desinfetante', 'Limpeza e Higiene', 'Litro', 'Item do catálogo inicial de materiais da categoria Limpeza e Higiene.', true, 0),
  ('LIM-003', 'Detergente', 'Limpeza e Higiene', 'Unidade', 'Item do catálogo inicial de materiais da categoria Limpeza e Higiene.', true, 0),
  ('LIM-004', 'Sabão em pó', 'Limpeza e Higiene', 'Kg', 'Item do catálogo inicial de materiais da categoria Limpeza e Higiene.', true, 0),
  ('LIM-005', 'Sabão líquido', 'Limpeza e Higiene', 'Litro', 'Item do catálogo inicial de materiais da categoria Limpeza e Higiene.', true, 0),
  ('LIM-006', 'Sabão em barra', 'Limpeza e Higiene', 'Unidade', 'Item do catálogo inicial de materiais da categoria Limpeza e Higiene.', true, 0),
  ('LIM-007', 'Álcool 70%', 'Limpeza e Higiene', 'Litro', 'Item do catálogo inicial de materiais da categoria Limpeza e Higiene.', true, 0),
  ('LIM-008', 'Limpador multiuso', 'Limpeza e Higiene', 'Unidade', 'Item do catálogo inicial de materiais da categoria Limpeza e Higiene.', true, 0),
  ('LIM-009', 'Esponja de limpeza', 'Limpeza e Higiene', 'Unidade', 'Item do catálogo inicial de materiais da categoria Limpeza e Higiene.', true, 0),
  ('LIM-010', 'Pano de chão', 'Limpeza e Higiene', 'Unidade', 'Item do catálogo inicial de materiais da categoria Limpeza e Higiene.', true, 0),
  ('LIM-011', 'Pano multiuso', 'Limpeza e Higiene', 'Pacote', 'Item do catálogo inicial de materiais da categoria Limpeza e Higiene.', true, 0),
  ('LIM-012', 'Flanela', 'Limpeza e Higiene', 'Unidade', 'Item do catálogo inicial de materiais da categoria Limpeza e Higiene.', true, 0),
  ('LIM-013', 'Rodo', 'Limpeza e Higiene', 'Unidade', 'Item do catálogo inicial de materiais da categoria Limpeza e Higiene.', true, 0),
  ('LIM-014', 'Vassoura', 'Limpeza e Higiene', 'Unidade', 'Item do catálogo inicial de materiais da categoria Limpeza e Higiene.', true, 0),
  ('LIM-015', 'Pá de lixo', 'Limpeza e Higiene', 'Unidade', 'Item do catálogo inicial de materiais da categoria Limpeza e Higiene.', true, 0),
  ('LIM-016', 'Balde', 'Limpeza e Higiene', 'Unidade', 'Item do catálogo inicial de materiais da categoria Limpeza e Higiene.', true, 0),
  ('LIM-017', 'Cesto de lixo', 'Limpeza e Higiene', 'Unidade', 'Item do catálogo inicial de materiais da categoria Limpeza e Higiene.', true, 0),
  ('LIM-018', 'Saco de lixo 30L', 'Limpeza e Higiene', 'Pacote', 'Item do catálogo inicial de materiais da categoria Limpeza e Higiene.', true, 0),
  ('LIM-019', 'Saco de lixo 50L', 'Limpeza e Higiene', 'Pacote', 'Item do catálogo inicial de materiais da categoria Limpeza e Higiene.', true, 0),
  ('LIM-020', 'Saco de lixo 100L', 'Limpeza e Higiene', 'Pacote', 'Item do catálogo inicial de materiais da categoria Limpeza e Higiene.', true, 0),
  ('LIM-021', 'Papel higiênico', 'Limpeza e Higiene', 'Fardo', 'Item do catálogo inicial de materiais da categoria Limpeza e Higiene.', true, 0),
  ('LIM-022', 'Papel toalha', 'Limpeza e Higiene', 'Fardo', 'Item do catálogo inicial de materiais da categoria Limpeza e Higiene.', true, 0),
  ('LIM-023', 'Sabonete líquido', 'Limpeza e Higiene', 'Litro', 'Item do catálogo inicial de materiais da categoria Limpeza e Higiene.', true, 0),
  ('LIM-024', 'Dispenser para sabonete', 'Limpeza e Higiene', 'Unidade', 'Item do catálogo inicial de materiais da categoria Limpeza e Higiene.', true, 0),
  ('LIM-025', 'Dispenser para papel toalha', 'Limpeza e Higiene', 'Unidade', 'Item do catálogo inicial de materiais da categoria Limpeza e Higiene.', true, 0),
  ('LIM-026', 'Luva de limpeza', 'Limpeza e Higiene', 'Par', 'Item do catálogo inicial de materiais da categoria Limpeza e Higiene.', true, 0),
  ('LIM-027', 'Escova sanitária', 'Limpeza e Higiene', 'Unidade', 'Item do catálogo inicial de materiais da categoria Limpeza e Higiene.', true, 0),
  ('LIM-028', 'Desodorizador sanitário', 'Limpeza e Higiene', 'Unidade', 'Item do catálogo inicial de materiais da categoria Limpeza e Higiene.', true, 0),
  ('COP-001', 'Copo descartável', 'Copa e Cozinha', 'Pacote', 'Item do catálogo inicial de materiais da categoria Copa e Cozinha.', true, 0),
  ('COP-002', 'Prato descartável', 'Copa e Cozinha', 'Pacote', 'Item do catálogo inicial de materiais da categoria Copa e Cozinha.', true, 0),
  ('COP-003', 'Colher descartável', 'Copa e Cozinha', 'Pacote', 'Item do catálogo inicial de materiais da categoria Copa e Cozinha.', true, 0),
  ('COP-004', 'Garfo descartável', 'Copa e Cozinha', 'Pacote', 'Item do catálogo inicial de materiais da categoria Copa e Cozinha.', true, 0),
  ('COP-005', 'Faca descartável', 'Copa e Cozinha', 'Pacote', 'Item do catálogo inicial de materiais da categoria Copa e Cozinha.', true, 0),
  ('COP-006', 'Guardanapo', 'Copa e Cozinha', 'Pacote', 'Item do catálogo inicial de materiais da categoria Copa e Cozinha.', true, 0),
  ('COP-007', 'Garrafa térmica', 'Copa e Cozinha', 'Unidade', 'Item do catálogo inicial de materiais da categoria Copa e Cozinha.', true, 0),
  ('COP-008', 'Jarra', 'Copa e Cozinha', 'Unidade', 'Item do catálogo inicial de materiais da categoria Copa e Cozinha.', true, 0),
  ('COP-009', 'Panela', 'Copa e Cozinha', 'Unidade', 'Item do catálogo inicial de materiais da categoria Copa e Cozinha.', true, 0),
  ('COP-010', 'Frigideira', 'Copa e Cozinha', 'Unidade', 'Item do catálogo inicial de materiais da categoria Copa e Cozinha.', true, 0),
  ('COP-011', 'Concha', 'Copa e Cozinha', 'Unidade', 'Item do catálogo inicial de materiais da categoria Copa e Cozinha.', true, 0),
  ('COP-012', 'Escumadeira', 'Copa e Cozinha', 'Unidade', 'Item do catálogo inicial de materiais da categoria Copa e Cozinha.', true, 0),
  ('COP-013', 'Colher de servir', 'Copa e Cozinha', 'Unidade', 'Item do catálogo inicial de materiais da categoria Copa e Cozinha.', true, 0),
  ('COP-014', 'Prato', 'Copa e Cozinha', 'Unidade', 'Item do catálogo inicial de materiais da categoria Copa e Cozinha.', true, 0),
  ('COP-015', 'Copo', 'Copa e Cozinha', 'Unidade', 'Item do catálogo inicial de materiais da categoria Copa e Cozinha.', true, 0),
  ('COP-016', 'Talher', 'Copa e Cozinha', 'Unidade', 'Item do catálogo inicial de materiais da categoria Copa e Cozinha.', true, 0),
  ('COP-017', 'Bandeja', 'Copa e Cozinha', 'Unidade', 'Item do catálogo inicial de materiais da categoria Copa e Cozinha.', true, 0),
  ('COP-018', 'Pote plástico', 'Copa e Cozinha', 'Unidade', 'Item do catálogo inicial de materiais da categoria Copa e Cozinha.', true, 0),
  ('COP-019', 'Lixeira com pedal', 'Copa e Cozinha', 'Unidade', 'Item do catálogo inicial de materiais da categoria Copa e Cozinha.', true, 0),
  ('MAN-001', 'Lâmpada LED', 'Manutenção', 'Unidade', 'Item do catálogo inicial de materiais da categoria Manutenção.', true, 0),
  ('MAN-002', 'Reator', 'Manutenção', 'Unidade', 'Item do catálogo inicial de materiais da categoria Manutenção.', true, 0),
  ('MAN-003', 'Tomada', 'Manutenção', 'Unidade', 'Item do catálogo inicial de materiais da categoria Manutenção.', true, 0),
  ('MAN-004', 'Interruptor', 'Manutenção', 'Unidade', 'Item do catálogo inicial de materiais da categoria Manutenção.', true, 0),
  ('MAN-005', 'Fio elétrico', 'Manutenção', 'Metro', 'Item do catálogo inicial de materiais da categoria Manutenção.', true, 0),
  ('MAN-006', 'Extensão elétrica', 'Manutenção', 'Unidade', 'Item do catálogo inicial de materiais da categoria Manutenção.', true, 0),
  ('MAN-007', 'Filtro de linha', 'Manutenção', 'Unidade', 'Item do catálogo inicial de materiais da categoria Manutenção.', true, 0),
  ('MAN-008', 'Cadeado', 'Manutenção', 'Unidade', 'Item do catálogo inicial de materiais da categoria Manutenção.', true, 0),
  ('MAN-009', 'Fechadura', 'Manutenção', 'Unidade', 'Item do catálogo inicial de materiais da categoria Manutenção.', true, 0),
  ('MAN-010', 'Dobradiça', 'Manutenção', 'Unidade', 'Item do catálogo inicial de materiais da categoria Manutenção.', true, 0),
  ('MAN-011', 'Parafuso', 'Manutenção', 'Caixa', 'Item do catálogo inicial de materiais da categoria Manutenção.', true, 0),
  ('MAN-012', 'Bucha', 'Manutenção', 'Caixa', 'Item do catálogo inicial de materiais da categoria Manutenção.', true, 0),
  ('MAN-013', 'Prego', 'Manutenção', 'Kg', 'Item do catálogo inicial de materiais da categoria Manutenção.', true, 0),
  ('MAN-014', 'Martelo', 'Manutenção', 'Unidade', 'Item do catálogo inicial de materiais da categoria Manutenção.', true, 0),
  ('MAN-015', 'Alicate', 'Manutenção', 'Unidade', 'Item do catálogo inicial de materiais da categoria Manutenção.', true, 0),
  ('MAN-016', 'Chave de fenda', 'Manutenção', 'Unidade', 'Item do catálogo inicial de materiais da categoria Manutenção.', true, 0),
  ('MAN-017', 'Chave Philips', 'Manutenção', 'Unidade', 'Item do catálogo inicial de materiais da categoria Manutenção.', true, 0),
  ('MAN-018', 'Trena', 'Manutenção', 'Unidade', 'Item do catálogo inicial de materiais da categoria Manutenção.', true, 0),
  ('MAN-019', 'Cola instantânea', 'Manutenção', 'Unidade', 'Item do catálogo inicial de materiais da categoria Manutenção.', true, 0),
  ('MAN-020', 'Silicone', 'Manutenção', 'Unidade', 'Item do catálogo inicial de materiais da categoria Manutenção.', true, 0),
  ('MAN-021', 'Tinta para parede', 'Manutenção', 'Galão', 'Item do catálogo inicial de materiais da categoria Manutenção.', true, 0),
  ('MAN-022', 'Pincel para pintura', 'Manutenção', 'Unidade', 'Item do catálogo inicial de materiais da categoria Manutenção.', true, 0),
  ('MAN-023', 'Rolo de pintura', 'Manutenção', 'Unidade', 'Item do catálogo inicial de materiais da categoria Manutenção.', true, 0),
  ('MAN-024', 'Massa corrida', 'Manutenção', 'Kg', 'Item do catálogo inicial de materiais da categoria Manutenção.', true, 0),
  ('MAN-025', 'Cimento', 'Manutenção', 'Saco', 'Item do catálogo inicial de materiais da categoria Manutenção.', true, 0),
  ('MAN-026', 'Areia', 'Manutenção', 'Metro cúbico', 'Item do catálogo inicial de materiais da categoria Manutenção.', true, 0),
  ('MAN-027', 'Cano PVC', 'Manutenção', 'Unidade', 'Item do catálogo inicial de materiais da categoria Manutenção.', true, 0),
  ('MAN-028', 'Torneira', 'Manutenção', 'Unidade', 'Item do catálogo inicial de materiais da categoria Manutenção.', true, 0),
  ('MAN-029', 'Registro', 'Manutenção', 'Unidade', 'Item do catálogo inicial de materiais da categoria Manutenção.', true, 0),
  ('ESP-001', 'Bola de futebol', 'Esporte e Recreação', 'Unidade', 'Item do catálogo inicial de materiais da categoria Esporte e Recreação.', true, 0),
  ('ESP-002', 'Bola de futsal', 'Esporte e Recreação', 'Unidade', 'Item do catálogo inicial de materiais da categoria Esporte e Recreação.', true, 0),
  ('ESP-003', 'Bola de vôlei', 'Esporte e Recreação', 'Unidade', 'Item do catálogo inicial de materiais da categoria Esporte e Recreação.', true, 0),
  ('ESP-004', 'Bola de basquete', 'Esporte e Recreação', 'Unidade', 'Item do catálogo inicial de materiais da categoria Esporte e Recreação.', true, 0),
  ('ESP-005', 'Rede de vôlei', 'Esporte e Recreação', 'Unidade', 'Item do catálogo inicial de materiais da categoria Esporte e Recreação.', true, 0),
  ('ESP-006', 'Rede de futebol', 'Esporte e Recreação', 'Unidade', 'Item do catálogo inicial de materiais da categoria Esporte e Recreação.', true, 0),
  ('ESP-007', 'Cone esportivo', 'Esporte e Recreação', 'Unidade', 'Item do catálogo inicial de materiais da categoria Esporte e Recreação.', true, 0),
  ('ESP-008', 'Bambolê', 'Esporte e Recreação', 'Unidade', 'Item do catálogo inicial de materiais da categoria Esporte e Recreação.', true, 0),
  ('ESP-009', 'Corda', 'Esporte e Recreação', 'Unidade', 'Item do catálogo inicial de materiais da categoria Esporte e Recreação.', true, 0),
  ('ESP-010', 'Apito', 'Esporte e Recreação', 'Unidade', 'Item do catálogo inicial de materiais da categoria Esporte e Recreação.', true, 0),
  ('ESP-011', 'Colchonete', 'Esporte e Recreação', 'Unidade', 'Item do catálogo inicial de materiais da categoria Esporte e Recreação.', true, 0),
  ('ESP-012', 'Jogo de dama', 'Esporte e Recreação', 'Unidade', 'Item do catálogo inicial de materiais da categoria Esporte e Recreação.', true, 0),
  ('ESP-013', 'Jogo de xadrez', 'Esporte e Recreação', 'Unidade', 'Item do catálogo inicial de materiais da categoria Esporte e Recreação.', true, 0),
  ('ESP-014', 'Mesa de tênis de mesa', 'Esporte e Recreação', 'Unidade', 'Item do catálogo inicial de materiais da categoria Esporte e Recreação.', true, 0),
  ('ESP-015', 'Raquete de tênis de mesa', 'Esporte e Recreação', 'Unidade', 'Item do catálogo inicial de materiais da categoria Esporte e Recreação.', true, 0),
  ('SEG-001', 'Extintor de incêndio', 'Segurança e Sinalização', 'Unidade', 'Item do catálogo inicial de materiais da categoria Segurança e Sinalização.', true, 0),
  ('SEG-002', 'Placa de sinalização', 'Segurança e Sinalização', 'Unidade', 'Item do catálogo inicial de materiais da categoria Segurança e Sinalização.', true, 0),
  ('SEG-003', 'Fita zebrada', 'Segurança e Sinalização', 'Unidade', 'Item do catálogo inicial de materiais da categoria Segurança e Sinalização.', true, 0),
  ('SEG-004', 'Cone de sinalização', 'Segurança e Sinalização', 'Unidade', 'Item do catálogo inicial de materiais da categoria Segurança e Sinalização.', true, 0),
  ('SEG-005', 'Lanterna', 'Segurança e Sinalização', 'Unidade', 'Item do catálogo inicial de materiais da categoria Segurança e Sinalização.', true, 0),
  ('SEG-006', 'Pilha', 'Segurança e Sinalização', 'Unidade', 'Item do catálogo inicial de materiais da categoria Segurança e Sinalização.', true, 0),
  ('SEG-007', 'Bateria', 'Segurança e Sinalização', 'Unidade', 'Item do catálogo inicial de materiais da categoria Segurança e Sinalização.', true, 0),
  ('SEG-008', 'Corrente plástica', 'Segurança e Sinalização', 'Metro', 'Item do catálogo inicial de materiais da categoria Segurança e Sinalização.', true, 0),
  ('SEG-009', 'Kit primeiros socorros', 'Segurança e Sinalização', 'Unidade', 'Item do catálogo inicial de materiais da categoria Segurança e Sinalização.', true, 0),
  ('SEG-010', 'Luva descartável', 'Segurança e Sinalização', 'Caixa', 'Item do catálogo inicial de materiais da categoria Segurança e Sinalização.', true, 0),
  ('SEG-011', 'Máscara descartável', 'Segurança e Sinalização', 'Caixa', 'Item do catálogo inicial de materiais da categoria Segurança e Sinalização.', true, 0),
  ('SEG-012', 'Álcool em gel', 'Segurança e Sinalização', 'Litro', 'Item do catálogo inicial de materiais da categoria Segurança e Sinalização.', true, 0),
  ('UNI-001', 'Camisa escolar', 'Uniformes e Identificação', 'Unidade', 'Item do catálogo inicial de materiais da categoria Uniformes e Identificação.', true, 0),
  ('UNI-002', 'Short escolar', 'Uniformes e Identificação', 'Unidade', 'Item do catálogo inicial de materiais da categoria Uniformes e Identificação.', true, 0),
  ('UNI-003', 'Calça escolar', 'Uniformes e Identificação', 'Unidade', 'Item do catálogo inicial de materiais da categoria Uniformes e Identificação.', true, 0),
  ('UNI-004', 'Fardamento completo', 'Uniformes e Identificação', 'Kit', 'Item do catálogo inicial de materiais da categoria Uniformes e Identificação.', true, 0),
  ('UNI-005', 'Crachá de identificação', 'Uniformes e Identificação', 'Unidade', 'Item do catálogo inicial de materiais da categoria Uniformes e Identificação.', true, 0),
  ('UNI-006', 'Cordão para crachá', 'Uniformes e Identificação', 'Unidade', 'Item do catálogo inicial de materiais da categoria Uniformes e Identificação.', true, 0),
  ('UNI-007', 'Colete de identificação', 'Uniformes e Identificação', 'Unidade', 'Item do catálogo inicial de materiais da categoria Uniformes e Identificação.', true, 0),
  ('UNI-008', 'Boné', 'Uniformes e Identificação', 'Unidade', 'Item do catálogo inicial de materiais da categoria Uniformes e Identificação.', true, 0);

-- Atualiza itens já existentes pelo código ou pelo mesmo nome sem código.
update public.materials m
set
  codigo = coalesce(nullif(btrim(m.codigo), ''), c.codigo),
  nome = c.nome,
  categoria = c.categoria,
  unidade = c.unidade,
  descricao = coalesce(nullif(btrim(m.descricao), ''), c.descricao),
  ativo = true,
  quantidade_minima = coalesce(m.quantidade_minima, c.quantidade_minima),
  updated_at = now()
from tmp_catalogo_materiais c
where
  m.codigo = c.codigo
  or (
    coalesce(btrim(m.codigo), '') = ''
    and lower(btrim(m.nome)) = lower(btrim(c.nome))
  );

-- Insere somente o que ainda não existe.
insert into public.materials
  (codigo, nome, categoria, unidade, descricao, ativo, quantidade_minima)
select
  c.codigo,
  c.nome,
  c.categoria,
  c.unidade,
  c.descricao,
  c.ativo,
  c.quantidade_minima
from tmp_catalogo_materiais c
where not exists (
  select 1
  from public.materials m
  where
    m.codigo = c.codigo
    or lower(btrim(m.nome)) = lower(btrim(c.nome))
);

commit;

-- Conferência rápida após executar:
select categoria, count(*) as total
from public.materials
where codigo similar to '(MOB|EXP|PED|INF|LIM|COP|MAN|ESP|SEG|UNI)-[0-9]{3}'
group by categoria
order by categoria;

-- ================================================================
-- MIGRAÇÃO 005 — PERMISSÃO DE EXCLUSÃO DE ESCOLAS
-- ================================================================
-- Versão 4.3 — reforço da permissão para exclusão segura de escolas.
-- Execute somente se a política de exclusão não existir ou se o Supabase bloquear a ação pela tela.

alter table public.schools enable row level security;

grant select, insert, update, delete on table public.schools to authenticated;

drop policy if exists schools_delete_sme_admin on public.schools;

create policy schools_delete_sme_admin
on public.schools for delete to authenticated
using (public.is_sme_admin(auth.uid()));

-- ================================================================
-- MIGRAÇÃO 008 — LOGO DEFINITIVA
-- ================================================================
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


-- ============================================================================
-- MIGRAÇÃO 009 — SUPRIR EDUCAÇÃO V5.0
-- Separação real de responsabilidades: administração, análise/autorização,
-- almoxarifado, entrega e escola.
-- Execute em bancos que já utilizam a V4.8.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Novos níveis de acesso e migração dos perfis legados
-- ----------------------------------------------------------------------------

alter table public.profiles drop constraint if exists profiles_permission_level_check;

update public.profiles
set permission_level = case permission_level
  when 'sme_admin' then 'system_admin'
  when 'sme_manager' then 'sme_authorizer'
  when 'sme_operator' then 'warehouse_operator'
  else permission_level
end
where permission_level in ('sme_admin', 'sme_manager', 'sme_operator');

alter table public.profiles
  add constraint profiles_permission_level_check
  check (permission_level in (
    'school_user',
    'sme_authorizer',
    'warehouse_operator',
    'delivery_agent',
    'system_admin'
  ));

alter table public.profiles alter column permission_level set default 'school_user';

-- ----------------------------------------------------------------------------
-- 2. Vinculação nominal do entregador à remessa
-- ----------------------------------------------------------------------------

alter table public.deliveries
  add column if not exists assigned_delivery_user_id uuid references auth.users(id) on delete set null;
alter table public.deliveries
  add column if not exists assigned_delivery_user_name text;
alter table public.deliveries
  add column if not exists assigned_delivery_user_email text;

create index if not exists deliveries_assigned_delivery_user_idx
  on public.deliveries (assigned_delivery_user_id, status, created_at desc);

-- ----------------------------------------------------------------------------
-- 3. Criação automática de perfis compatível com os novos papéis
-- ----------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account_type text;
  v_permission_level text;
  v_school_id uuid;
  v_active boolean;
begin
  v_account_type := coalesce(new.raw_user_meta_data ->> 'account_type', 'school');
  v_permission_level := coalesce(
    new.raw_user_meta_data ->> 'permission_level',
    case when v_account_type = 'sme' then 'sme_authorizer' else 'school_user' end
  );

  if v_permission_level = 'sme_admin' then v_permission_level := 'system_admin'; end if;
  if v_permission_level = 'sme_manager' then v_permission_level := 'sme_authorizer'; end if;
  if v_permission_level = 'sme_operator' then v_permission_level := 'warehouse_operator'; end if;

  v_active := lower(coalesce(new.raw_user_meta_data ->> 'provisioned_by_sme', 'false')) = 'true';

  begin
    v_school_id := nullif(new.raw_user_meta_data ->> 'school_id', '')::uuid;
  exception when others then
    v_school_id := null;
  end;

  insert into public.profiles (
    id, email, full_name, account_type, permission_level, school_id,
    active, must_change_password
  ) values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', new.email),
    v_account_type,
    v_permission_level,
    v_school_id,
    v_active,
    lower(coalesce(new.raw_user_meta_data ->> 'must_change_password', 'false')) = 'true'
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = coalesce(public.profiles.full_name, excluded.full_name),
    updated_at = now();

  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- 4. Helpers de autorização centralizados
-- ----------------------------------------------------------------------------

create or replace function public.is_system_admin(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = p_user_id
      and p.active = true
      and p.account_type = 'sme'
      and p.permission_level = 'system_admin'
  );
$$;

create or replace function public.can_authorize_requests(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = p_user_id
      and p.active = true
      and p.account_type = 'sme'
      and p.permission_level in ('sme_authorizer', 'system_admin')
  );
$$;

create or replace function public.can_operate_warehouse(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = p_user_id
      and p.active = true
      and p.account_type = 'sme'
      and p.permission_level in ('warehouse_operator', 'system_admin')
  );
$$;

create or replace function public.can_register_delivery(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = p_user_id
      and p.active = true
      and p.account_type = 'sme'
      and p.permission_level in ('delivery_agent', 'system_admin')
  );
$$;

create or replace function public.can_view_network_operations(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = p_user_id
      and p.active = true
      and p.account_type = 'sme'
      and p.permission_level in ('sme_authorizer', 'warehouse_operator', 'system_admin')
  );
$$;

-- Compatibilidade com nomes usados nas versões anteriores.
create or replace function public.is_sme_manager(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_authorize_requests(p_user_id);
$$;

create or replace function public.is_sme_admin(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_system_admin(p_user_id);
$$;

create or replace function public.is_admin(user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_system_admin(user_id);
$$;

-- Lista mínima usada pelo almoxarifado para atribuir uma remessa.
create or replace function public.list_delivery_agents()
returns table (
  id uuid,
  full_name text,
  email text,
  "position" text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.can_operate_warehouse(auth.uid()) then
    raise exception 'Somente o almoxarifado ou o administrador pode consultar a equipe de entrega.';
  end if;

  return query
  select p.id, p.full_name, p.email, p.position
  from public.profiles p
  where p.active = true
    and p.account_type = 'sme'
    and p.permission_level = 'delivery_agent'
  order by p.full_name nulls last, p.email;
end;
$$;

-- ----------------------------------------------------------------------------
-- 5. Etapa SME: receber, analisar, autorizar ou rejeitar
-- ----------------------------------------------------------------------------

create or replace function public.receive_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.requests%rowtype;
  v_profile public.profiles%rowtype;
begin
  if not public.can_authorize_requests(auth.uid()) then
    raise exception 'Seu perfil não possui permissão para receber pedidos para análise.';
  end if;

  select * into v_profile from public.profiles where id = auth.uid();
  select * into v_request from public.requests where id = p_request_id for update;

  if v_request.id is null then raise exception 'Pedido não encontrado.'; end if;
  if v_request.status <> 'submitted' then raise exception 'Este pedido não está aguardando recebimento.'; end if;

  update public.requests set
    status = 'under_review',
    received_by = auth.uid(),
    received_by_name = v_profile.full_name,
    received_by_email = v_profile.email,
    received_at = now()
  where id = p_request_id;

  perform public.log_request_event(
    p_request_id, 'request_received', 'submitted', 'under_review',
    'Pedido recebido pela SME para análise e autorização.'
  );
end;
$$;

create or replace function public.authorize_request(
  p_request_id uuid,
  p_items jsonb,
  p_authorization_notes text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.requests%rowtype;
  v_profile public.profiles%rowtype;
  v_item record;
  v_request_item public.request_items%rowtype;
  v_positive_count integer := 0;
  v_old_status text;
begin
  if not public.can_authorize_requests(auth.uid()) then
    raise exception 'Seu perfil não possui permissão para autorizar pedidos.';
  end if;

  select * into v_profile from public.profiles where id = auth.uid();
  select * into v_request from public.requests where id = p_request_id for update;

  if v_request.id is null then raise exception 'Pedido não encontrado.'; end if;
  if v_request.status not in ('submitted', 'under_review') then
    raise exception 'O pedido não está disponível para autorização.';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Informe as quantidades autorizadas.';
  end if;

  v_old_status := v_request.status;

  update public.request_items
  set approved_quantity = 0, sme_notes = null
  where request_id = p_request_id;

  for v_item in
    select * from jsonb_to_recordset(p_items)
      as x(request_item_id uuid, approved_quantity numeric, notes text)
  loop
    select * into v_request_item
    from public.request_items
    where id = v_item.request_item_id and request_id = p_request_id
    for update;

    if v_request_item.id is null then
      raise exception 'Um dos itens informados não pertence ao pedido.';
    end if;
    if v_item.approved_quantity is null or v_item.approved_quantity < 0
       or v_item.approved_quantity > v_request_item.requested_quantity then
      raise exception 'Quantidade autorizada inválida para o material %.', v_request_item.material_name_snapshot;
    end if;

    update public.request_items set
      approved_quantity = v_item.approved_quantity,
      sme_notes = nullif(btrim(v_item.notes), '')
    where id = v_request_item.id;
  end loop;

  select count(*) into v_positive_count
  from public.request_items
  where request_id = p_request_id and approved_quantity > 0;

  if v_positive_count = 0 then
    raise exception 'Autorize ao menos um item ou rejeite o pedido.';
  end if;

  update public.requests set
    status = 'approved',
    received_by = coalesce(received_by, auth.uid()),
    received_by_name = coalesce(received_by_name, v_profile.full_name),
    received_by_email = coalesce(received_by_email, v_profile.email),
    received_at = coalesce(received_at, now()),
    authorized_by = auth.uid(),
    authorized_by_name = v_profile.full_name,
    authorized_by_email = v_profile.email,
    authorized_at = now(),
    authorization_notes = nullif(btrim(p_authorization_notes), ''),
    rejected_by = null,
    rejected_by_name = null,
    rejected_at = null,
    rejection_reason = null
  where id = p_request_id;

  perform public.log_request_event(
    p_request_id, 'request_authorized', v_old_status, 'approved',
    'Pedido autorizado pela SME e liberado para o almoxarifado.'
  );
end;
$$;

create or replace function public.reject_request(
  p_request_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.requests%rowtype;
  v_profile public.profiles%rowtype;
begin
  if not public.can_authorize_requests(auth.uid()) then
    raise exception 'Seu perfil não possui permissão para rejeitar pedidos.';
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'Informe o motivo da rejeição.';
  end if;

  select * into v_profile from public.profiles where id = auth.uid();
  select * into v_request from public.requests where id = p_request_id for update;

  if v_request.id is null then raise exception 'Pedido não encontrado.'; end if;
  if v_request.status not in ('submitted', 'under_review') then
    raise exception 'O pedido não está disponível para rejeição.';
  end if;

  update public.requests set
    status = 'rejected',
    rejected_by = auth.uid(),
    rejected_by_name = v_profile.full_name,
    rejected_at = now(),
    rejection_reason = btrim(p_reason)
  where id = p_request_id;

  perform public.log_request_event(
    p_request_id, 'request_rejected', v_request.status, 'rejected',
    'Pedido rejeitado pela SME: ' || btrim(p_reason)
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- 6. Etapa almoxarifado: separar e expedir
-- ----------------------------------------------------------------------------

create or replace function public.start_request_preparation(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.requests%rowtype;
begin
  if not public.can_operate_warehouse(auth.uid()) then
    raise exception 'Seu perfil não possui permissão para iniciar a separação.';
  end if;

  select * into v_request from public.requests where id = p_request_id for update;
  if v_request.id is null then raise exception 'Pedido não encontrado.'; end if;
  if v_request.status not in ('approved', 'partially_delivered') then
    raise exception 'O pedido não está disponível para separação.';
  end if;

  update public.requests set status = 'preparing' where id = p_request_id;

  perform public.log_request_event(
    p_request_id, 'preparation_started', v_request.status, 'preparing',
    'O almoxarifado iniciou a separação dos materiais autorizados.'
  );
end;
$$;

-- Remove a assinatura antiga, que recebia o nome do entregador como texto livre.
drop function if exists public.register_dispatch(uuid, date, text, text, text, text, jsonb);

create or replace function public.register_dispatch(
  p_request_id uuid,
  p_dispatch_date date,
  p_document_number text,
  p_delivery_user_id uuid,
  p_observations text,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.requests%rowtype;
  v_profile public.profiles%rowtype;
  v_delivery_profile public.profiles%rowtype;
  v_delivery_id uuid;
  v_item record;
  v_request_item public.request_items%rowtype;
  v_already_dispatched numeric;
  v_item_count integer := 0;
begin
  if not public.can_operate_warehouse(auth.uid()) then
    raise exception 'Seu perfil não possui permissão para registrar remessas.';
  end if;

  if p_dispatch_date is null then raise exception 'Informe a data da saída.'; end if;
  if p_dispatch_date > current_date then raise exception 'A data da saída não pode estar no futuro.'; end if;
  if p_delivery_user_id is null then raise exception 'Selecione o responsável pela entrega.'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Adicione ao menos um item à remessa.';
  end if;

  select * into v_profile from public.profiles where id = auth.uid();
  select * into v_delivery_profile
  from public.profiles
  where id = p_delivery_user_id
    and active = true
    and account_type = 'sme'
    and permission_level = 'delivery_agent';

  if v_delivery_profile.id is null then
    raise exception 'O usuário selecionado não possui um perfil ativo de Entrega.';
  end if;

  select * into v_request from public.requests where id = p_request_id for update;
  if v_request.id is null then raise exception 'Pedido não encontrado.'; end if;
  if v_request.status not in ('approved', 'preparing', 'partially_delivered') then
    raise exception 'O pedido não está disponível para expedição.';
  end if;

  insert into public.deliveries (
    request_id, school_id, status, dispatch_date, delivery_date,
    document_number, delivered_by_name, delivered_by_department,
    assigned_delivery_user_id, assigned_delivery_user_name, assigned_delivery_user_email,
    observations, registered_by, registered_by_email, registered_by_name
  ) values (
    p_request_id, v_request.school_id, 'dispatched', p_dispatch_date, p_dispatch_date,
    nullif(btrim(p_document_number), ''),
    coalesce(v_delivery_profile.full_name, v_delivery_profile.email),
    coalesce(nullif(btrim(v_delivery_profile.position), ''), 'Equipe de entrega'),
    v_delivery_profile.id, v_delivery_profile.full_name, v_delivery_profile.email,
    nullif(btrim(p_observations), ''),
    auth.uid(), v_profile.email, v_profile.full_name
  ) returning id into v_delivery_id;

  for v_item in
    select * from jsonb_to_recordset(p_items)
      as x(request_item_id uuid, quantity numeric, notes text)
  loop
    select * into v_request_item
    from public.request_items
    where id = v_item.request_item_id and request_id = p_request_id
    for update;

    if v_request_item.id is null then raise exception 'Um dos itens não pertence ao pedido.'; end if;
    if v_item.quantity is null or v_item.quantity <= 0 then raise exception 'Quantidade de remessa inválida.'; end if;

    select coalesce(sum(di.quantity), 0)
    into v_already_dispatched
    from public.delivery_items di
    join public.deliveries d on d.id = di.delivery_id
    where di.request_item_id = v_request_item.id
      and d.status in ('dispatched', 'delivered');

    if v_item.quantity > (v_request_item.approved_quantity - v_already_dispatched) then
      raise exception 'A quantidade do material % ultrapassa o saldo autorizado.', v_request_item.material_name_snapshot;
    end if;

    insert into public.delivery_items (
      delivery_id, request_item_id, material_id, quantity,
      unit_snapshot, material_name_snapshot, notes
    ) values (
      v_delivery_id, v_request_item.id, v_request_item.material_id, v_item.quantity,
      v_request_item.unit_snapshot, v_request_item.material_name_snapshot,
      nullif(btrim(v_item.notes), '')
    );
    v_item_count := v_item_count + 1;
  end loop;

  if v_item_count = 0 then raise exception 'Nenhum item válido foi informado.'; end if;

  update public.requests set status = 'dispatched' where id = p_request_id;

  perform public.log_request_event(
    p_request_id, 'delivery_dispatched', v_request.status, 'dispatched',
    'Remessa expedida pelo almoxarifado e atribuída a ' || coalesce(v_delivery_profile.full_name, v_delivery_profile.email) || '.',
    v_delivery_id,
    jsonb_build_object(
      'document_number', p_document_number,
      'dispatch_date', p_dispatch_date,
      'delivery_user_id', v_delivery_profile.id,
      'delivery_user_name', v_delivery_profile.full_name
    )
  );

  return v_delivery_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 7. Etapa entrega: confirmar o recebimento no destino
-- ----------------------------------------------------------------------------

create or replace function public.register_delivery_receipt(
  p_delivery_id uuid,
  p_receipt_date date,
  p_received_by_name text,
  p_received_by_position text,
  p_received_by_document text,
  p_receipt_notes text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_delivery public.deliveries%rowtype;
  v_request public.requests%rowtype;
  v_profile public.profiles%rowtype;
  v_total_approved numeric;
  v_total_delivered numeric;
  v_open_dispatches integer;
  v_new_status text;
begin
  if not public.can_register_delivery(auth.uid()) then
    raise exception 'Seu perfil não possui permissão para confirmar entregas.';
  end if;
  if p_receipt_date is null then raise exception 'Informe a data do recebimento.'; end if;
  if nullif(btrim(coalesce(p_received_by_name, '')), '') is null then
    raise exception 'Informe quem recebeu na escola.';
  end if;

  select * into v_profile from public.profiles where id = auth.uid();
  select * into v_delivery from public.deliveries where id = p_delivery_id for update;

  if v_delivery.id is null or v_delivery.request_id is null then raise exception 'Remessa não encontrada.'; end if;
  if v_delivery.status <> 'dispatched' then raise exception 'Esta remessa já foi recebida ou cancelada.'; end if;
  if not public.is_system_admin(auth.uid())
     and v_delivery.assigned_delivery_user_id is distinct from auth.uid() then
    raise exception 'Esta remessa está atribuída a outro responsável pela entrega.';
  end if;
  if p_receipt_date > current_date then raise exception 'A data do recebimento não pode estar no futuro.'; end if;
  if p_receipt_date < coalesce(v_delivery.dispatch_date, v_delivery.delivery_date) then
    raise exception 'A data do recebimento não pode ser anterior à saída da remessa.';
  end if;

  select * into v_request from public.requests where id = v_delivery.request_id for update;

  update public.deliveries set
    status = 'delivered',
    receipt_date = p_receipt_date,
    delivery_date = p_receipt_date,
    received_by_name = btrim(p_received_by_name),
    received_by_position = nullif(btrim(p_received_by_position), ''),
    received_by_document = nullif(btrim(p_received_by_document), ''),
    receipt_notes = nullif(btrim(p_receipt_notes), ''),
    receipt_registered_by = auth.uid(),
    receipt_registered_by_name = v_profile.full_name,
    receipt_registered_by_email = v_profile.email
  where id = p_delivery_id;

  select coalesce(sum(approved_quantity), 0)
  into v_total_approved
  from public.request_items
  where request_id = v_delivery.request_id;

  select coalesce(sum(di.quantity), 0)
  into v_total_delivered
  from public.delivery_items di
  join public.deliveries d on d.id = di.delivery_id
  where d.request_id = v_delivery.request_id
    and d.status = 'delivered';

  select count(*) into v_open_dispatches
  from public.deliveries d
  where d.request_id = v_delivery.request_id
    and d.status = 'dispatched';

  v_new_status := case
    when v_total_delivered >= v_total_approved and v_total_approved > 0 then 'delivered'
    when v_open_dispatches > 0 then 'dispatched'
    else 'partially_delivered'
  end;

  update public.requests set status = v_new_status where id = v_delivery.request_id;

  perform public.log_request_event(
    v_delivery.request_id,
    'delivery_received',
    v_request.status,
    v_new_status,
    'Entrega confirmada no destino. Recebedor na escola: ' || btrim(p_received_by_name) || '.',
    p_delivery_id,
    jsonb_build_object('receipt_date', p_receipt_date, 'received_by', p_received_by_name)
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- 8. Cancelamento e administração de usuários
-- ----------------------------------------------------------------------------

create or replace function public.cancel_request(
  p_request_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.requests%rowtype;
  v_profile public.profiles%rowtype;
  v_allowed boolean := false;
begin
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'Informe o motivo do cancelamento.';
  end if;

  select * into v_profile from public.profiles where id = auth.uid();
  select * into v_request from public.requests where id = p_request_id for update;
  if v_request.id is null then raise exception 'Pedido não encontrado.'; end if;

  if v_profile.account_type = 'school'
     and v_profile.active
     and v_profile.school_id = v_request.school_id
     and v_request.status in ('draft', 'submitted') then
    v_allowed := true;
  end if;

  if public.can_authorize_requests(auth.uid())
     and v_request.status in ('submitted', 'under_review', 'approved') then
    v_allowed := true;
  end if;

  if public.is_system_admin(auth.uid())
     and v_request.status in ('draft', 'submitted', 'under_review', 'approved', 'preparing') then
    v_allowed := true;
  end if;

  if not v_allowed then
    raise exception 'Você não tem permissão para cancelar este pedido neste estágio.';
  end if;

  update public.requests set
    status = 'cancelled',
    cancelled_by = auth.uid(),
    cancelled_by_name = v_profile.full_name,
    cancelled_at = now(),
    cancellation_reason = btrim(p_reason)
  where id = p_request_id;

  perform public.log_request_event(
    p_request_id, 'request_cancelled', v_request.status, 'cancelled',
    'Pedido cancelado: ' || btrim(p_reason)
  );
end;
$$;

create or replace function public.admin_update_profile(
  p_profile_id uuid,
  p_full_name text,
  p_account_type text,
  p_permission_level text,
  p_school_id uuid,
  p_active boolean,
  p_position text,
  p_phone text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_system_admin(auth.uid()) then
    raise exception 'Somente o administrador do sistema pode alterar usuários.';
  end if;

  if p_account_type not in ('school', 'sme') then raise exception 'Tipo de conta inválido.'; end if;

  if p_profile_id = auth.uid()
     and (coalesce(p_active, true) = false or p_account_type <> 'sme' or p_permission_level <> 'system_admin') then
    raise exception 'O administrador não pode desativar ou remover a própria permissão administrativa.';
  end if;

  if p_account_type = 'school' then
    if p_permission_level <> 'school_user' or p_school_id is null then
      raise exception 'Usuários de escola precisam estar vinculados a uma escola.';
    end if;
  else
    if p_permission_level not in ('sme_authorizer', 'warehouse_operator', 'delivery_agent', 'system_admin') then
      raise exception 'Nível de acesso interno inválido.';
    end if;
  end if;

  update public.profiles set
    full_name = nullif(btrim(p_full_name), ''),
    account_type = p_account_type,
    permission_level = p_permission_level,
    school_id = case when p_account_type = 'school' then p_school_id else null end,
    active = coalesce(p_active, true),
    position = nullif(btrim(p_position), ''),
    phone = nullif(btrim(p_phone), '')
  where id = p_profile_id;

  if not found then raise exception 'Usuário não encontrado.'; end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- 9. RLS por responsabilidade
-- ----------------------------------------------------------------------------

drop policy if exists profiles_select_scoped on public.profiles;
create policy profiles_select_scoped
on public.profiles for select to authenticated
using (id = auth.uid() or public.is_system_admin(auth.uid()));

drop policy if exists schools_select_scoped on public.schools;
create policy schools_select_scoped
on public.schools for select to authenticated
using (
  id = public.current_school_id(auth.uid())
  or public.can_view_network_operations(auth.uid())
  or exists (
    select 1 from public.deliveries d
    where d.school_id = schools.id
      and d.assigned_delivery_user_id = auth.uid()
  )
);

drop policy if exists schools_insert_sme_manager on public.schools;
drop policy if exists schools_update_sme_manager on public.schools;
drop policy if exists schools_delete_sme_admin on public.schools;
drop policy if exists schools_insert_system_admin on public.schools;
drop policy if exists schools_update_system_admin on public.schools;
drop policy if exists schools_delete_system_admin on public.schools;
create policy schools_insert_system_admin
on public.schools for insert to authenticated
with check (public.is_system_admin(auth.uid()));
create policy schools_update_system_admin
on public.schools for update to authenticated
using (public.is_system_admin(auth.uid()))
with check (public.is_system_admin(auth.uid()));
create policy schools_delete_system_admin
on public.schools for delete to authenticated
using (public.is_system_admin(auth.uid()));

drop policy if exists materials_select_active_users on public.materials;
drop policy if exists materials_select_scoped_v5 on public.materials;
create policy materials_select_scoped_v5
on public.materials for select to authenticated
using (
  public.is_active_user(auth.uid())
  and (
    public.current_school_id(auth.uid()) is not null
    or public.can_view_network_operations(auth.uid())
  )
);

drop policy if exists materials_insert_sme_manager on public.materials;
drop policy if exists materials_update_sme_manager on public.materials;
drop policy if exists materials_delete_sme_admin on public.materials;
drop policy if exists materials_insert_system_admin on public.materials;
drop policy if exists materials_update_system_admin on public.materials;
drop policy if exists materials_delete_system_admin on public.materials;
create policy materials_insert_system_admin
on public.materials for insert to authenticated
with check (public.is_system_admin(auth.uid()));
create policy materials_update_system_admin
on public.materials for update to authenticated
using (public.is_system_admin(auth.uid()))
with check (public.is_system_admin(auth.uid()));
create policy materials_delete_system_admin
on public.materials for delete to authenticated
using (public.is_system_admin(auth.uid()));

drop policy if exists settings_update_admin on public.system_settings;
drop policy if exists settings_update_system_admin on public.system_settings;
create policy settings_update_system_admin
on public.system_settings for update to authenticated
using (public.is_system_admin(auth.uid()))
with check (public.is_system_admin(auth.uid()));

drop policy if exists requests_select_scoped on public.requests;
drop policy if exists requests_select_scoped_v5 on public.requests;
create policy requests_select_scoped_v5
on public.requests for select to authenticated
using (
  school_id = public.current_school_id(auth.uid())
  or public.can_view_network_operations(auth.uid())
  or exists (
    select 1 from public.deliveries d
    where d.request_id = requests.id
      and d.assigned_delivery_user_id = auth.uid()
  )
);

drop policy if exists request_items_select_scoped on public.request_items;
drop policy if exists request_items_select_scoped_v5 on public.request_items;
create policy request_items_select_scoped_v5
on public.request_items for select to authenticated
using (
  exists (
    select 1 from public.requests r
    where r.id = request_items.request_id
      and (
        r.school_id = public.current_school_id(auth.uid())
        or public.can_view_network_operations(auth.uid())
        or exists (
          select 1 from public.deliveries d
          where d.request_id = r.id and d.assigned_delivery_user_id = auth.uid()
        )
      )
  )
);

drop policy if exists deliveries_select_scoped on public.deliveries;
drop policy if exists deliveries_select_scoped_v5 on public.deliveries;
create policy deliveries_select_scoped_v5
on public.deliveries for select to authenticated
using (
  school_id = public.current_school_id(auth.uid())
  or public.can_view_network_operations(auth.uid())
  or assigned_delivery_user_id = auth.uid()
);

drop policy if exists delivery_items_select_scoped on public.delivery_items;
drop policy if exists delivery_items_select_scoped_v5 on public.delivery_items;
create policy delivery_items_select_scoped_v5
on public.delivery_items for select to authenticated
using (
  exists (
    select 1 from public.deliveries d
    where d.id = delivery_items.delivery_id
      and (
        d.school_id = public.current_school_id(auth.uid())
        or public.can_view_network_operations(auth.uid())
        or d.assigned_delivery_user_id = auth.uid()
      )
  )
);

drop policy if exists request_events_select_scoped on public.request_events;
drop policy if exists request_events_select_scoped_v5 on public.request_events;
create policy request_events_select_scoped_v5
on public.request_events for select to authenticated
using (
  exists (
    select 1 from public.requests r
    where r.id = request_events.request_id
      and (
        r.school_id = public.current_school_id(auth.uid())
        or public.can_view_network_operations(auth.uid())
        or exists (
          select 1 from public.deliveries d
          where d.request_id = r.id and d.assigned_delivery_user_id = auth.uid()
        )
      )
  )
);

-- ----------------------------------------------------------------------------
-- 10. Grants das novas funções
-- ----------------------------------------------------------------------------

revoke all on function public.is_system_admin(uuid) from public, anon, authenticated;
revoke all on function public.can_authorize_requests(uuid) from public, anon, authenticated;
revoke all on function public.can_operate_warehouse(uuid) from public, anon, authenticated;
revoke all on function public.can_register_delivery(uuid) from public, anon, authenticated;
revoke all on function public.can_view_network_operations(uuid) from public, anon, authenticated;
revoke all on function public.list_delivery_agents() from public, anon, authenticated;
revoke all on function public.register_dispatch(uuid, date, text, uuid, text, jsonb) from public, anon, authenticated;

revoke all on function public.receive_request(uuid) from public, anon, authenticated;
revoke all on function public.authorize_request(uuid, jsonb, text) from public, anon, authenticated;
revoke all on function public.reject_request(uuid, text) from public, anon, authenticated;
revoke all on function public.start_request_preparation(uuid) from public, anon, authenticated;
revoke all on function public.register_delivery_receipt(uuid, date, text, text, text, text) from public, anon, authenticated;
revoke all on function public.cancel_request(uuid, text) from public, anon, authenticated;
revoke all on function public.admin_update_profile(uuid, text, text, text, uuid, boolean, text, text) from public, anon, authenticated;

grant execute on function public.is_system_admin(uuid) to authenticated;
grant execute on function public.can_authorize_requests(uuid) to authenticated;
grant execute on function public.can_operate_warehouse(uuid) to authenticated;
grant execute on function public.can_register_delivery(uuid) to authenticated;
grant execute on function public.can_view_network_operations(uuid) to authenticated;
grant execute on function public.list_delivery_agents() to authenticated;

grant execute on function public.receive_request(uuid) to authenticated;
grant execute on function public.authorize_request(uuid, jsonb, text) to authenticated;
grant execute on function public.reject_request(uuid, text) to authenticated;
grant execute on function public.start_request_preparation(uuid) to authenticated;
grant execute on function public.register_dispatch(uuid, date, text, uuid, text, jsonb) to authenticated;
grant execute on function public.register_delivery_receipt(uuid, date, text, text, text, text) to authenticated;
grant execute on function public.cancel_request(uuid, text) to authenticated;
grant execute on function public.admin_update_profile(uuid, text, text, text, uuid, boolean, text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 11. Identidade do produto
-- ----------------------------------------------------------------------------

alter table public.system_settings
  alter column report_title set default 'SUPRIR Educação — Gestão de Pedidos e Distribuição de Materiais';

update public.system_settings
set report_title = 'SUPRIR Educação — Gestão de Pedidos e Distribuição de Materiais',
    updated_at = now()
where id = 1
  and (report_title is null or report_title in (
    'Sistema Integrado de Pedidos e Entrega de Materiais',
    'Sistema de Pedidos e Entrega de Materiais'
  ));

commit;

-- PRIMEIRO ADMINISTRADOR V5 (somente se necessário):
-- update public.profiles
-- set account_type = 'sme', permission_level = 'system_admin', school_id = null,
--     active = true, must_change_password = false
-- where email = 'seu-email@municipio.gov.br';
