import { state, render } from './state.js';
import { STATUS, PRIORITY } from '../constants/workflow.js';
import { escapeHtml, attr, formatDate, formatDateTime, formatNumber } from '../utils/formatters.js';
import { PRINT_STYLES } from '../styles/print-template.js';

// Geração de documentos para impressão extraída do monólito application.js.
// Código apenas MOVIDO: o HTML de impressão permanece idêntico.
// Os helpers de negócio/UI que continuam em application.js são injetados via
// initPrint(deps) para evitar dependência circular.

let deps = {
  institution: () => ({}),
  requestTotals: () => ({ requested: 0, approved: 0, delivered: 0 }),
  deliveredQuantityForItem: () => 0,
  getReportData: () => ({ requests: [], materials: [], deliveries: [] }),
  getSchoolName: () => '',
  isSchool: () => false,
  renderRequestItemsReportBlock: () => '',
  setToast: () => {}
};

export function initPrint(injected = {}) {
  deps = { ...deps, ...injected };
}

export function reportHeaderHtml(title, subtitle = '') {
  const inst = deps.institution();
  const logoUrl = (() => { try { return new URL(inst.logoUrl, window.location.origin).href; } catch { return inst.logoUrl; } })();
  return `<header class="print-header"><div class="print-header-brand"><img src="${attr(logoUrl)}" alt="Prefeitura Municipal de Canindé e Secretaria de Educação" /></div><div class="print-header-title"><span>${escapeHtml(inst.municipalityName)}</span><strong>${escapeHtml(inst.departmentName)}</strong><h1>${escapeHtml(title)}</h1>${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ''}</div></header>`;
}

export function printDocument(title, body) {
  const popup = window.open('', '_blank', 'width=1100,height=800');
  if (!popup) {
    deps.setToast('warning', 'O navegador bloqueou a janela de impressão. Libere pop-ups para este site.');
    render();
    return;
  }
  const inst = deps.institution();
  popup.document.open();
  popup.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>${PRINT_STYLES}</style></head><body>${body}<footer class="footer">${escapeHtml(inst.footerText || `${inst.departmentName} • Documento gerado em ${formatDateTime(new Date().toISOString())}`)}</footer><script>window.addEventListener('load',()=>setTimeout(()=>window.print(),350));<\/script></body></html>`);
  popup.document.close();
}

export function printRequest(request) {
  if (!request) return;
  const totals = deps.requestTotals(request);
  const body = `
    ${reportHeaderHtml('Relatório do Pedido', `${request.protocol_number} • ${request.schools?.nome || deps.getSchoolName(request.school_id)}`)}
    <div class="print-meta"><div><span>Protocolo</span><strong>${escapeHtml(request.protocol_number)}</strong></div><div><span>Situação</span><strong>${escapeHtml((deps.isSchool() ? STATUS[request.status]?.school : STATUS[request.status]?.label) || request.status)}</strong></div><div><span>Prioridade</span><strong>${escapeHtml(PRIORITY[request.priority]?.label || request.priority)}</strong></div><div><span>Data do pedido</span><strong>${formatDate(request.submitted_at || request.created_at)}</strong></div></div>
    <div class="print-box"><span class="print-label">Finalidade</span><strong>${escapeHtml(request.purpose)}</strong><p>${escapeHtml(request.notes || '')}</p></div>
    <h2>Materiais solicitados</h2>
    <table><thead><tr><th>Material</th><th>Unidade</th><th>Solicitado</th><th>Autorizado</th><th>Entregue</th><th>Observações</th></tr></thead><tbody>${(request.request_items || []).map((item) => `<tr><td>${escapeHtml(item.material_name_snapshot)}</td><td>${escapeHtml(item.unit_snapshot)}</td><td class="num">${formatNumber(item.requested_quantity)}</td><td class="num">${formatNumber(item.approved_quantity)}</td><td class="num">${formatNumber(deps.deliveredQuantityForItem(request, item.id))}</td><td>${escapeHtml([item.school_notes, item.sme_notes].filter(Boolean).join(' / ') || '—')}</td></tr>`).join('')}</tbody><tfoot><tr><th colspan="2">Totais</th><th class="num">${formatNumber(totals.requested)}</th><th class="num">${formatNumber(totals.approved)}</th><th class="num">${formatNumber(totals.delivered)}</th><th></th></tr></tfoot></table>
    <h2>Responsáveis</h2><div class="audit-grid"><div class="print-box"><span class="print-label">Registrado por</span><strong>${escapeHtml(request.created_by_name || '—')}</strong><p>${escapeHtml(request.created_by_email || '')}</p></div><div class="print-box"><span class="print-label">Recebido na SME por</span><strong>${escapeHtml(request.received_by_name || '—')}</strong><p>${request.received_at ? formatDateTime(request.received_at) : ''}</p></div><div class="print-box"><span class="print-label">Autorizado por</span><strong>${escapeHtml(request.authorized_by_name || '—')}</strong><p>${request.authorized_at ? formatDateTime(request.authorized_at) : ''}</p></div></div>
    ${(request.deliveries || []).length ? `<h2>Remessas e recebimentos</h2>${request.deliveries.map((delivery) => `<div class="delivery-block"><div class="delivery-head"><strong>${escapeHtml(delivery.delivery_number || 'Remessa')}</strong><span>${escapeHtml(delivery.status === 'delivered' ? 'Recebida' : 'Em transporte')}</span></div><div class="print-meta"><div><span>Saída</span><strong>${formatDate(delivery.dispatch_date || delivery.delivery_date)}</strong></div><div><span>Entregador</span><strong>${escapeHtml(delivery.delivered_by_name || '—')}</strong></div><div><span>Recebimento</span><strong>${delivery.status === 'delivered' ? formatDate(delivery.receipt_date || delivery.delivery_date) : 'Pendente'}</strong></div><div><span>Recebedor</span><strong>${escapeHtml(delivery.received_by_name || '—')}</strong></div></div><table><thead><tr><th>Material</th><th>Quantidade</th><th>Unidade</th></tr></thead><tbody>${(delivery.delivery_items || []).map((item) => `<tr><td>${escapeHtml(item.material_name_snapshot)}</td><td class="num">${formatNumber(item.quantity)}</td><td>${escapeHtml(item.unit_snapshot || '')}</td></tr>`).join('')}</tbody></table><p><strong>Registro da saída:</strong> ${escapeHtml(delivery.registered_by_name || '—')} • <strong>Registro do recebimento:</strong> ${escapeHtml(delivery.receipt_registered_by_name || '—')} • <strong>Confirmação da escola:</strong> ${delivery.school_confirmed_at ? formatDateTime(delivery.school_confirmed_at) : 'Pendente'}</p></div>`).join('')}` : ''}
    <div class="signature-grid"><div class="signature">Responsável da SME</div><div class="signature">Responsável da escola</div></div>`;
  printDocument(`Pedido ${request.protocol_number}`, body);
}

export function printCurrentReport() {
  const { requests, materials, deliveries } = deps.getReportData();
  const title = state.report.type === 'orders' ? 'Relatório de Pedidos' : state.report.type === 'materials' ? 'Relatório Consolidado de Materiais' : 'Relatório de Entregas';
  const selectedSchool = deps.isSchool() ? deps.getSchoolName(state.profile.school_id) : state.report.schoolId === 'all' ? 'Todas as escolas' : deps.getSchoolName(state.report.schoolId);
  let table = '';

  if (state.report.type === 'orders') {
    const summaryRows = requests.map((request) => {
      const t = deps.requestTotals(request);
      return `<tr><td>${escapeHtml(request.protocol_number)}</td><td>${escapeHtml(request.schools?.nome || deps.getSchoolName(request.school_id))}</td><td>${formatDate(request.submitted_at || request.created_at)}</td><td>${escapeHtml(STATUS[request.status]?.label || request.status)}</td><td class="num">${request.request_items?.length || 0}</td><td class="num">${formatNumber(t.requested)}</td><td class="num">${formatNumber(t.approved)}</td><td class="num">${formatNumber(t.delivered)}</td></tr>`;
    }).join('');
    const detailedRows = requests.map((request) => {
      const totals = deps.requestTotals(request);
      return `<section class="order-report-block"><h2>Pedido ${escapeHtml(request.protocol_number)}</h2><div class="print-meta"><div><span>Escola</span><strong>${escapeHtml(request.schools?.nome || deps.getSchoolName(request.school_id))}</strong></div><div><span>Data do pedido</span><strong>${formatDate(request.submitted_at || request.created_at)}</strong></div><div><span>Situação</span><strong>${escapeHtml(STATUS[request.status]?.label || request.status)}</strong></div><div><span>Produtos</span><strong>${request.request_items?.length || 0}</strong></div></div><div class="print-box"><span class="print-label">Finalidade</span><strong>${escapeHtml(request.purpose || '—')}</strong><p>${escapeHtml(request.notes || '')}</p></div>${deps.renderRequestItemsReportBlock(request, { print: true })}<div class="print-meta"><div><span>Total solicitado</span><strong>${formatNumber(totals.requested)}</strong></div><div><span>Total autorizado</span><strong>${formatNumber(totals.approved)}</strong></div><div><span>Total entregue</span><strong>${formatNumber(totals.delivered)}</strong></div><div><span>Saldo autorizado</span><strong>${formatNumber(Math.max(0, totals.approved - totals.delivered))}</strong></div></div><div class="audit-grid"><div class="print-box"><span class="print-label">Registrado por</span><strong>${escapeHtml(request.created_by_name || '—')}</strong><p>${escapeHtml(request.created_by_email || '')}</p></div><div class="print-box"><span class="print-label">Recebido na SME por</span><strong>${escapeHtml(request.received_by_name || '—')}</strong><p>${request.received_at ? formatDateTime(request.received_at) : ''}</p></div><div class="print-box"><span class="print-label">Autorizado por</span><strong>${escapeHtml(request.authorized_by_name || '—')}</strong><p>${request.authorized_at ? formatDateTime(request.authorized_at) : ''}</p></div></div></section>`;
    }).join('');
    table = `<h2>Resumo dos pedidos</h2><table><thead><tr><th>Protocolo</th><th>Escola</th><th>Data</th><th>Situação</th><th>Produtos</th><th>Solicitado</th><th>Autorizado</th><th>Entregue</th></tr></thead><tbody>${summaryRows}</tbody></table><h2>Produtos discriminados por pedido</h2>${detailedRows}`;
  } else if (state.report.type === 'materials') {
    table = `<table><thead><tr><th>Material</th><th>Unidade</th><th>Pedidos</th><th>Escolas</th><th>Solicitado</th><th>Autorizado</th><th>Entregue</th></tr></thead><tbody>${materials.map((item) => `<tr><td>${escapeHtml(item.material)}</td><td>${escapeHtml(item.unit)}</td><td class="num">${item.requests.size}</td><td class="num">${item.schools.size}</td><td class="num">${formatNumber(item.requested)}</td><td class="num">${formatNumber(item.approved)}</td><td class="num">${formatNumber(item.delivered)}</td></tr>`).join('')}</tbody></table>`;
  } else {
    table = `<table><thead><tr><th>Remessa</th><th>Pedido</th><th>Escola</th><th>Saída</th><th>Recebimento</th><th>Autorizado por</th><th>Entregador</th><th>Recebedor</th><th>Registro da saída</th><th>Registro do recebimento</th></tr></thead><tbody>${deliveries.map((delivery) => `<tr><td>${escapeHtml(delivery.delivery_number || '—')}</td><td>${escapeHtml(delivery.request.protocol_number)}</td><td>${escapeHtml(delivery.request.schools?.nome || deps.getSchoolName(delivery.request.school_id))}</td><td>${formatDate(delivery.dispatch_date || delivery.delivery_date)}</td><td>${delivery.status === 'delivered' ? formatDate(delivery.receipt_date || delivery.delivery_date) : 'Pendente'}</td><td>${escapeHtml(delivery.request.authorized_by_name || '—')}</td><td>${escapeHtml(delivery.delivered_by_name || '—')}</td><td>${escapeHtml(delivery.received_by_name || '—')}</td><td>${escapeHtml(delivery.registered_by_name || '—')}</td><td>${escapeHtml(delivery.receipt_registered_by_name || 'Pendente')}</td></tr>`).join('')}</tbody></table>`;
  }

  const body = `${reportHeaderHtml(title, `${selectedSchool} • ${formatDate(state.report.startDate)} a ${formatDate(state.report.endDate)}`)}<div class="print-meta"><div><span>Período inicial</span><strong>${formatDate(state.report.startDate)}</strong></div><div><span>Período final</span><strong>${formatDate(state.report.endDate)}</strong></div><div><span>Escola</span><strong>${escapeHtml(selectedSchool)}</strong></div><div><span>Registros</span><strong>${state.report.type === 'orders' ? requests.length : state.report.type === 'materials' ? materials.length : deliveries.length}</strong></div></div>${table || '<p>Nenhum registro encontrado.</p>'}`;
  printDocument(title, body);
}
