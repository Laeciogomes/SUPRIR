import { state, render } from '../app/state.js';
import { STATUS, PRIORITY } from '../constants/workflow.js';
import { formatDate, formatDateTime, formatNumber, todayISO } from '../utils/formatters.js';
import { createSchoolImportTemplate } from '../utils/csv.js';

// Geração/download de arquivos (CSV e texto) extraída do monólito
// application.js. Código apenas MOVIDO: nomes de arquivo e conteúdo CSV
// permanecem idênticos. Os helpers de negócio que continuam em application.js
// são injetados via initDownloads(deps) para evitar dependência circular.

let deps = {
  getReportData: () => ({ requests: [], materials: [], deliveries: [] }),
  getSchoolName: () => '',
  requestItemReportRows: () => [],
  setToast: () => {}
};

export function initDownloads(injected = {}) {
  deps = { ...deps, ...injected };
}

export function csvCell(value) {
  const text = String(value ?? '').replaceAll('"', '""');
  return `"${text}"`;
}

export function downloadCsv(filename, rows) {
  const csv = '\uFEFF' + rows.map((row) => row.map(csvCell).join(';')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function downloadTextFile(filename, content, type = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function downloadSchoolImportTemplate() {
  downloadTextFile('modelo-importacao-escolas.csv', `\uFEFF${createSchoolImportTemplate()}`, 'text/csv;charset=utf-8');
}

export function downloadSchoolImportReport() {
  if (state.modal?.type !== 'schoolImportResult') return;
  const rows = [['Código', 'Escola', 'Resultado', 'Escola criada', 'Senha atualizada', 'Observação']];
  for (const item of state.modal.results || []) {
    rows.push([
      item.loginCode,
      item.name,
      item.status === 'error' ? 'Erro' : item.status === 'created' ? 'Criado' : 'Atualizado',
      item.schoolCreated ? 'Sim' : 'Não',
      item.passwordUpdated ? 'Sim' : 'Não',
      item.message
    ]);
  }
  downloadCsv(`resultado-importacao-escolas-${todayISO()}.csv`, rows);
}

export function exportCurrentReport() {
  const { requests, materials, deliveries } = deps.getReportData();
  const stamp = `${state.report.startDate}_${state.report.endDate}`;

  if (state.report.type === 'orders') {
    const rows = [[
      'Protocolo', 'Escola', 'Data do pedido', 'Finalidade', 'Prioridade', 'Situação',
      'Material', 'Categoria', 'Unidade', 'Quantidade solicitada', 'Quantidade autorizada', 'Quantidade entregue', 'Saldo autorizado',
      'Observação da escola', 'Observação da SME', 'Registrado por', 'Recebido na SME por', 'Autorizado por'
    ]];
    requests.forEach((request) => {
      const itemRows = deps.requestItemReportRows(request);
      if (!itemRows.length) {
        rows.push([
          request.protocol_number,
          request.schools?.nome || deps.getSchoolName(request.school_id),
          formatDate(request.submitted_at || request.created_at),
          request.purpose,
          PRIORITY[request.priority]?.label,
          STATUS[request.status]?.label,
          '', '', '', '', '', '', '', '', '',
          request.created_by_name,
          request.received_by_name,
          request.authorized_by_name
        ]);
        return;
      }
      itemRows.forEach((item) => rows.push([
        request.protocol_number,
        request.schools?.nome || deps.getSchoolName(request.school_id),
        formatDate(request.submitted_at || request.created_at),
        request.purpose,
        PRIORITY[request.priority]?.label,
        STATUS[request.status]?.label,
        item.material,
        item.category,
        item.unit,
        formatNumber(item.requested),
        formatNumber(item.approved),
        formatNumber(item.delivered),
        formatNumber(item.pending),
        item.schoolNotes,
        item.smeNotes,
        request.created_by_name,
        request.received_by_name,
        request.authorized_by_name
      ]));
    });
    downloadCsv(`relatorio-pedidos-detalhado-${stamp}.csv`, rows);
  } else if (state.report.type === 'materials') {
    const rows = [['Material', 'Categoria', 'Unidade', 'Pedidos', 'Escolas', 'Solicitado', 'Autorizado', 'Entregue']];
    materials.forEach((item) => rows.push([item.material, item.category, item.unit, item.requests.size, item.schools.size, formatNumber(item.requested), formatNumber(item.approved), formatNumber(item.delivered)]));
    downloadCsv(`relatorio-materiais-${stamp}.csv`, rows);
  } else {
    const rows = [['Remessa', 'Pedido', 'Escola', 'Documento', 'Data da saída', 'Data do recebimento', 'Autorizado por', 'Entregador', 'Recebedor', 'Registro da saída', 'Registro do recebimento', 'Confirmação da escola']];
    deliveries.forEach((delivery) => rows.push([delivery.delivery_number, delivery.request.protocol_number, delivery.request.schools?.nome || deps.getSchoolName(delivery.request.school_id), delivery.document_number, formatDate(delivery.dispatch_date || delivery.delivery_date), delivery.status === 'delivered' ? formatDate(delivery.receipt_date || delivery.delivery_date) : '', delivery.request.authorized_by_name, delivery.delivered_by_name, delivery.received_by_name, delivery.registered_by_name, delivery.receipt_registered_by_name, delivery.school_confirmed_at ? formatDateTime(delivery.school_confirmed_at) : 'Pendente']));
    downloadCsv(`relatorio-entregas-${stamp}.csv`, rows);
  }
  deps.setToast('success', 'Arquivo CSV gerado.');
  render();
}
