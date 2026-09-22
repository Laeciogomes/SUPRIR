// Views e agregações de relatórios (pedidos, materiais e entregas).
// Código MOVIDO de application.js sem alteração do HTML gerado.
import { STATUS, PRIORITY } from '../constants/workflow.js';
import { icon } from '../ui/icons.js';
import { escapeHtml, attr, formatDate, formatNumber, selected, truncate } from '../utils/formatters.js';
import { state } from '../app/state.js';
import {
  isSchool,
  isSme,
  statusBadge,
  getSchoolName,
  requestTotals,
  deliveredQuantityForItem,
  imageTag,
  institution
} from '../app/helpers.js';
import { statCard } from './shell.js';
import { renderEmptyState } from './requests.js';

export function getReportRequests({ applyDate = true } = {}) {
  const start = state.report.startDate || '0000-01-01';
  const end = state.report.endDate || '9999-12-31';
  const schoolId = isSchool() ? state.profile.school_id : state.report.schoolId;
  return state.requests.filter((request) => {
    const date = String(request.submitted_at || request.created_at || '').slice(0, 10);
    const matchesDate = !applyDate || !date || (date >= start && date <= end);
    const matchesSchool = !schoolId || schoolId === 'all' || request.school_id === schoolId;
    const matchesStatus = state.report.status === 'all' || request.status === state.report.status;
    return matchesDate && matchesSchool && matchesStatus;
  });
}

export function aggregateReportMaterials(requests) {
  const map = new Map();
  requests.forEach((request) => {
    (request.request_items || []).forEach((item) => {
      const key = item.material_id;
      const current = map.get(key) || {
        material: item.material_name_snapshot,
        unit: item.unit_snapshot,
        category: item.materials?.categoria || '',
        requested: 0,
        approved: 0,
        delivered: 0,
        requests: new Set(),
        schools: new Set()
      };
      current.requested += Number(item.requested_quantity || 0);
      current.approved += Number(item.approved_quantity || 0);
      current.delivered += deliveredQuantityForItem(request, item.id);
      current.requests.add(request.id);
      current.schools.add(request.school_id);
      map.set(key, current);
    });
  });
  return [...map.values()].sort((a, b) => a.material.localeCompare(b.material, 'pt-BR'));
}

export function getReportDeliveries(requests) {
  return requests.flatMap((request) => (request.deliveries || []).map((delivery) => ({ ...delivery, request })))
    .filter((delivery) => {
      const date = String(delivery.receipt_date || delivery.dispatch_date || delivery.delivery_date || '').slice(0, 10);
      return (!state.report.startDate || date >= state.report.startDate) && (!state.report.endDate || date <= state.report.endDate);
    })
    .sort((a, b) => String(b.receipt_date || b.dispatch_date || '').localeCompare(String(a.receipt_date || a.dispatch_date || '')));
}

export function getReportData() {
  const datedRequests = getReportRequests({ applyDate: true });
  const deliveryCandidates = getReportRequests({ applyDate: false });
  const deliveries = getReportDeliveries(deliveryCandidates);
  const deliveryRequests = [...new Map(deliveries.map((delivery) => [delivery.request.id, delivery.request])).values()];
  return {
    requests: state.report.type === 'deliveries' ? deliveryRequests : datedRequests,
    materials: aggregateReportMaterials(datedRequests),
    deliveries
  };
}

export function requestItemReportRows(request) {
  return (request.request_items || []).map((item) => {
    const requested = Number(item.requested_quantity || 0);
    const approved = Number(item.approved_quantity || 0);
    const delivered = deliveredQuantityForItem(request, item.id);
    const pending = Math.max(0, approved - delivered);
    return {
      id: item.id,
      material: item.material_name_snapshot || item.materials?.nome || 'Material não identificado',
      category: item.materials?.categoria || '—',
      unit: item.unit_snapshot || item.materials?.unidade || '—',
      requested,
      approved,
      delivered,
      pending,
      schoolNotes: item.school_notes || '',
      smeNotes: item.sme_notes || ''
    };
  });
}

export function renderRequestItemsReportBlock(request, { print = false } = {}) {
  const rows = requestItemReportRows(request);
  if (!rows.length) {
    return print
      ? '<p class="muted">Nenhum material vinculado a este pedido.</p>'
      : '<div class="request-items-detail empty">Nenhum material vinculado a este pedido.</div>';
  }
  const totals = rows.reduce((acc, row) => {
    acc.requested += row.requested;
    acc.approved += row.approved;
    acc.delivered += row.delivered;
    acc.pending += row.pending;
    return acc;
  }, { requested: 0, approved: 0, delivered: 0, pending: 0 });
  const tableClass = print ? '' : 'data-table report-items-table';
  const numClass = print ? 'num' : 'number-cell';
  const body = rows.map((row, index) => `
    <tr>
      <td data-label="#">${index + 1}</td>
      <td data-label="Material"><strong class="cell-title">${escapeHtml(row.material)}</strong><small class="cell-sub">${escapeHtml(row.category)}</small></td>
      <td data-label="Unidade">${escapeHtml(row.unit)}</td>
      <td class="${numClass}" data-label="Solicitado">${formatNumber(row.requested)}</td>
      <td class="${numClass}" data-label="Autorizado">${formatNumber(row.approved)}</td>
      <td class="${numClass}" data-label="Entregue">${formatNumber(row.delivered)}</td>
      <td class="${numClass}" data-label="Saldo">${formatNumber(row.pending)}</td>
      <td data-label="Observações">${escapeHtml([row.schoolNotes, row.smeNotes].filter(Boolean).join(' / ') || '—')}</td>
    </tr>`).join('');
  return `
    <div class="request-items-detail">
      ${print ? '' : '<div class="request-items-title">Produtos discriminados deste pedido</div>'}
      <table class="${tableClass}">
        <thead><tr><th>#</th><th>Material</th><th>Unidade</th><th>Solicitado</th><th>Autorizado</th><th>Entregue</th><th>Saldo</th><th>Observações</th></tr></thead>
        <tbody>${body}</tbody>
        <tfoot><tr><th colspan="3">Totais do pedido</th><th class="${numClass}">${formatNumber(totals.requested)}</th><th class="${numClass}">${formatNumber(totals.approved)}</th><th class="${numClass}">${formatNumber(totals.delivered)}</th><th class="${numClass}">${formatNumber(totals.pending)}</th><th></th></tr></tfoot>
      </table>
    </div>`;
}

export function renderReports() {
  const { requests, materials, deliveries } = getReportData();
  const totals = requests.reduce((acc, request) => {
    const itemTotals = requestTotals(request);
    acc.requested += itemTotals.requested;
    acc.approved += itemTotals.approved;
    acc.delivered += itemTotals.delivered;
    return acc;
  }, { requested: 0, approved: 0, delivered: 0 });
  const orderItemCount = requests.reduce((sum, request) => sum + (request.request_items?.length || 0), 0);
  const resultCountLabel = state.report.type === 'orders'
    ? `${requests.length} pedido(s) • ${orderItemCount} produto(s)`
    : `${state.report.type === 'materials' ? materials.length : deliveries.length} registros`;

  return `
    <div class="stack-lg reports-page">
      <section class="report-header-card">
        ${imageTag(institution().planningLogoUrl, 'Secretaria Municipal de Educação', 'report-header-mark', institution().compactLogoUrl)}
        <div class="report-header-copy"><span class="eyebrow light">Central de relatórios</span><h2>${isSchool() ? 'Informações da sua escola' : 'Indicadores da rede municipal'}</h2><p>Use os filtros para gerar demonstrativos prontos para impressão e exportação.</p></div>
        <div class="button-row"><button type="button" class="button ghost-light" data-action="export-report">${icon('download', 18)} Exportar CSV</button><button type="button" class="button light" data-action="print-report">${icon('print', 18)} Imprimir / PDF</button></div>
      </section>

      <section class="panel filter-panel">
        <div class="report-tabs">
          <button type="button" class="${state.report.type === 'orders' ? 'active' : ''}" data-action="report-type" data-type="orders">${icon('clipboard', 18)} Pedidos</button>
          <button type="button" class="${state.report.type === 'materials' ? 'active' : ''}" data-action="report-type" data-type="materials">${icon('box', 18)} Materiais</button>
          <button type="button" class="${state.report.type === 'deliveries' ? 'active' : ''}" data-action="report-type" data-type="deliveries">${icon('truck', 18)} Entregas</button>
        </div>
        <div class="filter-grid ${isSchool() ? 'three' : 'four'}">
          <label class="field"><span>Data inicial</span><input type="date" data-report-filter="startDate" value="${attr(state.report.startDate)}" /></label>
          <label class="field"><span>Data final</span><input type="date" data-report-filter="endDate" value="${attr(state.report.endDate)}" /></label>
          ${isSme() ? `<label class="field"><span>Escola</span><select data-report-filter="schoolId"><option value="all">Todas as escolas</option>${state.schools.map((school) => `<option value="${school.id}" ${selected(state.report.schoolId === school.id)}>${escapeHtml(school.nome)}</option>`).join('')}</select></label>` : ''}
          <label class="field"><span>Situação do pedido</span><select data-report-filter="status"><option value="all">Todas as situações</option>${Object.entries(STATUS).map(([key, value]) => `<option value="${key}" ${selected(state.report.status === key)}>${escapeHtml(isSchool() ? value.school : value.label)}</option>`).join('')}</select></label>
        </div>
      </section>

      <section class="stats-grid four">
        ${state.report.type === 'deliveries' ? (() => {
          const dispatchedQuantity = deliveries.reduce((sum, delivery) => sum + (delivery.delivery_items || []).reduce((itemSum, item) => itemSum + Number(item.quantity || 0), 0), 0);
          const receivedCount = deliveries.filter((delivery) => delivery.status === 'delivered').length;
          const pendingCount = deliveries.filter((delivery) => delivery.status === 'dispatched').length;
          return `${statCard('clipboard', 'Pedidos vinculados', String(requests.length), 'protocolos com remessa', 'primary')}${statCard('truck', 'Remessas no período', String(deliveries.length), `${pendingCount} em transporte`, 'cyan')}${statCard('box', 'Quantidade expedida', formatNumber(dispatchedQuantity), 'soma dos itens das remessas', 'blue')}${statCard('check', 'Remessas recebidas', String(receivedCount), 'recebimentos registrados', 'green')}`;
        })() : `${statCard('clipboard', 'Pedidos filtrados', String(requests.length), 'protocolos no período', 'primary')}${statCard('box', 'Quantidade solicitada', formatNumber(totals.requested), 'soma de todos os itens', 'blue')}${statCard('shield', 'Quantidade autorizada', formatNumber(totals.approved), 'aprovada pela SME', 'violet')}${statCard('check', 'Quantidade entregue', formatNumber(totals.delivered), `${deliveries.length} remessas`, 'green')}`}
      </section>

      <section class="panel report-results">
        <div class="panel-heading inline"><div><h3>${state.report.type === 'orders' ? 'Relatório detalhado de pedidos' : state.report.type === 'materials' ? 'Consolidado de materiais' : 'Relatório de entregas'}</h3><p>${state.report.type === 'orders' ? 'Cada pedido aparece com todos os produtos, quantidades solicitadas, autorizadas, entregues e saldo.' : `Período de ${formatDate(state.report.startDate)} a ${formatDate(state.report.endDate)}.`}</p></div><span class="count-pill">${resultCountLabel}</span></div>
        ${renderReportTable(state.report.type, requests, materials, deliveries)}
      </section>
    </div>`;
}

export function renderReportTable(type, requests, materials, deliveries) {
  if (type === 'orders') {
    const colspan = isSme() ? 7 : 6;
    return requests.length ? `<div class="table-wrap report-orders-wrap"><table class="data-table report-orders-table"><thead><tr><th>Protocolo</th>${isSme() ? '<th>Escola</th>' : ''}<th>Finalidade</th><th>Solicitado</th><th>Autorizado</th><th>Entregue</th><th>Situação</th></tr></thead><tbody>${requests.map((request) => {
      const totals = requestTotals(request);
      const itemsCount = request.request_items?.length || 0;
      return `<tr class="report-request-row"><td data-label="Protocolo"><button class="protocol-link" type="button" data-action="open-request" data-id="${request.id}">${escapeHtml(request.protocol_number)}</button><small class="cell-sub">${formatDate(request.submitted_at || request.created_at)} • ${itemsCount} produto(s)</small></td>${isSme() ? `<td data-label="Escola">${escapeHtml(request.schools?.nome || getSchoolName(request.school_id))}</td>` : ''}<td data-label="Finalidade"><strong class="cell-title">${escapeHtml(truncate(request.purpose, 75))}</strong><small class="cell-sub">${escapeHtml(PRIORITY[request.priority]?.label || request.priority || '')}</small></td><td class="number-cell" data-label="Solicitado">${formatNumber(totals.requested)}</td><td class="number-cell" data-label="Autorizado">${formatNumber(totals.approved)}</td><td class="number-cell" data-label="Entregue">${formatNumber(totals.delivered)}</td><td data-label="Situação">${statusBadge(request.status, isSchool() ? 'school' : 'default')}</td></tr><tr class="report-items-row"><td colspan="${colspan}">${renderRequestItemsReportBlock(request)}</td></tr>`;
    }).join('')}</tbody></table></div>` : renderEmptyState('report', 'Sem dados no período', 'Nenhum pedido corresponde aos filtros informados.');
  }

  if (type === 'materials') {
    return materials.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Material</th><th>Categoria</th><th>Unidade</th><th>Pedidos</th><th>Escolas</th><th>Solicitado</th><th>Autorizado</th><th>Entregue</th><th>Atendimento</th></tr></thead><tbody>${materials.map((item) => {
      const service = item.approved ? Math.min(100, (item.delivered / item.approved) * 100) : 0;
      return `<tr><td data-label="Material"><strong class="cell-title">${escapeHtml(item.material)}</strong></td><td data-label="Categoria">${escapeHtml(item.category || '—')}</td><td data-label="Unidade"><span class="unit-pill">${escapeHtml(item.unit)}</span></td><td data-label="Pedidos">${item.requests.size}</td><td data-label="Escolas">${item.schools.size}</td><td class="number-cell" data-label="Solicitado">${formatNumber(item.requested)}</td><td class="number-cell" data-label="Autorizado">${formatNumber(item.approved)}</td><td class="number-cell" data-label="Entregue">${formatNumber(item.delivered)}</td><td data-label="Atendimento"><div class="mini-progress"><span style="width:${service}%"></span></div><small class="cell-sub">${Math.round(service)}%</small></td></tr>`;
    }).join('')}</tbody></table></div>` : renderEmptyState('box', 'Sem materiais no período', 'Nenhum item corresponde aos filtros informados.');
  }

  return deliveries.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Remessa</th><th>Pedido</th>${isSme() ? '<th>Escola</th>' : ''}<th>Saída</th><th>Recebimento</th><th>Autorizado por</th><th>Entregador</th><th>Recebedor</th><th>Registro da saída</th><th>Registro do recebimento</th><th>Confirmação</th></tr></thead><tbody>${deliveries.map((delivery) => `<tr><td data-label="Remessa"><strong class="cell-title">${escapeHtml(delivery.delivery_number || '—')}</strong><small class="cell-sub">${escapeHtml(delivery.document_number || '')}</small></td><td data-label="Pedido">${escapeHtml(delivery.request.protocol_number)}</td>${isSme() ? `<td data-label="Escola">${escapeHtml(delivery.request.schools?.nome || getSchoolName(delivery.request.school_id))}</td>` : ''}<td data-label="Saída">${formatDate(delivery.dispatch_date || delivery.delivery_date)}</td><td data-label="Recebimento">${delivery.status === 'delivered' ? formatDate(delivery.receipt_date || delivery.delivery_date) : 'Pendente'}</td><td data-label="Autorizado por">${escapeHtml(delivery.request.authorized_by_name || '—')}</td><td data-label="Entregador">${escapeHtml(delivery.delivered_by_name || '—')}</td><td data-label="Recebedor">${escapeHtml(delivery.received_by_name || '—')}</td><td data-label="Registro da saída">${escapeHtml(delivery.registered_by_name || '—')}</td><td data-label="Registro do recebimento">${escapeHtml(delivery.receipt_registered_by_name || 'Pendente')}</td><td data-label="Confirmação">${delivery.school_confirmed_at ? formatDate(delivery.school_confirmed_at) : 'Pendente'}</td></tr>`).join('')}</tbody></table></div>` : renderEmptyState('truck', 'Sem entregas no período', 'Nenhuma remessa corresponde aos filtros informados.');
}
