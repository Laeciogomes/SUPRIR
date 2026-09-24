// View de acompanhamento das remessas expedidas pelo almoxarifado.
import { icon } from '../ui/icons.js';
import { escapeHtml, attr, formatDate, formatDateTime, selected } from '../utils/formatters.js';
import { state } from '../app/state.js';
import { statusBadge, getAllDeliveries } from '../app/helpers.js';
import { statCard } from './shell.js';
import { renderEmptyState } from './requests.js';

export function renderDeliveries() {
  const search = state.filters.deliverySearch.trim().toLowerCase();
  const deliveries = getAllDeliveries().filter((delivery) => {
    const matchesStatus = state.filters.deliveryStatus === 'all' || delivery.status === state.filters.deliveryStatus;
    const haystack = [
      delivery.delivery_number,
      delivery.document_number,
      delivery.request.protocol_number,
      delivery.school?.nome,
      delivery.registered_by_name,
      delivery.received_by_name,
      delivery.school_confirmed_by_name
    ].join(' ').toLowerCase();
    return matchesStatus && (!search || haystack.includes(search));
  });

  const awaitingSchool = deliveries.filter((delivery) => delivery.status === 'dispatched' && !delivery.school_confirmed_at).length;
  const received = deliveries.filter((delivery) => delivery.status === 'delivered').length;
  const total = deliveries.length;

  return `
    <div class="stack-lg">
      <section class="stats-grid three">
        ${statCard('truck', 'Aguardando escola', String(awaitingSchool), 'remessas enviadas', 'cyan')}
        ${statCard('check', 'Recebidas', String(received), 'confirmadas pelas escolas', 'green')}
        ${statCard('clipboard', 'Total de remessas', String(total), 'no filtro atual', 'primary')}
      </section>
      <section class="panel filter-panel">
        <div class="filter-grid three">
          <label class="field search-field"><span>Pesquisar</span><div class="input-with-icon">${icon('search', 18)}<input type="search" value="${attr(state.filters.deliverySearch)}" data-filter="deliverySearch" placeholder="Remessa, protocolo, escola..." /></div></label>
          <label class="field"><span>Situação da remessa</span><select data-filter="deliveryStatus"><option value="all">Todas</option><option value="dispatched" ${selected(state.filters.deliveryStatus === 'dispatched')}>Aguardando recebimento</option><option value="delivered" ${selected(state.filters.deliveryStatus === 'delivered')}>Recebida</option></select></label>
          <div class="filter-summary"><span>Resultados</span><strong>${deliveries.length}</strong><small>remessas encontradas</small></div>
        </div>
      </section>
      <section class="panel">
        <div class="panel-heading inline"><div><h3>Remessas registradas</h3><p>Acompanhe a saída do almoxarifado e a confirmação de recebimento feita pela escola.</p></div><button class="button secondary" type="button" data-action="refresh">${icon('refresh', 18)} Atualizar</button></div>
        ${deliveries.length ? `
          <div class="table-wrap"><table class="data-table"><thead><tr><th>Remessa</th><th>Pedido / escola</th><th>Saída</th><th>Recebimento</th><th>Responsáveis</th><th>Situação</th><th class="align-right">Ação</th></tr></thead><tbody>
            ${deliveries.map((delivery) => `<tr>
              <td data-label="Remessa"><strong class="cell-title">${escapeHtml(delivery.delivery_number || 'Sem número')}</strong><small class="cell-sub">${delivery.document_number ? `Documento ${escapeHtml(delivery.document_number)}` : 'Sem documento'}</small></td>
              <td data-label="Pedido / escola"><button type="button" class="protocol-link" data-action="open-request" data-id="${delivery.request.id}">${escapeHtml(delivery.request.protocol_number)}</button><small class="cell-sub">${escapeHtml(delivery.school?.nome || '—')}</small></td>
              <td data-label="Saída">${formatDate(delivery.dispatch_date || delivery.delivery_date)}<small class="cell-sub">${escapeHtml(delivery.registered_by_name || '—')}</small></td>
              <td data-label="Recebimento">${delivery.status === 'delivered' ? formatDate(delivery.receipt_date || delivery.delivery_date) : 'Aguardando'}<small class="cell-sub">${escapeHtml(delivery.received_by_name || 'Confirmação da escola pendente')}</small></td>
              <td data-label="Responsáveis"><strong class="cell-title">Autorização: ${escapeHtml(delivery.request.authorized_by_name || '—')}</strong><small class="cell-sub">Expedição: ${escapeHtml(delivery.registered_by_name || '—')} • Escola: ${escapeHtml(delivery.school_confirmed_by_name || 'pendente')}</small></td>
              <td data-label="Situação">${delivery.status === 'delivered' ? statusBadge('delivered') : statusBadge('dispatched')}${delivery.school_confirmed_at ? `<small class="cell-sub">Confirmado em ${formatDateTime(delivery.school_confirmed_at)}</small>` : '<small class="cell-sub">Aguardando confirmação da escola</small>'}</td>
              <td class="align-right" data-label="Ação"><div class="table-actions"><button type="button" class="button icon-only secondary" data-action="open-request" data-id="${delivery.request.id}" title="Abrir pedido">${icon('eye', 18)}</button></div></td>
            </tr>`).join('')}
          </tbody></table></div>` : renderEmptyState('truck', 'Nenhuma remessa encontrada', 'Não há remessas para os filtros informados.')}
      </section>
    </div>`;
}
