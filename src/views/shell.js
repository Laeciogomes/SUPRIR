// Views da "casca" da aplicação: navegação, cabeçalho, toast, aviso e
// roteamento entre as telas. Código MOVIDO de application.js sem alteração
// do HTML gerado.
import { CONFIG } from '../config/app-config.js';
import { PERMISSIONS } from '../constants/workflow.js';
import { icon } from '../ui/icons.js';
import { escapeHtml, attr, initials } from '../utils/formatters.js';
import { state } from '../app/state.js';
import {
  isSchool,
  isAdmin,
  imageTag,
  institution
} from '../app/helpers.js';
import { renderModal } from '../modals/index.js';
import {
  renderRequestDetail,
  renderRequestForm,
  renderRequestsList
} from './requests.js';
import { renderReports } from './reports.js';
import { renderProfile } from './profile.js';
import { renderSchoolDashboard, renderSmeDashboard } from './dashboards.js';
import { renderDeliveries } from './deliveries.js';
import { renderSchools } from './schools.js';
import { renderMaterials } from './materials.js';
import { renderUsers } from './users.js';
import { renderSettings } from './settings.js';

export const SCHOOL_NAV = [
  { id: 'dashboard', label: 'Visão geral', icon: 'dashboard' },
  { id: 'newRequest', label: 'Novo pedido', icon: 'plus' },
  { id: 'myRequests', label: 'Meus pedidos', icon: 'clipboard' },
  { id: 'reports', label: 'Relatórios', icon: 'report' },
  { id: 'profile', label: 'Meu perfil', icon: 'user' }
];

export function smeNav() {
  const items = [
    { id: 'dashboard', label: 'Painel da SME', icon: 'dashboard' },
    { id: 'requests', label: 'Pedidos', icon: 'clipboard', count: state.requests.filter((r) => r.status === 'submitted').length },
    { id: 'deliveries', label: 'Entregas', icon: 'truck', count: state.requests.flatMap((r) => r.deliveries || []).filter((d) => d.status === 'dispatched').length },
    { id: 'schools', label: 'Escolas', icon: 'school' },
    { id: 'materials', label: 'Materiais', icon: 'box' },
    { id: 'reports', label: 'Relatórios', icon: 'report' }
  ];
  if (isAdmin()) items.push({ id: 'users', label: 'Usuários', icon: 'users' }, { id: 'settings', label: 'Configurações', icon: 'settings' });
  items.push({ id: 'profile', label: 'Meu perfil', icon: 'user' });
  return items;
}

export function getViewMeta() {
  const school = {
    dashboard: ['Visão geral', 'Acompanhe os pedidos e entregas da sua escola.'],
    newRequest: [state.draft?.id ? 'Editar rascunho' : 'Novo pedido', 'Informe os materiais necessários e envie para análise da SME.'],
    myRequests: ['Meus pedidos', 'Consulte protocolos, situações, autorizações e entregas.'],
    reports: ['Relatórios da escola', 'Gere demonstrativos de pedidos e materiais recebidos.'],
    profile: ['Meu perfil', 'Confira seus dados de acesso e vínculo com a escola.'],
    requestDetail: ['Detalhes do pedido', 'Histórico completo desde a solicitação até a entrega.']
  };
  const sme = {
    dashboard: ['Painel da SME', 'Visão operacional dos pedidos, autorizações e entregas.'],
    requests: ['Gestão de pedidos', 'Receba, analise, autorize e acompanhe as solicitações das escolas.'],
    deliveries: ['Gestão de entregas', 'Controle remessas em transporte e recebimentos registrados.'],
    schools: ['Cadastro de escolas', 'Gerencie as unidades escolares atendidas pela rede.'],
    materials: ['Catálogo de materiais', 'Mantenha os materiais disponíveis para solicitação.'],
    reports: ['Relatórios gerenciais', 'Consolide dados por escola, período, situação e material.'],
    users: ['Usuários e acessos', 'Crie contas e controle permissões de escolas e SME.'],
    settings: ['Configurações institucionais', 'Defina os dados exibidos no sistema e nos relatórios.'],
    profile: ['Meu perfil', 'Confira seus dados e nível de permissão.'],
    requestDetail: ['Processamento do pedido', 'Analise os itens, registre decisões, remessas e recebimentos.']
  };
  const source = isSchool() ? school : sme;
  return source[state.view] || source.dashboard;
}

export function renderShell() {
  const inst = institution();
  const [title, subtitle] = getViewMeta();
  const nav = isSchool() ? SCHOOL_NAV : smeNav();
  const currentSchool = isSchool() ? state.schools.find((school) => school.id === state.profile.school_id) : null;

  return `
    <div class="app-shell ${state.mobileMenu ? 'menu-open' : ''}">
      <div class="mobile-scrim" data-action="close-mobile-menu"></div>
      <aside class="sidebar">
        <div class="sidebar-brand">
          ${imageTag(inst.logoUrl, 'Prefeitura Municipal de Canindé e Secretaria de Educação', 'sidebar-brand-full', CONFIG.logoFallbackUrl)}
          <button type="button" class="icon-button sidebar-close" data-action="close-mobile-menu">${icon('x', 20)}</button>
        </div>
        <div class="portal-label">
          <span>${isSchool() ? icon('school', 17) : icon('building', 17)}</span>
          <div><small>Portal</small><strong>${isSchool() ? 'Escola' : 'SME'}</strong></div>
        </div>
        ${currentSchool ? `<div class="school-context"><small>Unidade vinculada</small><strong>${escapeHtml(currentSchool.nome)}</strong>${currentSchool.inep ? `<span>INEP ${escapeHtml(currentSchool.inep)}</span>` : ''}</div>` : ''}
        <nav class="sidebar-nav">
          ${nav.map((item) => `
            <button type="button" class="nav-item ${state.view === item.id ? 'active' : ''}" data-action="navigate" data-view="${item.id}">
              <span class="nav-icon">${icon(item.icon, 20)}</span>
              <span>${escapeHtml(item.label)}</span>
              ${item.count ? `<b class="nav-count">${item.count}</b>` : ''}
            </button>`).join('')}
        </nav>
        <div class="sidebar-footer">
          <div class="sidebar-user">
            <div class="avatar">${escapeHtml(initials(state.profile.full_name || state.profile.email))}</div>
            <div><strong>${escapeHtml(state.profile.full_name || 'Usuário')}</strong><span>${escapeHtml(PERMISSIONS[state.profile.permission_level] || state.profile.email)}</span></div>
          </div>
          <button type="button" class="icon-button" data-action="logout" title="Sair">${icon('logout', 20)}</button>
        </div>
      </aside>

      <main class="main-area">
        <header class="topbar">
          <div class="topbar-title-wrap">
            <button type="button" class="icon-button mobile-menu-button" data-action="open-mobile-menu">${icon('menu', 22)}</button>
            <div><h1>${escapeHtml(title)}</h1><p>${escapeHtml(subtitle)}</p></div>
          </div>
          <div class="topbar-actions">
            ${!state.isStandaloneApp ? `<button type="button" class="button secondary install-app-button" data-action="install-app">${icon('smartphone', 17)} Instalar app</button>` : ''}
            <div class="date-chip">${icon('calendar', 17)} ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' }).format(new Date())}</div>
            <button type="button" class="user-chip" data-action="navigate" data-view="profile">
              <span class="avatar small">${escapeHtml(initials(state.profile.full_name || state.profile.email))}</span>
              <span><strong>${escapeHtml((state.profile.full_name || 'Usuário').split(' ')[0])}</strong><small>${isSchool() ? 'Escola' : 'SME'}</small></span>
            </button>
          </div>
        </header>
        <section class="content-area">
          ${renderCurrentView()}
        </section>
      </main>
      ${state.modal ? renderModal() : ''}
      ${state.notice ? renderNoticeModal() : ''}
      ${state.loading ? `<div class="loading-overlay"><div class="spinner large"></div><strong>Processando...</strong></div>` : ''}
      ${renderToast()}
    </div>`;
}

export function renderCurrentView() {
  if (state.view === 'requestDetail') return renderRequestDetail();
  if (state.view === 'reports') return renderReports();
  if (state.view === 'profile') return renderProfile();

  if (isSchool()) {
    if (state.view === 'newRequest') return renderRequestForm();
    if (state.view === 'myRequests') return renderRequestsList(true);
    return renderSchoolDashboard();
  }

  if (state.view === 'requests') return renderRequestsList(false);
  if (state.view === 'deliveries') return renderDeliveries();
  if (state.view === 'schools') return renderSchools();
  if (state.view === 'materials') return renderMaterials();
  if (state.view === 'users' && isAdmin()) return renderUsers();
  if (state.view === 'settings' && isAdmin()) return renderSettings();
  return renderSmeDashboard();
}

export function renderToast() {
  if (!state.toast) return '';
  const iconName = state.toast.type === 'success' ? 'check' : state.toast.type === 'warning' ? 'alert' : state.toast.type === 'error' ? 'alert' : 'info';
  return `<div class="toast toast-${attr(state.toast.type)}"><span>${icon(iconName, 20)}</span><p>${escapeHtml(state.toast.message)}</p><button type="button" class="icon-button inline" data-action="dismiss-toast">${icon('x', 17)}</button></div>`;
}

export function renderNoticeModal() {
  const notice = state.notice;
  if (!notice) return '';
  const iconName = notice.type === 'success' ? 'check' : notice.type === 'error' ? 'alert' : notice.type === 'warning' ? 'alert' : 'info';
  const confirmClass = notice.confirmTone === 'danger' || notice.type === 'error'
    ? 'danger'
    : notice.type === 'success'
      ? 'success'
      : 'primary';
  return `
    <div class="notice-backdrop" data-notice-backdrop>
      <section class="notice-modal notice-${attr(notice.type)}" role="alertdialog" aria-modal="true" aria-labelledby="notice-title">
        <button type="button" class="icon-button notice-close" data-action="close-notice" aria-label="Fechar aviso">${icon('x', 20)}</button>
        <div class="notice-icon">${icon(iconName, 28)}</div>
        <div class="notice-content">
          <h2 id="notice-title">${escapeHtml(notice.title)}</h2>
          <p>${escapeHtml(notice.message)}</p>
        </div>
        <div class="notice-actions">
          ${notice.showCancel ? `<button type="button" class="button secondary" data-action="close-notice">${escapeHtml(notice.cancelLabel)}</button>` : ''}
          <button type="button" class="button ${confirmClass}" data-action="${notice.onConfirm ? 'confirm-notice' : 'close-notice'}">${escapeHtml(notice.confirmLabel)}</button>
        </div>
      </section>
    </div>`;
}

export function statCard(iconName, label, value, note, tone = 'primary') {
  return `
    <article class="stat-card tone-${tone}">
      <div class="stat-icon">${icon(iconName, 22)}</div>
      <div class="stat-copy"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(note || '')}</small></div>
    </article>`;
}
