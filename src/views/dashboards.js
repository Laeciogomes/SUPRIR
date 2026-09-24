// Views dos painéis (dashboards) da escola e da SME. Código MOVIDO de
// application.js sem alteração do HTML gerado.
import { STATUS } from '../constants/workflow.js';
import { icon } from '../ui/icons.js';
import { escapeHtml, formatDate, todayISO } from '../utils/formatters.js';
import { state } from '../app/state.js';
import { internalRoleKey, getAllDeliveries } from '../app/helpers.js';
import { statCard } from './shell.js';
import { renderRequestTable, renderEmptyState } from './requests.js';

export function renderSchoolDashboard() {
  const requests = state.requests;
  const inProgress = requests.filter((r) => ['submitted', 'under_review', 'approved', 'preparing', 'dispatched', 'partially_delivered'].includes(r.status)).length;
  const delivered = requests.filter((r) => r.status === 'delivered').length;
  const awaitingConfirmation = requests.flatMap((r) => (r.deliveries || []).map((d) => ({ ...d, request: r })))
    .filter((d) => ['dispatched', 'delivered'].includes(d.status) && !d.school_confirmed_at && !String(d.delivery_number || '').startsWith('LEG-'));
  const thisYear = requests.filter((r) => String(r.created_at || '').startsWith(String(new Date().getFullYear()))).length;
  const recent = requests.slice(0, 6);

  return `
    <div class="page-grid">
      <section class="welcome-banner school-banner">
        <div>
          <span class="eyebrow light">Portal da escola</span>
          <h2>Olá, ${escapeHtml((state.profile.full_name || 'usuário').split(' ')[0])}.</h2>
          <p>Faça novos pedidos, acompanhe cada etapa e confirme as entregas recebidas pela unidade.</p>
          <div class="button-row">
            <button class="button light" type="button" data-action="new-request">${icon('plus', 18)} Fazer novo pedido</button>
            <button class="button ghost-light" type="button" data-action="navigate" data-view="myRequests">${icon('clipboard', 18)} Ver pedidos</button>
          </div>
        </div>
        <div class="banner-illustration">${icon('school', 72)}<span>${requests.length}</span><small>pedidos registrados</small></div>
      </section>

      <section class="stats-grid four">
        ${statCard('clipboard', 'Pedidos no ano', String(thisYear), 'protocolos registrados', 'primary')}
        ${statCard('clock', 'Em andamento', String(inProgress), 'aguardando conclusão', 'amber')}
        ${statCard('truck', 'A confirmar', String(awaitingConfirmation.length), 'entregas disponíveis', 'cyan')}
        ${statCard('check', 'Concluídos', String(delivered), 'pedidos totalmente entregues', 'green')}
      </section>

      ${awaitingConfirmation.length ? `
        <section class="panel attention-panel">
          <div class="panel-heading">
            <div><span class="eyebrow">Ação necessária</span><h3>Confirme as entregas recebidas</h3><p>Estas remessas foram enviadas pelo almoxarifado e aguardam a confirmação de recebimento da escola.</p></div>
            <span class="attention-count">${awaitingConfirmation.length}</span>
          </div>
          <div class="compact-list">
            ${awaitingConfirmation.slice(0, 4).map((delivery) => `
              <button type="button" class="compact-row" data-action="open-request" data-id="${delivery.request.id}">
                <span class="compact-icon">${icon('truck', 20)}</span>
                <span class="compact-main"><strong>${escapeHtml(delivery.delivery_number || 'Remessa')}</strong><small>${escapeHtml(delivery.request.protocol_number)} • enviada em ${formatDate(delivery.dispatch_date || delivery.delivery_date)}</small></span>
                <span class="badge badge-amber">Confirmar</span>${icon('chevron', 18)}
              </button>`).join('')}
          </div>
        </section>` : ''}

      <section class="panel span-2">
        <div class="panel-heading inline">
          <div><h3>Pedidos recentes</h3><p>Últimas solicitações registradas pela sua escola.</p></div>
          <button class="button secondary small" type="button" data-action="navigate" data-view="myRequests">Ver todos ${icon('chevron', 16)}</button>
        </div>
        ${recent.length ? renderRequestTable(recent, { showSchool: false, compact: true }) : renderEmptyState('clipboard', 'Nenhum pedido registrado', 'Crie o primeiro pedido de materiais da sua escola.', 'Novo pedido', 'new-request')}
      </section>

      <section class="panel process-panel">
        <div class="panel-heading"><div><h3>Como funciona</h3><p>O pedido fica visível em todas as etapas.</p></div></div>
        <div class="process-steps">
          ${[
            ['send', '1', 'Escola solicita', 'Escolha os materiais e envie o pedido.'],
            ['clipboard', '2', 'SME analisa', 'O pedido é recebido e conferido.'],
            ['shield', '3', 'SME autoriza', 'As quantidades aprovadas ficam registradas.'],
            ['truck', '4', 'Almoxarifado envia', 'Os materiais são separados e a remessa é expedida.'],
            ['check', '5', 'Escola confirma', 'A unidade valida o recebimento no sistema.']
          ].map(([iconName, number, title, text]) => `<article><span class="step-number">${number}</span><span class="step-icon">${icon(iconName, 20)}</span><div><strong>${title}</strong><p>${text}</p></div></article>`).join('')}
        </div>
      </section>
    </div>`;
}

export function renderSmeDashboard() {
  const role = internalRoleKey();
  const requests = state.requests;
  const deliveries = getAllDeliveries();


  if (role === 'authorizer') {
    const submitted = requests.filter((r) => r.status === 'submitted');
    const review = requests.filter((r) => r.status === 'under_review');
    const approvedMonth = requests.filter((r) => r.status === 'approved' && String(r.authorized_at || '').slice(0, 7) === todayISO().slice(0, 7)).length;
    const rejectedMonth = requests.filter((r) => r.status === 'rejected' && String(r.rejected_at || '').slice(0, 7) === todayISO().slice(0, 7)).length;
    const stockedMaterials = state.materials.filter((m) => m.ativo && Number(m.stock_quantity || 0) > 0).length;
    const queue = requests.filter((r) => ['submitted', 'under_review'].includes(r.status)).slice(0, 10);
    return `
      <div class="page-grid">
        <section class="welcome-banner sme-banner role-banner role-authorizer">
          <div>
            <span class="eyebrow light">SME • Análise e autorização</span>
            <h2>Pedidos aguardando decisão</h2>
            <p>Receba as solicitações das escolas, confira os itens e registre a decisão antes de encaminhar ao almoxarifado.</p>
            <div class="button-row"><button class="button light" type="button" data-action="navigate" data-view="requests">${icon('clipboard', 18)} Abrir fila de análise</button></div>
          </div>
          <div class="banner-kpis"><div><strong>${submitted.length}</strong><span>novos</span></div><div><strong>${review.length}</strong><span>em análise</span></div></div>
        </section>
        <section class="stats-grid five">
          ${statCard('mail', 'A receber', String(submitted.length), 'pedidos enviados pelas escolas', 'blue')}
          ${statCard('search', 'Em análise', String(review.length), 'aguardando decisão', 'amber')}
          ${statCard('box', 'Itens com estoque', String(stockedMaterials), 'materiais disponíveis agora', 'violet')}
          ${statCard('shield', 'Autorizados no mês', String(approvedMonth), 'liberados ao almoxarifado', 'green')}
          ${statCard('x', 'Rejeitados no mês', String(rejectedMonth), 'com justificativa registrada', 'slate')}
        </section>
        <section class="panel span-2">
          <div class="panel-heading inline"><div><h3>Fila de análise</h3><p>Pedidos que dependem de recebimento ou decisão da SME.</p></div><button class="button secondary small" type="button" data-action="navigate" data-view="requests">Ver todos ${icon('chevron', 16)}</button></div>
          ${queue.length ? renderRequestTable(queue, { showSchool: true, compact: true }) : renderEmptyState('check', 'Fila em dia', 'Não há pedidos aguardando análise neste momento.')}
        </section>
      </div>`;
  }

  if (role === 'warehouse') {
    const approved = requests.filter((r) => r.status === 'approved');
    const preparing = requests.filter((r) => r.status === 'preparing');
    const partial = requests.filter((r) => r.status === 'partially_delivered');
    const inTransit = deliveries.filter((d) => d.status === 'dispatched');
    const stockedMaterials = state.materials.filter((m) => m.ativo && Number(m.stock_quantity || 0) > 0).length;
    const queue = requests.filter((r) => ['approved', 'preparing', 'partially_delivered'].includes(r.status)).slice(0, 10);
    return `
      <div class="page-grid">
        <section class="welcome-banner sme-banner role-banner role-warehouse">
          <div>
            <span class="eyebrow light">Almoxarifado • Separação e expedição</span>
            <h2>Pedidos liberados para atendimento</h2>
            <p>Separe somente as quantidades autorizadas e registre a saída. A escola confirmará o recebimento no próprio portal.</p>
            <div class="button-row"><button class="button light" type="button" data-action="navigate" data-view="requests">${icon('archive', 18)} Abrir fila de separação</button><button class="button ghost-light" type="button" data-action="navigate" data-view="deliveries">${icon('truck', 18)} Ver remessas</button></div>
          </div>
          <div class="banner-kpis"><div><strong>${approved.length + preparing.length}</strong><span>para preparar</span></div><div><strong>${inTransit.length}</strong><span>em transporte</span></div></div>
        </section>
        <section class="stats-grid five">
          ${statCard('box', 'Itens com estoque', String(stockedMaterials), 'materiais disponíveis agora', 'blue')}
          ${statCard('shield', 'Autorizados', String(approved.length), 'aguardando separação', 'green')}
          ${statCard('archive', 'Em separação', String(preparing.length), 'em preparação física', 'violet')}
          ${statCard('truck', 'Em transporte', String(inTransit.length), 'remessas já expedidas', 'cyan')}
          ${statCard('clock', 'Saldo pendente', String(partial.length), 'pedidos com entrega parcial', 'amber')}
        </section>
        <section class="panel span-2">
          <div class="panel-heading inline"><div><h3>Fila do almoxarifado</h3><p>Pedidos autorizados com material ainda a separar ou expedir.</p></div><button class="button secondary small" type="button" data-action="navigate" data-view="requests">Abrir fila ${icon('chevron', 16)}</button></div>
          ${queue.length ? renderRequestTable(queue, { showSchool: true, compact: true }) : renderEmptyState('check', 'Fila em dia', 'Não há pedidos aguardando separação ou expedição.')}
        </section>
      </div>`;
  }

  const awaiting = requests.filter((r) => r.status === 'submitted');
  const review = requests.filter((r) => r.status === 'under_review');
  const authorized = requests.filter((r) => ['approved', 'preparing'].includes(r.status));
  const inTransit = deliveries.filter((d) => d.status === 'dispatched');
  const deliveredMonth = requests.filter((r) => r.status === 'delivered' && String(r.updated_at || '').slice(0, 7) === todayISO().slice(0, 7)).length;
  const schoolsWithOrders = new Set(requests.map((r) => r.school_id)).size;
  const queue = requests.filter((r) => ['submitted', 'under_review', 'approved', 'preparing', 'dispatched', 'partially_delivered'].includes(r.status)).slice(0, 8);
  const statusCounts = Object.keys(STATUS).map((status) => ({ status, count: requests.filter((r) => r.status === status).length })).filter((item) => item.count > 0);
  const maxCount = Math.max(1, ...statusCounts.map((item) => item.count));

  return `
    <div class="page-grid">
      <section class="welcome-banner sme-banner role-banner role-admin">
        <div>
          <span class="eyebrow light">Administração do sistema</span>
          <h2>SUPRIR Educação</h2>
          <p>Visão completa do fluxo entre escola, SME e almoxarifado, com confirmação de recebimento pela própria unidade escolar e trilha de auditoria.</p>
          <div class="button-row"><button class="button light" type="button" data-action="navigate" data-view="requests">${icon('clipboard', 18)} Ver pedidos</button><button class="button ghost-light" type="button" data-action="navigate" data-view="users">${icon('users', 18)} Gerenciar acessos</button></div>
        </div>
        <div class="banner-kpis"><div><strong>${awaiting.length}</strong><span>novos pedidos</span></div><div><strong>${inTransit.length}</strong><span>em transporte</span></div></div>
      </section>
      <section class="stats-grid five">
        ${statCard('mail', 'Aguardando SME', String(awaiting.length), 'pedidos novos', 'blue')}
        ${statCard('search', 'Em análise', String(review.length), 'em avaliação', 'amber')}
        ${statCard('archive', 'Para separar', String(authorized.length), 'autorizados / em separação', 'violet')}
        ${statCard('truck', 'Em transporte', String(inTransit.length), 'remessas abertas', 'cyan')}
        ${statCard('check', 'Entregues no mês', String(deliveredMonth), `${schoolsWithOrders} escolas atendidas`, 'green')}
      </section>
      <section class="panel span-2">
        <div class="panel-heading inline"><div><h3>Fluxo em andamento</h3><p>Pedidos que ainda não chegaram à conclusão.</p></div><button class="button secondary small" type="button" data-action="navigate" data-view="requests">Abrir gestão ${icon('chevron', 16)}</button></div>
        ${queue.length ? renderRequestTable(queue, { showSchool: true, compact: true }) : renderEmptyState('check', 'Operação em dia', 'Não há pedidos pendentes neste momento.')}
      </section>
      <section class="panel analytics-panel">
        <div class="panel-heading"><div><h3>Distribuição por situação</h3><p>${requests.length} pedidos no total.</p></div></div>
        <div class="status-bars">${statusCounts.length ? statusCounts.map((item) => `<div class="status-bar-row"><div><span>${escapeHtml(STATUS[item.status].label)}</span><strong>${item.count}</strong></div><div class="bar-track"><span class="bar-fill tone-${STATUS[item.status].tone}" style="width:${Math.max(7, (item.count / maxCount) * 100)}%"></span></div></div>`).join('') : '<p class="muted">Ainda não há dados para exibir.</p>'}</div>
      </section>
      <section class="panel workflow-panel span-3">
        <div class="panel-heading"><div><h3>Fluxo institucional</h3><p>Cada etapa possui uma responsabilidade definida e auditável.</p></div></div>
        <div class="workflow-lane">${[
          ['mail', 'SME recebe', awaiting.length, 'submitted'],
          ['search', 'SME analisa', review.length, 'under_review'],
          ['shield', 'Autorizado', requests.filter((r) => r.status === 'approved').length, 'approved'],
          ['archive', 'Almoxarifado', requests.filter((r) => r.status === 'preparing').length, 'preparing'],
          ['truck', 'Enviado', requests.filter((r) => r.status === 'dispatched').length, 'dispatched'],
          ['check', 'Concluído', requests.filter((r) => r.status === 'delivered').length, 'delivered']
        ].map(([iconName, label, count, status], index) => `<button type="button" class="workflow-node" data-action="filter-status" data-status="${status}"><span class="workflow-icon">${icon(iconName, 21)}</span><strong>${count}</strong><small>${label}</small>${index < 5 ? '<i></i>' : ''}</button>`).join('')}</div>
      </section>
    </div>`;
}

