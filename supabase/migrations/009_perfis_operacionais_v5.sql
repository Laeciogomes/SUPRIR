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
