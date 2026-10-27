-- SUPRIR EDUCACAO 5.5.0 — Acertos de inventario e substituicao autorizada de materiais
-- Execute no Supabase SQL Editor somente apos a versao 5.4.1.
-- Transacional: se alguma etapa falhar, nada sera aplicado.
BEGIN;

-- O material originalmente solicitado nunca e sobrescrito. A SME escolhe
-- outro produto para a autorizacao; a expedicao baixa exatamente o autorizado.
ALTER TABLE public.request_items
  ADD COLUMN IF NOT EXISTS approved_material_id uuid REFERENCES public.materials(id) ON DELETE RESTRICT;
ALTER TABLE public.request_items
  ADD COLUMN IF NOT EXISTS approved_material_name_snapshot text;
ALTER TABLE public.request_items
  ADD COLUMN IF NOT EXISTS approved_unit_snapshot text;

CREATE INDEX IF NOT EXISTS request_items_approved_material_idx
  ON public.request_items(approved_material_id);

-- Preserva o comportamento dos pedidos autorizados antes desta migracao.
UPDATE public.request_items ri
SET approved_material_id = ri.material_id,
    approved_material_name_snapshot = ri.material_name_snapshot,
    approved_unit_snapshot = ri.unit_snapshot
WHERE ri.approved_quantity > 0
  AND ri.approved_material_id IS NULL;

-- Acerto de estoque e diferente de entrada normal ou expedicao de pedido.
ALTER TABLE public.inventory_movements
  DROP CONSTRAINT IF EXISTS inventory_movements_type_check;
ALTER TABLE public.inventory_movements
  ADD CONSTRAINT inventory_movements_type_check
  CHECK (movement_type IN ('entry', 'dispatch', 'adjustment_in', 'adjustment_out'));

-- Ajuste sob bloqueio de linha, com saldo anterior/novo e justificativa.
CREATE OR REPLACE FUNCTION public.adjust_stock_quantity(
  p_material_id uuid,
  p_new_quantity numeric,
  p_reason text,
  p_document_number text DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_material public.materials%ROWTYPE;
  v_profile public.profiles%ROWTYPE;
  v_before numeric(14,2);
  v_after numeric(14,2);
  v_delta numeric(14,2);
  v_id bigint;
BEGIN
  IF NOT public.can_operate_warehouse(auth.uid()) THEN
    RAISE EXCEPTION 'Somente Almoxarifado ou Administrador pode realizar acerto de inventario.';
  END IF;
  IF p_material_id IS NULL OR p_new_quantity IS NULL
     OR p_new_quantity < 0 OR p_new_quantity > 999999999999.99
     OR p_new_quantity <> round(p_new_quantity, 2) THEN
    RAISE EXCEPTION 'Informe o saldo fisico correto (maior ou igual a zero, ate duas casas decimais).';
  END IF;
  IF char_length(btrim(coalesce(p_reason, ''))) < 10 THEN
    RAISE EXCEPTION 'Informe uma justificativa de no minimo 10 caracteres para o acerto.';
  END IF;

  SELECT * INTO v_material FROM public.materials WHERE id = p_material_id FOR UPDATE;
  IF v_material.id IS NULL THEN RAISE EXCEPTION 'Material nao encontrado.'; END IF;
  SELECT * INTO v_profile FROM public.profiles WHERE id = auth.uid();
  v_before := coalesce(v_material.stock_quantity, 0);
  v_after := p_new_quantity;
  IF v_after = v_before THEN
    RAISE EXCEPTION 'O novo saldo e igual ao saldo atual. Nenhum acerto necessario.';
  END IF;
  v_delta := abs(v_after - v_before);

  UPDATE public.materials
     SET stock_quantity = v_after, stock_updated_at = now()
   WHERE id = p_material_id;

  INSERT INTO public.inventory_movements (
    material_id, movement_type, quantity, balance_before, balance_after,
    document_number, notes, actor_id, actor_name, actor_email
  ) VALUES (
    p_material_id,
    CASE WHEN v_after > v_before THEN 'adjustment_in' ELSE 'adjustment_out' END,
    v_delta, v_before, v_after,
    nullif(btrim(coalesce(p_document_number, '')), ''),
    'Acerto de inventario: ' || btrim(p_reason),
    auth.uid(), v_profile.full_name, v_profile.email
  ) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.adjust_stock_quantity(uuid,numeric,text,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.adjust_stock_quantity(uuid,numeric,text,text) TO authenticated;

-- Autorizacao: material solicitado imutavel; material efetivamente autorizado
-- pode ser trocado pela SME, desde que com a mesma unidade de medida e estoque.
CREATE OR REPLACE FUNCTION public.authorize_request(
  p_request_id uuid,
  p_items jsonb,
  p_authorization_notes text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_request public.requests%ROWTYPE;
  v_profile public.profiles%ROWTYPE;
  v_item RECORD;
  v_req_item public.request_items%ROWTYPE;
  v_target public.materials%ROWTYPE;
  v_summary RECORD;
  v_old_status text;
  v_substitutions jsonb := '[]'::jsonb;
BEGIN
  IF NOT public.can_authorize_requests(auth.uid()) THEN
    RAISE EXCEPTION 'Seu perfil nao possui permissao para autorizar pedidos.';
  END IF;
  SELECT * INTO v_profile FROM public.profiles WHERE id = auth.uid();
  SELECT * INTO v_request FROM public.requests WHERE id = p_request_id FOR UPDATE;
  IF v_request.id IS NULL THEN RAISE EXCEPTION 'Pedido nao encontrado.'; END IF;
  IF v_request.status NOT IN ('submitted', 'under_review') THEN
    RAISE EXCEPTION 'O pedido nao esta disponivel para autorizacao.';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'Informe os materiais e quantidades para autorizacao.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_items)
      AS x(request_item_id uuid) GROUP BY request_item_id HAVING count(*) > 1
  ) THEN RAISE EXCEPTION 'Um mesmo item foi informado mais de uma vez.'; END IF;

  v_old_status := v_request.status;
  UPDATE public.request_items
     SET approved_quantity = 0, sme_notes = NULL,
         approved_material_id = NULL, approved_material_name_snapshot = NULL,
         approved_unit_snapshot = NULL
   WHERE request_id = p_request_id;

  FOR v_item IN
    SELECT * FROM jsonb_to_recordset(p_items)
      AS x(request_item_id uuid, approved_quantity numeric, approved_material_id uuid, notes text)
  LOOP
    SELECT * INTO v_req_item FROM public.request_items
     WHERE id = v_item.request_item_id AND request_id = p_request_id FOR UPDATE;
    IF v_req_item.id IS NULL THEN
      RAISE EXCEPTION 'Um dos itens nao pertence ao pedido.';
    END IF;
    IF v_item.approved_quantity IS NULL OR v_item.approved_quantity < 0
       OR v_item.approved_quantity > v_req_item.requested_quantity
       OR v_item.approved_quantity <> round(v_item.approved_quantity, 2) THEN
      RAISE EXCEPTION 'Quantidade autorizada invalida para %.', v_req_item.material_name_snapshot;
    END IF;

    IF v_item.approved_quantity > 0 THEN
      SELECT * INTO v_target FROM public.materials
       WHERE id = coalesce(v_item.approved_material_id, v_req_item.material_id) FOR UPDATE;
      IF v_target.id IS NULL OR NOT v_target.ativo THEN
        RAISE EXCEPTION 'O material autorizado nao existe ou esta inativo.';
      END IF;
      IF lower(btrim(v_target.unidade)) <> lower(btrim(v_req_item.unit_snapshot)) THEN
        RAISE EXCEPTION 'A substituicao exige a mesma unidade de medida (%, solicitado: %).',
          v_target.unidade, v_req_item.unit_snapshot;
      END IF;
      IF v_target.id <> v_req_item.material_id THEN
        IF char_length(btrim(coalesce(v_item.notes, ''))) < 5 THEN
          RAISE EXCEPTION 'Explique o motivo da substituicao do material %.', v_req_item.material_name_snapshot;
        END IF;
        v_substitutions := v_substitutions || jsonb_build_array(jsonb_build_object(
          'request_item_id', v_req_item.id,
          'requested_material_id', v_req_item.material_id,
          'requested_material', v_req_item.material_name_snapshot,
          'authorized_material_id', v_target.id,
          'authorized_material', v_target.nome,
          'requested_quantity', v_req_item.requested_quantity,
          'approved_quantity', v_item.approved_quantity,
          'reason', btrim(v_item.notes)
        ));
      END IF;

      UPDATE public.request_items SET
        approved_quantity = v_item.approved_quantity,
        approved_material_id = v_target.id,
        approved_material_name_snapshot = v_target.nome,
        approved_unit_snapshot = v_target.unidade,
        sme_notes = nullif(btrim(coalesce(v_item.notes, '')), '')
      WHERE id = v_req_item.id;
    ELSE
      UPDATE public.request_items SET
        sme_notes = nullif(btrim(coalesce(v_item.notes, '')), '')
      WHERE id = v_req_item.id;
    END IF;
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM public.request_items
                 WHERE request_id = p_request_id AND approved_quantity > 0) THEN
    RAISE EXCEPTION 'Autorize ao menos um item ou rejeite o pedido.';
  END IF;

  -- Os itens diferentes que usam o mesmo material autorizado sao SOMADOS.
  -- O estoque e bloqueado na validacao final para evitar autorizacoes inconsistentes.
  FOR v_summary IN
    SELECT approved_material_id AS material_id, sum(approved_quantity) AS total
      FROM public.request_items
     WHERE request_id = p_request_id AND approved_quantity > 0
     GROUP BY approved_material_id ORDER BY approved_material_id
  LOOP
    SELECT * INTO v_target FROM public.materials WHERE id = v_summary.material_id FOR UPDATE;
    IF v_target.id IS NULL OR NOT v_target.ativo OR v_target.stock_quantity < v_summary.total THEN
      RAISE EXCEPTION 'Estoque insuficiente para material autorizado (%). Recarregue os saldos.',
        coalesce(v_target.nome, 'nao encontrado');
    END IF;
  END LOOP;

  UPDATE public.requests SET
    status = 'approved',
    received_by = coalesce(received_by, auth.uid()),
    received_by_name = coalesce(received_by_name, v_profile.full_name),
    received_by_email = coalesce(received_by_email, v_profile.email),
    received_at = coalesce(received_at, now()),
    authorized_by = auth.uid(),
    authorized_by_name = v_profile.full_name,
    authorized_by_email = v_profile.email,
    authorized_at = now(),
    authorization_notes = nullif(btrim(coalesce(p_authorization_notes, '')), ''),
    rejected_by = NULL, rejected_by_name = NULL,
    rejected_at = NULL, rejection_reason = NULL
  WHERE id = p_request_id;

  PERFORM public.log_request_event(
    p_request_id, 'request_authorized', v_old_status, 'approved',
    CASE WHEN jsonb_array_length(v_substitutions) > 0
      THEN 'Pedido autorizado pela SME com substituicao de materiais. Consulte o detalhamento da autorizacao.'
      ELSE 'Pedido autorizado pela SME e liberado para o almoxarifado.' END,
    NULL, jsonb_build_object('substitutions', v_substitutions)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.authorize_request(uuid,jsonb,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.authorize_request(uuid,jsonb,text) TO authenticated;

-- Expedicao: BAIXA SEMPRE O MATERIAL AUTORIZADO, nao o solicitado.
-- A remessa armazena o nome/unidade real do produto entregue.
CREATE OR REPLACE FUNCTION public.register_dispatch(
  p_request_id uuid,
  p_dispatch_date date,
  p_document_number text,
  p_observations text,
  p_items jsonb
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_request public.requests%ROWTYPE;
  v_profile public.profiles%ROWTYPE;
  v_delivery_id uuid;
  v_item RECORD;
  v_req_item public.request_items%ROWTYPE;
  v_target public.materials%ROWTYPE;
  v_already_dispatched numeric;
  v_before numeric(14,2);
  v_after numeric(14,2);
  v_item_count integer := 0;
  v_notes text;
BEGIN
  IF NOT public.can_operate_warehouse(auth.uid()) THEN
    RAISE EXCEPTION 'Seu perfil nao possui permissao para registrar remessas.';
  END IF;
  IF p_dispatch_date IS NULL OR p_dispatch_date > current_date THEN
    RAISE EXCEPTION 'Informe uma data de saida valida (nao futura).';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Informe ao menos um item da remessa.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_items) AS x(request_item_id uuid)
    GROUP BY request_item_id HAVING count(*) > 1
  ) THEN RAISE EXCEPTION 'O mesmo item nao pode aparecer duas vezes na remessa.'; END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = auth.uid();
  SELECT * INTO v_request FROM public.requests WHERE id = p_request_id FOR UPDATE;
  IF v_request.id IS NULL THEN RAISE EXCEPTION 'Pedido nao encontrado.'; END IF;
  IF v_request.status NOT IN ('approved', 'preparing', 'partially_delivered') THEN
    RAISE EXCEPTION 'O pedido nao esta disponivel para expedicao.';
  END IF;

  INSERT INTO public.deliveries (
    request_id, school_id, status, dispatch_date, delivery_date,
    document_number, delivered_by_name, delivered_by_department,
    observations, registered_by, registered_by_email, registered_by_name
  ) VALUES (
    p_request_id, v_request.school_id, 'dispatched', p_dispatch_date, p_dispatch_date,
    nullif(btrim(coalesce(p_document_number, '')), ''),
    coalesce(v_profile.full_name, v_profile.email, 'Almoxarifado'),
    coalesce(nullif(btrim(coalesce(v_profile.position, '')), ''), 'Almoxarifado'),
    nullif(btrim(coalesce(p_observations, '')), ''),
    auth.uid(), v_profile.email, v_profile.full_name
  ) RETURNING id INTO v_delivery_id;

  FOR v_item IN
    SELECT * FROM jsonb_to_recordset(p_items)
      AS x(request_item_id uuid, quantity numeric, notes text)
  LOOP
    SELECT * INTO v_req_item FROM public.request_items
      WHERE id = v_item.request_item_id AND request_id = p_request_id FOR UPDATE;
    IF v_req_item.id IS NULL OR v_req_item.approved_quantity <= 0 THEN
      RAISE EXCEPTION 'Item nao autorizado ou nao pertence ao pedido.';
    END IF;
    IF v_item.quantity IS NULL OR v_item.quantity <= 0
       OR v_item.quantity <> round(v_item.quantity, 2) THEN
      RAISE EXCEPTION 'Quantidade de expedicao invalida.';
    END IF;

    SELECT coalesce(sum(di.quantity), 0) INTO v_already_dispatched
      FROM public.delivery_items di
      JOIN public.deliveries d ON d.id = di.delivery_id
     WHERE di.request_item_id = v_req_item.id
       AND d.status IN ('dispatched', 'delivered');
    IF v_item.quantity > (v_req_item.approved_quantity - v_already_dispatched) THEN
      RAISE EXCEPTION 'Quantidade superior ao saldo autorizado para %.', v_req_item.material_name_snapshot;
    END IF;

    SELECT * INTO v_target FROM public.materials
      WHERE id = coalesce(v_req_item.approved_material_id, v_req_item.material_id)
      FOR UPDATE;
    IF v_target.id IS NULL THEN
      RAISE EXCEPTION 'Material autorizado nao encontrado para %.', v_req_item.material_name_snapshot;
    END IF;
    v_before := v_target.stock_quantity;
    IF v_before < v_item.quantity THEN
      RAISE EXCEPTION 'Estoque insuficiente de %. Disponivel: % %.',
        v_target.nome, v_before, v_target.unidade;
    END IF;
    v_after := v_before - v_item.quantity;
    UPDATE public.materials SET stock_quantity = v_after, stock_updated_at = now()
      WHERE id = v_target.id;

    v_notes := NULL;
    IF v_target.id <> v_req_item.material_id THEN
      v_notes := 'Substituicao autorizada pela SME. Solicitado: '
                 || v_req_item.material_name_snapshot || '. Autorizado/expedido: ' || v_target.nome || '.';
    END IF;
    IF nullif(btrim(coalesce(v_item.notes, '')), '') IS NOT NULL THEN
      v_notes := concat_ws(' ', v_notes, btrim(v_item.notes));
    END IF;

    INSERT INTO public.delivery_items (
      delivery_id, request_item_id, material_id, quantity,
      unit_snapshot, material_name_snapshot, notes
    ) VALUES (
      v_delivery_id, v_req_item.id, v_target.id, v_item.quantity,
      v_target.unidade, v_target.nome, v_notes
    );

    INSERT INTO public.inventory_movements (
      material_id, movement_type, quantity, balance_before, balance_after,
      document_number, notes, request_id, delivery_id,
      actor_id, actor_name, actor_email
    ) VALUES (
      v_target.id, 'dispatch', v_item.quantity, v_before, v_after,
      nullif(btrim(coalesce(p_document_number, '')), ''),
      concat_ws(' ', v_notes, nullif(btrim(coalesce(p_observations, '')), '')),
      p_request_id, v_delivery_id,
      auth.uid(), v_profile.full_name, v_profile.email
    );
    v_item_count := v_item_count + 1;
  END LOOP;

  IF v_item_count = 0 THEN RAISE EXCEPTION 'Nenhuma quantidade valida informada.'; END IF;
  UPDATE public.requests SET status = 'dispatched' WHERE id = p_request_id;

  PERFORM public.log_request_event(
    p_request_id, 'delivery_dispatched', v_request.status, 'dispatched',
    'Remessa expedida pelo almoxarifado, com baixa do material autorizado. Termo de entrega disponivel em duas vias.',
    v_delivery_id,
    jsonb_build_object('document_number', p_document_number,
      'dispatch_date', p_dispatch_date, 'expedited_by', v_profile.full_name)
  );
  RETURN v_delivery_id;
END;
$$;
REVOKE ALL ON FUNCTION public.register_dispatch(uuid,date,text,text,jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_dispatch(uuid,date,text,text,jsonb)
  TO authenticated;

COMMIT;
