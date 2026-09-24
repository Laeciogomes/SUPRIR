-- ============================================================================
-- MIGRAÇÃO 010 — SUPRIR EDUCAÇÃO V5.1
-- Simplifica o fluxo operacional:
-- SME autoriza -> Almoxarifado expede -> Escola confirma o recebimento.
-- Remove o perfil operacional de Entrega e a atribuição nominal de entregador.
-- Execute após a migração 009 em bases V5.0.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Perfis: deixa de existir o papel delivery_agent
-- ----------------------------------------------------------------------------

-- Se a V5.0 chegou a ser usada com contas de entrega, elas são desativadas por
-- segurança e convertidas para um papel válido. O administrador pode reativá-las
-- posteriormente caso a pessoa também exerça atividade no almoxarifado.
update public.profiles
set permission_level = 'warehouse_operator',
    active = false,
    updated_at = now()
where permission_level = 'delivery_agent';

alter table public.profiles drop constraint if exists profiles_permission_level_check;
alter table public.profiles
  add constraint profiles_permission_level_check
  check (permission_level in (
    'school_user',
    'sme_authorizer',
    'warehouse_operator',
    'system_admin'
  ));

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
  if v_permission_level in ('sme_operator', 'delivery_agent') then v_permission_level := 'warehouse_operator'; end if;

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
-- 2. Remove as RPCs específicas do antigo entregador
-- ----------------------------------------------------------------------------

drop function if exists public.register_delivery_receipt(uuid, date, text, text, text, text);
drop function if exists public.list_delivery_agents();
drop function if exists public.can_register_delivery(uuid);

-- Assinaturas antigas de expedição, inclusive a da V5.0.
drop function if exists public.register_dispatch(uuid, date, text, uuid, text, jsonb);
drop function if exists public.register_dispatch(uuid, date, text, text, text, text, jsonb);

-- ----------------------------------------------------------------------------
-- 3. Expedição: o próprio usuário do almoxarifado fica responsável pela saída
-- ----------------------------------------------------------------------------

create or replace function public.register_dispatch(
  p_request_id uuid,
  p_dispatch_date date,
  p_document_number text,
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
  if not public.can_operate_warehouse(auth.uid()) then
    raise exception 'Seu perfil não possui permissão para registrar remessas.';
  end if;

  if p_dispatch_date is null then raise exception 'Informe a data da saída.'; end if;
  if p_dispatch_date > current_date then raise exception 'A data da saída não pode estar no futuro.'; end if;
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
    nullif(btrim(p_document_number), ''),
    coalesce(v_profile.full_name, v_profile.email, 'Almoxarifado'),
    coalesce(nullif(btrim(v_profile.position), ''), 'Almoxarifado'),
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
    p_request_id,
    'delivery_dispatched',
    v_request.status,
    'dispatched',
    'Remessa expedida pelo almoxarifado. A escola deverá confirmar o recebimento no sistema.',
    v_delivery_id,
    jsonb_build_object(
      'document_number', p_document_number,
      'dispatch_date', p_dispatch_date,
      'expedited_by', v_profile.full_name
    )
  );

  return v_delivery_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 4. A escola passa a registrar o recebimento e confirmar em uma única ação
-- ----------------------------------------------------------------------------

drop function if exists public.confirm_delivery_by_school(uuid, text);

create or replace function public.confirm_delivery_by_school(
  p_delivery_id uuid,
  p_receipt_date date,
  p_notes text
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
  select * into v_profile from public.profiles where id = auth.uid();

  if v_profile.id is null or not v_profile.active or v_profile.account_type <> 'school' or v_profile.school_id is null then
    raise exception 'Apenas usuários vinculados à escola podem confirmar o recebimento.';
  end if;

  if p_receipt_date is null then raise exception 'Informe a data do recebimento.'; end if;
  if p_receipt_date > current_date then raise exception 'A data do recebimento não pode estar no futuro.'; end if;

  select * into v_delivery from public.deliveries where id = p_delivery_id for update;

  if v_delivery.id is null or v_delivery.school_id <> v_profile.school_id then
    raise exception 'Remessa não encontrada para esta escola.';
  end if;
  if v_delivery.status not in ('dispatched', 'delivered') then
    raise exception 'Esta remessa não está disponível para confirmação.';
  end if;
  if v_delivery.school_confirmed_at is not null then
    raise exception 'Esta remessa já foi confirmada pela escola.';
  end if;
  if p_receipt_date < coalesce(v_delivery.dispatch_date, v_delivery.delivery_date) then
    raise exception 'A data do recebimento não pode ser anterior à saída da remessa.';
  end if;

  select * into v_request from public.requests where id = v_delivery.request_id for update;

  update public.deliveries set
    status = 'delivered',
    receipt_date = case when v_delivery.status = 'dispatched' then p_receipt_date else coalesce(receipt_date, p_receipt_date) end,
    delivery_date = case when v_delivery.status = 'dispatched' then p_receipt_date else coalesce(delivery_date, p_receipt_date) end,
    received_by_name = coalesce(received_by_name, v_profile.full_name, 'Usuário da escola'),
    received_by_position = coalesce(received_by_position, nullif(btrim(v_profile.position), ''), 'Responsável da escola'),
    receipt_notes = coalesce(nullif(btrim(p_notes), ''), receipt_notes),
    receipt_registered_by = case when v_delivery.status = 'dispatched' then auth.uid() else receipt_registered_by end,
    receipt_registered_by_name = case when v_delivery.status = 'dispatched' then v_profile.full_name else receipt_registered_by_name end,
    receipt_registered_by_email = case when v_delivery.status = 'dispatched' then v_profile.email else receipt_registered_by_email end,
    school_confirmed_by = auth.uid(),
    school_confirmed_by_name = v_profile.full_name,
    school_confirmed_at = now(),
    school_confirmation_notes = nullif(btrim(p_notes), '')
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
    'delivery_confirmed_by_school',
    v_request.status,
    v_new_status,
    'A escola confirmou o recebimento da remessa no sistema.',
    p_delivery_id,
    jsonb_build_object(
      'receipt_date', p_receipt_date,
      'confirmed_by', v_profile.full_name,
      'notes', nullif(btrim(p_notes), '')
    )
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- 5. Administração de usuários: somente três papéis internos
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
    if p_permission_level not in ('sme_authorizer', 'warehouse_operator', 'system_admin') then
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
    phone = nullif(btrim(p_phone), ''),
    updated_at = now()
  where id = p_profile_id;

  if not found then raise exception 'Usuário não encontrado.'; end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- 6. RLS: rede interna vê a operação; escola vê apenas sua unidade
-- ----------------------------------------------------------------------------

drop policy if exists schools_select_scoped on public.schools;
create policy schools_select_scoped
on public.schools for select to authenticated
using (
  id = public.current_school_id(auth.uid())
  or public.can_view_network_operations(auth.uid())
);

drop policy if exists requests_select_scoped on public.requests;
drop policy if exists requests_select_scoped_v5 on public.requests;
create policy requests_select_scoped_v5
on public.requests for select to authenticated
using (
  school_id = public.current_school_id(auth.uid())
  or public.can_view_network_operations(auth.uid())
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
      )
  )
);

-- ----------------------------------------------------------------------------
-- 7. Limpeza dos campos de atribuição do entregador criados na V5.0
-- ----------------------------------------------------------------------------

drop index if exists public.deliveries_assigned_delivery_user_idx;
alter table public.deliveries drop column if exists assigned_delivery_user_id;
alter table public.deliveries drop column if exists assigned_delivery_user_name;
alter table public.deliveries drop column if exists assigned_delivery_user_email;

-- ----------------------------------------------------------------------------
-- 8. Permissões das RPCs atuais
-- ----------------------------------------------------------------------------

revoke all on function public.register_dispatch(uuid, date, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.confirm_delivery_by_school(uuid, date, text) from public, anon, authenticated;

grant execute on function public.register_dispatch(uuid, date, text, text, jsonb) to authenticated;
grant execute on function public.confirm_delivery_by_school(uuid, date, text) to authenticated;

commit;
