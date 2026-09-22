// Views de pedidos: lista, filtros, tabela, formulário, detalhe, painel de
// ações da SME, remessas e linha do tempo. Código MOVIDO de application.js
// sem alteração do HTML gerado.
import { STATUS, PRIORITY } from '../constants/workflow.js';
import { icon } from '../ui/icons.js';
import {
  escapeHtml,
  attr,
  formatDate,
  formatDateTime,
  formatNumber,
  todayISO,
  truncate,
  selected
} from '../utils/formatters.js';
import { state } from '../app/state.js';
import {
  isSchool,
  isSme,
  isManager,
  statusBadge,
  priorityBadge,
  getRequest,
  getSchoolName,
  requestTotals,
  deliveredQuantityForItem
} from '../app/helpers.js';

export function getFilteredRequests() {
  const search = state.filters.requestSearch.trim().toLowerCase();
  return state.requests.filter((request) => {
    const matchesStatus = state.filters.requestStatus === 'all' || request.status === state.filters.requestStatus;
    const matchesSchool = state.filters.requestSchool === 'all' || request.school_id === state.filters.requestSchool;
    const haystack = [
      request.protocol_number,
      request.purpose,
      request.schools?.nome,
      request.created_by_name,
      ...(request.request_items || []).map((item) => item.material_name_snapshot)
    ].join(' ').toLowerCase();
    return matchesStatus && matchesSchool && (!search || haystack.includes(search));
  });
}

export function renderRequestsList(schoolMode) {
  const requests = getFilteredRequests();
  const showSchool = !schoolMode;
  return `
    <div class="stack-lg">
      <section class="panel filter-panel">
        <div class="filter-grid ${showSchool ? 'four' : 'three'}">
          <label class="field search-field"><span>Pesquisar</span><div class="input-with-icon">${icon('search', 18)}<input type="search" value="${attr(state.filters.requestSearch)}" data-filter="requestSearch" placeholder="Protocolo, escola ou material" /></div></label>
          <label class="field"><span>Situação</span><select data-filter="requestStatus"><option value="all">Todas as situações</option>${Object.entries(STATUS).map(([key, value]) => `<option value="${key}" ${selected(state.filters.requestStatus === key)}>${escapeHtml(schoolMode ? value.school : value.label)}</option>`).join('')}</select></label>
          ${showSchool ? `<label class="field"><span>Escola</span><select data-filter="requestSchool"><option value="all">Todas as escolas</option>${state.schools.map((school) => `<option value="${school.id}" ${selected(state.filters.requestSchool === school.id)}>${escapeHtml(school.nome)}</option>`).join('')}</select></label>` : ''}
          <div class="filter-summary"><span>Resultados</span><strong>${requests.length}</strong><small>de ${state.requests.length} pedidos</small></div>
        </div>
      </section>

      <section class="panel">
        <div class="panel-heading inline">
          <div><h3>${schoolMode ? 'Pedidos da escola' : 'Pedidos das escolas'}</h3><p>Selecione um protocolo para consultar todos os detalhes e ações disponíveis.</p></div>
          ${schoolMode ? `<button type="button" class="button primary" data-action="new-request">${icon('plus', 18)} Novo pedido</button>` : `<button type="button" class="button secondary" data-action="refresh">${icon('refresh', 18)} Atualizar</button>`}
        </div>
        ${requests.length ? renderRequestTable(requests, { showSchool, compact: false }) : renderEmptyState('search', 'Nenhum pedido encontrado', 'Altere os filtros ou registre uma nova solicitação.', schoolMode ? 'Novo pedido' : null, schoolMode ? 'new-request' : null)}
      </section>
    </div>`;
}

export function renderRequestTable(requests, options = {}) {
  const { showSchool = false, compact = false } = options;
  return `
    <div class="table-wrap ${compact ? 'compact-table' : ''}">
      <table class="data-table">
        <thead><tr><th>Protocolo</th>${showSchool ? '<th>Escola</th>' : ''}<th>Finalidade / itens</th><th>Data</th><th>Prioridade</th><th>Situação</th><th class="align-right">Ação</th></tr></thead>
        <tbody>
          ${requests.map((request) => `
            <tr>
              <td data-label="Protocolo"><button type="button" class="protocol-link" data-action="open-request" data-id="${request.id}">${escapeHtml(request.protocol_number || 'Sem protocolo')}</button><small class="cell-sub">${request.request_items?.length || 0} material(is)</small></td>
              ${showSchool ? `<td data-label="Escola"><strong class="cell-title">${escapeHtml(request.schools?.nome || getSchoolName(request.school_id))}</strong>${request.schools?.inep ? `<small class="cell-sub">INEP ${escapeHtml(request.schools.inep)}</small>` : ''}</td>` : ''}
              <td data-label="Finalidade / itens"><strong class="cell-title">${escapeHtml(truncate(request.purpose, compact ? 54 : 76))}</strong><small class="cell-sub">${escapeHtml((request.request_items || []).slice(0, 2).map((item) => item.material_name_snapshot).join(', '))}${request.request_items?.length > 2 ? '…' : ''}</small></td>
              <td data-label="Data">${formatDate(request.submitted_at || request.created_at)}<small class="cell-sub">${request.submitted_at ? 'enviado' : 'criado'}</small></td>
              <td data-label="Prioridade">${priorityBadge(request.priority)}</td>
              <td data-label="Situação">${statusBadge(request.status, isSchool() ? 'school' : 'default')}</td>
              <td class="align-right" data-label="Ação"><button type="button" class="button icon-only secondary" data-action="open-request" data-id="${request.id}" title="Abrir pedido">${icon('eye', 18)}</button></td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

export function renderEmptyState(iconName, title, text, actionLabel = null, action = null) {
  return `<div class="empty-state"><span>${icon(iconName, 34)}</span><h4>${escapeHtml(title)}</h4><p>${escapeHtml(text)}</p>${actionLabel ? `<button type="button" class="button primary small" data-action="${attr(action)}">${icon('plus', 17)} ${escapeHtml(actionLabel)}</button>` : ''}</div>`;
}

export function createBlankDraft() {
  return {
    id: null,
    priority: 'normal',
    purpose: '',
    requestedDeliveryDate: '',
    notes: '',
    schoolContactName: state.profile?.full_name || '',
    schoolContactPhone: state.profile?.phone || '',
    items: [{ material_id: '', quantity: '', notes: '' }]
  };
}

export function draftFromRequest(request) {
  return {
    id: request.id,
    priority: request.priority || 'normal',
    purpose: request.purpose || '',
    requestedDeliveryDate: request.requested_delivery_date || '',
    notes: request.notes || '',
    schoolContactName: request.school_contact_name || state.profile?.full_name || '',
    schoolContactPhone: request.school_contact_phone || state.profile?.phone || '',
    items: (request.request_items || []).map((item) => ({
      material_id: item.material_id,
      quantity: String(item.requested_quantity || ''),
      notes: item.school_notes || ''
    }))
  };
}

export function renderRequestForm() {
  if (!state.draft) state.draft = createBlankDraft();
  const draft = state.draft;
  const activeMaterials = state.materials.filter((material) => material.ativo);
  const school = state.schools.find((item) => item.id === state.profile.school_id);

  if (!state.profile.school_id || !school) {
    return `<section class="panel">${renderEmptyState('alert', 'Usuário sem escola vinculada', 'O administrador da SME precisa vincular sua conta a uma unidade escolar antes de criar pedidos.')}</section>`;
  }

  return `
    <form id="request-form" class="stack-lg">
      <section class="panel form-section">
        <div class="section-title"><span>${icon('school', 21)}</span><div><h3>Unidade solicitante</h3><p>O pedido será automaticamente vinculado ao seu acesso.</p></div></div>
        <div class="school-summary-card">
          <div class="school-summary-icon">${icon('school', 26)}</div>
          <div><strong>${escapeHtml(school.nome)}</strong><span>${school.inep ? `INEP ${escapeHtml(school.inep)}` : 'Unidade escolar cadastrada'}${school.diretor ? ` • Direção: ${escapeHtml(school.diretor)}` : ''}</span></div>
          <span class="badge badge-green">Vínculo confirmado</span>
        </div>
      </section>

      <section class="panel form-section">
        <div class="section-title"><span>${icon('clipboard', 21)}</span><div><h3>Dados do pedido</h3><p>Descreva a finalidade e indique a prioridade da solicitação.</p></div></div>
        <div class="form-grid three">
          <label class="field span-2"><span>Finalidade do pedido *</span><input type="text" data-draft-field="purpose" value="${attr(draft.purpose)}" maxlength="220" placeholder="Ex.: reposição para atividades pedagógicas do 2º bimestre" required /></label>
          <label class="field"><span>Prioridade *</span><select data-draft-field="priority" required>${Object.entries(PRIORITY).map(([key, value]) => `<option value="${key}" ${selected(draft.priority === key)}>${escapeHtml(value.label)}</option>`).join('')}</select></label>
          <label class="field"><span>Data desejada</span><input type="date" data-draft-field="requestedDeliveryDate" min="${todayISO()}" value="${attr(draft.requestedDeliveryDate)}" /></label>
          <label class="field"><span>Contato na escola</span><input type="text" data-draft-field="schoolContactName" value="${attr(draft.schoolContactName)}" placeholder="Nome do responsável pelo pedido" /></label>
          <label class="field"><span>Telefone para contato</span><input type="tel" data-draft-field="schoolContactPhone" value="${attr(draft.schoolContactPhone)}" placeholder="(00) 00000-0000" /></label>
          <label class="field span-3"><span>Observações gerais</span><textarea data-draft-field="notes" rows="3" maxlength="1000" placeholder="Informações que ajudem a SME na análise">${escapeHtml(draft.notes)}</textarea></label>
        </div>
      </section>

      <section class="panel form-section">
        <div class="section-title inline">
          <span>${icon('box', 21)}</span>
          <div><h3>Materiais solicitados</h3><p>Adicione os itens e as quantidades necessárias.</p></div>
          <button type="button" class="button secondary small" data-action="add-draft-item">${icon('plus', 17)} Adicionar material</button>
        </div>
        ${activeMaterials.length ? `
          <div class="request-items-editor">
            <div class="editor-head"><span>Material</span><span>Quantidade</span><span>Observação do item</span><span></span></div>
            ${draft.items.map((item, index) => `
              <div class="editor-row" data-index="${index}">
                <label class="field mobile-label"><span>Material</span><select data-draft-item="material_id" data-index="${index}" required><option value="">Selecione um material</option>${activeMaterials.map((material) => `<option value="${material.id}" ${selected(item.material_id === material.id)}>${escapeHtml(material.nome)} — ${escapeHtml(material.unidade)}</option>`).join('')}</select></label>
                <label class="field mobile-label"><span>Quantidade</span><input type="number" min="0.01" step="0.01" data-draft-item="quantity" data-index="${index}" value="${attr(item.quantity)}" placeholder="0" required /></label>
                <label class="field mobile-label"><span>Observação do item</span><input type="text" data-draft-item="notes" data-index="${index}" value="${attr(item.notes)}" maxlength="300" placeholder="Tamanho, série, especificação..." /></label>
                <button type="button" class="icon-button danger-soft" data-action="remove-draft-item" data-index="${index}" title="Remover item" ${draft.items.length === 1 ? 'disabled' : ''}>${icon('x', 18)}</button>
              </div>`).join('')}
          </div>` : renderEmptyState('box', 'Catálogo vazio', 'A SME precisa cadastrar materiais ativos antes que a escola possa fazer pedidos.')}
      </section>

      <section class="form-actions sticky-actions">
        <div><strong>${draft.id ? 'Editando rascunho existente' : 'Novo pedido'}</strong><span>O envio gera um protocolo e bloqueia a edição pela escola.</span></div>
        <div class="button-row">
          <button type="button" class="button secondary" data-action="cancel-request-form">Cancelar</button>
          <button type="submit" class="button secondary" data-mode="draft" ${!activeMaterials.length ? 'disabled' : ''}>${icon('save', 18)} Salvar rascunho</button>
          <button type="submit" class="button primary" data-mode="submit" ${!activeMaterials.length ? 'disabled' : ''}>${icon('send', 18)} Enviar para a SME</button>
        </div>
      </section>
    </form>`;
}

export function renderRequestDetail() {
  const request = getRequest();
  if (!request) return `<section class="panel">${renderEmptyState('alert', 'Pedido não encontrado', 'O registro pode ter sido removido ou não está disponível para seu acesso.', 'Voltar', 'back-from-detail')}</section>`;

  const totals = requestTotals(request);
  const events = state.events[request.id] || [];
  const context = isSchool() ? 'school' : 'default';
  const canEditDraft = isSchool() && request.status === 'draft';
  const unconfirmedDeliveries = (request.deliveries || []).filter((delivery) => delivery.status === 'delivered' && !delivery.school_confirmed_at && !String(delivery.delivery_number || '').startsWith('LEG-'));

  return `
    <div class="stack-lg request-detail-page">
      <div class="detail-toolbar">
        <button type="button" class="button secondary" data-action="back-from-detail">${icon('back', 18)} Voltar</button>
        <div class="button-row">
          <button type="button" class="button secondary" data-action="print-request" data-id="${request.id}">${icon('print', 18)} Imprimir pedido</button>
          ${canEditDraft ? `<button type="button" class="button primary" data-action="edit-draft" data-id="${request.id}">${icon('edit', 18)} Editar rascunho</button>` : ''}
        </div>
      </div>

      <section class="request-hero-card">
        <div class="request-hero-main">
          <div class="protocol-mark">${icon('filecheck', 28)}</div>
          <div><span>Protocolo</span><h2>${escapeHtml(request.protocol_number)}</h2><p>${escapeHtml(request.schools?.nome || getSchoolName(request.school_id))}</p></div>
        </div>
        <div class="request-hero-badges">${priorityBadge(request.priority)}${statusBadge(request.status, context)}</div>
        <div class="request-hero-meta">
          <div><span>Solicitado por</span><strong>${escapeHtml(request.created_by_name || '—')}</strong></div>
          <div><span>Enviado em</span><strong>${formatDateTime(request.submitted_at || request.created_at)}</strong></div>
          <div><span>Data desejada</span><strong>${formatDate(request.requested_delivery_date)}</strong></div>
        </div>
      </section>

      ${renderSmeActionPanel(request)}
      ${isSchool() && unconfirmedDeliveries.length ? `
        <section class="panel attention-panel">
          <div class="panel-heading inline"><div><span class="eyebrow">Ação da escola</span><h3>Confirme o recebimento</h3><p>Valide as remessas entregues para concluir a conferência institucional.</p></div></div>
          <div class="delivery-confirm-grid">
            ${unconfirmedDeliveries.map((delivery) => `
              <article><div><strong>${escapeHtml(delivery.delivery_number || 'Remessa')}</strong><span>Recebida em ${formatDate(delivery.receipt_date || delivery.delivery_date)} por ${escapeHtml(delivery.received_by_name || '—')}</span></div><button type="button" class="button primary small" data-action="open-confirm-delivery" data-id="${delivery.id}">${icon('check', 17)} Confirmar</button></article>`).join('')}
          </div>
        </section>` : ''}

      <div class="detail-columns">
        <div class="stack-lg">
          <section class="panel">
            <div class="panel-heading"><div><h3>Itens do pedido</h3><p>Comparativo entre solicitado, autorizado e efetivamente entregue.</p></div></div>
            <div class="table-wrap">
              <table class="data-table item-comparison-table">
                <thead><tr><th>Material</th><th class="align-center">Solicitado</th><th class="align-center">Autorizado</th><th class="align-center">Entregue</th><th>Observações</th></tr></thead>
                <tbody>${(request.request_items || []).map((item) => {
                  const delivered = deliveredQuantityForItem(request, item.id);
                  return `<tr><td data-label="Material"><strong class="cell-title">${escapeHtml(item.material_name_snapshot)}</strong><small class="cell-sub">${escapeHtml(item.unit_snapshot)}</small></td><td class="align-center number-cell" data-label="Solicitado">${formatNumber(item.requested_quantity)}</td><td class="align-center number-cell ${Number(item.approved_quantity) === 0 && ['approved','preparing','dispatched','partially_delivered','delivered'].includes(request.status) ? 'zero' : ''}" data-label="Autorizado">${['draft','submitted','under_review'].includes(request.status) ? '—' : formatNumber(item.approved_quantity)}</td><td class="align-center number-cell" data-label="Entregue">${formatNumber(delivered)}</td><td data-label="Observações"><small class="notes-cell">${escapeHtml(item.school_notes || item.sme_notes || '—')}</small>${item.school_notes && item.sme_notes ? `<small class="cell-sub">SME: ${escapeHtml(item.sme_notes)}</small>` : ''}</td></tr>`;
                }).join('')}</tbody>
                <tfoot><tr><td>Total das quantidades</td><td class="align-center">${formatNumber(totals.requested)}</td><td class="align-center">${formatNumber(totals.approved)}</td><td class="align-center">${formatNumber(totals.delivered)}</td><td></td></tr></tfoot>
              </table>
            </div>
          </section>

          ${renderDeliveriesForRequest(request)}
          ${renderRequestTimeline(request, events)}
        </div>

        <aside class="detail-sidebar stack-lg">
          <section class="panel info-panel">
            <div class="panel-heading"><div><h3>Dados da solicitação</h3></div></div>
            <dl class="detail-list">
              <div><dt>Finalidade</dt><dd>${escapeHtml(request.purpose)}</dd></div>
              <div><dt>Observações</dt><dd>${escapeHtml(request.notes || 'Nenhuma observação.')}</dd></div>
              <div><dt>Contato da escola</dt><dd>${escapeHtml(request.school_contact_name || '—')}<small>${escapeHtml(request.school_contact_phone || '')}</small></dd></div>
            </dl>
          </section>

          <section class="panel info-panel">
            <div class="panel-heading"><div><h3>Responsáveis e auditoria</h3></div></div>
            <dl class="audit-list">
              <div><span class="audit-icon">${icon('user', 17)}</span><dt>Registrado por</dt><dd>${escapeHtml(request.created_by_name || '—')}<small>${escapeHtml(request.created_by_email || '')}</small></dd></div>
              <div><span class="audit-icon">${icon('mail', 17)}</span><dt>Recebido na SME por</dt><dd>${escapeHtml(request.received_by_name || 'Ainda não recebido')}<small>${request.received_at ? formatDateTime(request.received_at) : ''}</small></dd></div>
              <div><span class="audit-icon">${icon('shield', 17)}</span><dt>Autorizado por</dt><dd>${escapeHtml(request.authorized_by_name || 'Ainda não autorizado')}<small>${request.authorized_at ? formatDateTime(request.authorized_at) : ''}</small></dd></div>
            </dl>
            ${request.authorization_notes ? `<div class="decision-note success"><strong>Observação da autorização</strong><p>${escapeHtml(request.authorization_notes)}</p></div>` : ''}
            ${request.rejection_reason ? `<div class="decision-note danger"><strong>Motivo da rejeição</strong><p>${escapeHtml(request.rejection_reason)}</p><small>${escapeHtml(request.rejected_by_name || '')} • ${formatDateTime(request.rejected_at)}</small></div>` : ''}
            ${request.cancellation_reason ? `<div class="decision-note neutral"><strong>Motivo do cancelamento</strong><p>${escapeHtml(request.cancellation_reason)}</p><small>${escapeHtml(request.cancelled_by_name || '')} • ${formatDateTime(request.cancelled_at)}</small></div>` : ''}
          </section>

          <section class="panel progress-panel">
            <div class="panel-heading"><div><h3>Progresso da entrega</h3></div></div>
            ${renderProgressRing(totals.approved ? Math.min(100, (totals.delivered / totals.approved) * 100) : 0)}
            <div class="progress-numbers"><div><strong>${formatNumber(totals.delivered)}</strong><span>entregue</span></div><div><strong>${formatNumber(totals.approved)}</strong><span>autorizado</span></div></div>
          </section>
        </aside>
      </div>
    </div>`;
}

export function renderSmeActionPanel(request) {
  if (isSchool()) {
    const canCancel = ['draft', 'submitted'].includes(request.status);
    if (!canCancel) return '';
    return `
      <section class="action-panel school-action-panel">
        <div><span>${icon('info', 21)}</span><div><strong>${request.status === 'draft' ? 'Este pedido ainda é um rascunho.' : 'O pedido foi enviado para a SME.'}</strong><p>${request.status === 'draft' ? 'Você pode editar os itens ou enviar para análise.' : 'É possível cancelar enquanto a SME ainda não iniciou a análise.'}</p></div></div>
        <div class="button-row">
          ${request.status === 'draft' ? `<button type="button" class="button primary" data-action="edit-draft" data-id="${request.id}">${icon('edit', 18)} Editar e enviar</button>` : ''}
          <button type="button" class="button danger-outline" data-action="open-cancel-request" data-id="${request.id}">${icon('x', 18)} Cancelar pedido</button>
        </div>
      </section>`;
  }

  const dispatched = (request.deliveries || []).filter((delivery) => delivery.status === 'dispatched');
  const dispatchable = ['approved', 'preparing', 'partially_delivered'].includes(request.status) && hasRemainingAuthorizedItems(request);
  let title = 'Pedido processado';
  let text = 'Não há ações pendentes para este pedido.';
  let buttons = '';

  if (request.status === 'submitted') {
    title = 'Pedido aguardando recebimento pela SME';
    text = 'Ao receber, o sistema registra automaticamente seu nome, data e horário e inicia a análise.';
    buttons = `<button type="button" class="button primary" data-action="receive-request" data-id="${request.id}">${icon('mail', 18)} Receber para análise</button>`;
  } else if (request.status === 'under_review') {
    title = isManager() ? 'Análise e decisão do pedido' : 'Pedido em análise';
    text = isManager() ? 'Confira os itens e registre as quantidades autorizadas ou o motivo da rejeição.' : 'Um gestor/autorizador da SME deve registrar a decisão.';
    if (isManager()) buttons = `<button type="button" class="button success" data-action="open-authorize-request" data-id="${request.id}">${icon('shield', 18)} Autorizar pedido</button><button type="button" class="button danger-outline" data-action="open-reject-request" data-id="${request.id}">${icon('x', 18)} Rejeitar</button>`;
  } else if (request.status === 'approved') {
    title = 'Pedido autorizado';
    text = 'Inicie a separação para preparar os materiais e liberar o registro da remessa.';
    buttons = `<button type="button" class="button primary" data-action="start-preparation" data-id="${request.id}">${icon('archive', 18)} Iniciar separação</button>`;
  } else if (dispatchable) {
    title = request.status === 'partially_delivered' ? 'Entrega parcial registrada' : 'Materiais em separação';
    text = 'Registre uma nova remessa com as quantidades que sairão para a escola.';
    buttons = `<button type="button" class="button primary" data-action="open-dispatch" data-id="${request.id}">${icon('truck', 18)} Registrar saída / remessa</button>`;
  } else if (request.status === 'dispatched') {
    title = 'Remessa em transporte';
    text = 'Quando a escola receber, registre o recebedor e a data para atualizar o pedido.';
  } else if (request.status === 'delivered') {
    title = 'Pedido concluído';
    text = 'Todas as quantidades autorizadas foram registradas como entregues.';
  } else if (request.status === 'rejected') {
    title = 'Pedido rejeitado';
    text = 'A decisão e o motivo ficam disponíveis para a escola no histórico.';
  } else if (request.status === 'cancelled') {
    title = 'Pedido cancelado';
    text = 'Este pedido não possui mais ações operacionais.';
  }

  if (dispatched.length) {
    buttons += dispatched.map((delivery) => `<button type="button" class="button success" data-action="open-receipt" data-id="${delivery.id}">${icon('check', 18)} Registrar recebimento ${escapeHtml(delivery.delivery_number || '')}</button>`).join('');
  }

  const canCancel = isManager() && !['delivered', 'cancelled', 'rejected'].includes(request.status);
  if (canCancel) buttons += `<button type="button" class="button danger-outline" data-action="open-cancel-request" data-id="${request.id}">${icon('x', 18)} Cancelar</button>`;

  return `
    <section class="action-panel sme-action-panel">
      <div><span>${icon('clipboard', 22)}</span><div><strong>${escapeHtml(title)}</strong><p>${escapeHtml(text)}</p></div></div>
      ${buttons ? `<div class="button-row wrap">${buttons}</div>` : ''}
    </section>`;
}

export function hasRemainingAuthorizedItems(request) {
  return (request.request_items || []).some((item) => {
    const dispatched = deliveredQuantityForItem(request, item.id, true);
    return Number(item.approved_quantity || 0) - dispatched > 0.00001;
  });
}

export function renderDeliveriesForRequest(request) {
  const deliveries = request.deliveries || [];
  return `
    <section class="panel">
      <div class="panel-heading inline"><div><h3>Remessas e recebimentos</h3><p>Documentos, responsáveis e confirmação de cada saída.</p></div><span class="count-pill">${deliveries.length}</span></div>
      ${deliveries.length ? `<div class="delivery-cards">
        ${deliveries.map((delivery) => `
          <article class="delivery-card">
            <div class="delivery-card-head">
              <div class="delivery-number"><span>${icon('truck', 20)}</span><div><strong>${escapeHtml(delivery.delivery_number || 'Remessa sem número')}</strong><small>${delivery.document_number ? `Documento ${escapeHtml(delivery.document_number)}` : 'Sem documento informado'}</small></div></div>
              ${statusBadge(delivery.status === 'delivered' ? 'delivered' : 'dispatched', isSchool() ? 'school' : 'default')}
            </div>
            <div class="delivery-card-grid">
              <div><span>Saída</span><strong>${formatDate(delivery.dispatch_date || delivery.delivery_date)}</strong><small>registrada por ${escapeHtml(delivery.registered_by_name || '—')}</small></div>
              <div><span>Responsável pela entrega</span><strong>${escapeHtml(delivery.delivered_by_name || '—')}</strong><small>${escapeHtml(delivery.delivered_by_department || '')}</small></div>
              <div><span>Recebimento</span><strong>${delivery.status === 'delivered' ? formatDate(delivery.receipt_date || delivery.delivery_date) : 'Aguardando'}</strong><small>${delivery.received_by_name ? `por ${escapeHtml(delivery.received_by_name)}` : ''}</small></div>
              <div><span>Registrado por</span><strong>${escapeHtml(delivery.receipt_registered_by_name || delivery.registered_by_name || '—')}</strong><small>${delivery.receipt_registered_by_email ? 'recebimento' : 'saída'}</small></div>
            </div>
            <div class="delivery-items-mini">
              ${(delivery.delivery_items || []).map((item) => `<span><strong>${formatNumber(item.quantity)}</strong> ${escapeHtml(item.unit_snapshot || '')} • ${escapeHtml(item.material_name_snapshot || item.materials?.nome || '')}</span>`).join('')}
            </div>
            ${delivery.status === 'delivered' ? `<div class="receipt-box"><div><span>${icon('check', 17)}</span><p><strong>Recebido por ${escapeHtml(delivery.received_by_name || '—')}</strong><small>${escapeHtml([delivery.received_by_position, delivery.received_by_document].filter(Boolean).join(' • '))}</small></p></div>${delivery.school_confirmed_at ? `<span class="badge badge-green">Escola confirmou em ${formatDate(delivery.school_confirmed_at)}</span>` : `<span class="badge badge-amber">Aguardando confirmação da escola</span>`}</div>` : ''}
            ${isSme() && delivery.status === 'dispatched' ? `<div class="delivery-card-actions"><button type="button" class="button success small" data-action="open-receipt" data-id="${delivery.id}">${icon('check', 17)} Registrar recebimento</button></div>` : ''}
            ${isSchool() && delivery.status === 'delivered' && !delivery.school_confirmed_at ? `<div class="delivery-card-actions"><button type="button" class="button primary small" data-action="open-confirm-delivery" data-id="${delivery.id}">${icon('check', 17)} Confirmar recebimento</button></div>` : ''}
          </article>`).join('')}
      </div>` : renderEmptyState('truck', 'Nenhuma remessa registrada', 'As entregas aparecerão aqui depois que a SME registrar a saída dos materiais.')}
    </section>`;
}

export function renderRequestTimeline(request, events) {
  const fallback = [{
    event_type: 'record_created',
    description: request.status === 'draft' ? 'Rascunho criado pela escola.' : 'Pedido registrado no sistema.',
    actor_name: request.created_by_name,
    created_at: request.created_at
  }];
  const items = events.length ? events : fallback;
  return `
    <section class="panel">
      <div class="panel-heading"><div><h3>Histórico e trilha de auditoria</h3><p>Todas as movimentações relevantes ficam vinculadas ao usuário responsável.</p></div></div>
      <div class="timeline">
        ${items.map((event, index) => `
          <article class="timeline-item">
            <span class="timeline-dot">${icon(eventIcon(event.event_type), 16)}</span>
            <div class="timeline-content"><div><strong>${escapeHtml(eventTitle(event.event_type))}</strong><time>${formatDateTime(event.created_at)}</time></div><p>${escapeHtml(event.description)}</p><small>${escapeHtml(event.actor_name || 'Ação automática do sistema')}${event.actor_email ? ` • ${escapeHtml(event.actor_email)}` : ''}</small></div>
            ${index < items.length - 1 ? '<i></i>' : ''}
          </article>`).join('')}
      </div>
    </section>`;
}

export function eventIcon(type) {
  if (type.includes('legacy')) return 'archive';
  if (type.includes('submitted')) return 'send';
  if (type.includes('received')) return 'mail';
  if (type.includes('authorized')) return 'shield';
  if (type.includes('rejected') || type.includes('cancelled')) return 'x';
  if (type.includes('preparation')) return 'archive';
  if (type.includes('dispatch')) return 'truck';
  if (type.includes('confirmed')) return 'check';
  return 'clipboard';
}

export function eventTitle(type) {
  const labels = {
    draft_created: 'Rascunho criado',
    draft_updated: 'Rascunho atualizado',
    request_submitted: 'Pedido enviado',
    request_received: 'Recebido pela SME',
    request_authorized: 'Pedido autorizado',
    request_rejected: 'Pedido rejeitado',
    preparation_started: 'Separação iniciada',
    delivery_dispatched: 'Remessa expedida',
    delivery_received: 'Recebimento registrado',
    delivery_confirmed_by_school: 'Confirmação da escola',
    request_cancelled: 'Pedido cancelado',
    record_created: 'Registro criado',
    legacy_delivery_migrated: 'Entrega anterior migrada'
  };
  return labels[type] || 'Movimentação do pedido';
}

export function renderProgressRing(percent) {
  const rounded = Math.round(percent || 0);
  return `<div class="progress-ring" style="--progress:${rounded}"><div><strong>${rounded}%</strong><span>entregue</span></div></div>`;
}
