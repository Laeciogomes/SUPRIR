import { createClient } from '@supabase/supabase-js';
import { CONFIG } from '../config/app-config.js';
import {
  buildSchoolLoginEmail,
  normalizeSchoolLogin,
  toSupabaseSchoolPassword,
  schoolLoginLabel
} from '../auth/school-credentials.js';
import { STATUS, PRIORITY, PERMISSIONS } from '../constants/workflow.js';
import { icon } from '../ui/icons.js';
import {
  escapeHtml,
  attr,
  formatDate,
  formatDateTime,
  formatNumber,
  todayISO,
  firstDayOfYearISO,
  truncate,
  initials,
  selected,
  checked
} from '../utils/formatters.js';
import { parseSchoolAccessCsv, createSchoolImportTemplate } from '../utils/csv.js';
import { PRINT_STYLES } from '../styles/print-template.js';

const app = document.querySelector('#app');
let supabase = null;
let deferredInstallPrompt = null;
let pwaListenersInstalled = false;
let installPromptWaiters = [];

const state = {
  session: null,
  profile: null,
  authError: null,
  loginPortal: localStorage.getItem('materiais_login_portal') || 'school',
  recoveryMode: false,
  view: 'dashboard',
  previousView: 'dashboard',
  mobileMenu: false,
  loading: false,
  toast: null,
  notice: null,
  canInstallApp: false,
  isStandaloneApp: typeof window !== 'undefined' && (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true),
  settings: null,
  schools: [],
  materials: [],
  requests: [],
  profiles: [],
  events: {},
  selectedRequestId: null,
  modal: null,
  draft: null,
  filters: {
    requestSearch: '',
    requestStatus: 'all',
    requestSchool: 'all',
    deliverySearch: '',
    deliveryStatus: 'all'
  },
  report: {
    type: 'orders',
    startDate: firstDayOfYearISO(),
    endDate: todayISO(),
    schoolId: 'all',
    status: 'all'
  }
};

function hasConfig() {
  return Boolean(CONFIG.supabaseUrl && CONFIG.supabaseAnonKey && CONFIG.supabaseUrl.includes('supabase'));
}

function setupPwaFeatures() {
  if (pwaListenersInstalled || typeof window === 'undefined') return;
  pwaListenersInstalled = true;

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch((error) => console.warn('Service worker não registrado:', error));
    });
  }

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    state.canInstallApp = true;
    const waiters = installPromptWaiters;
    installPromptWaiters = [];
    waiters.forEach((resolve) => resolve(event));
    render();
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    state.canInstallApp = false;
    state.isStandaloneApp = true;
    openNotice('success', 'Aplicativo instalado', 'O sistema foi instalado e poderá ser aberto pelo ícone na tela inicial do aparelho.');
    render();
  });
}

function waitForInstallPrompt(timeout = 1400) {
  if (deferredInstallPrompt) return Promise.resolve(deferredInstallPrompt);
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      installPromptWaiters = installPromptWaiters.filter((item) => item !== resolver);
      resolve(null);
    }, timeout);
    function resolver(event) {
      window.clearTimeout(timer);
      resolve(event);
    }
    installPromptWaiters.push(resolver);
  });
}

function getInstallContext() {
  const ua = navigator.userAgent || '';
  const isIOS = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /android/i.test(ua);
  const isChromium = /chrome|crios|edg|opr|samsungbrowser/i.test(ua);
  const isSecure = window.isSecureContext || ['localhost', '127.0.0.1'].includes(window.location.hostname);
  return { isIOS, isAndroid, isChromium, isSecure };
}

async function handleInstallApp() {
  if (state.isStandaloneApp) {
    openNotice('info', 'Aplicativo já instalado', 'Você já está usando o sistema no modo aplicativo.');
    render();
    return;
  }

  const promptEvent = deferredInstallPrompt || await waitForInstallPrompt();

  if (promptEvent) {
    deferredInstallPrompt = promptEvent;
    try {
      deferredInstallPrompt.prompt();
      const choice = await deferredInstallPrompt.userChoice.catch(() => null);
      deferredInstallPrompt = null;
      state.canInstallApp = false;
      if (choice?.outcome === 'accepted') {
        openNotice('success', 'Instalação iniciada', 'Conclua a instalação pelo navegador. Depois, abra o sistema pelo ícone criado no aparelho.');
      } else {
        state.modal = { type: 'installApp', reason: 'cancelled' };
      }
    } catch (error) {
      deferredInstallPrompt = null;
      state.modal = { type: 'installApp', reason: 'blocked', message: friendlyError(error) };
    }
    render();
    return;
  }

  const context = getInstallContext();
  state.modal = {
    type: 'installApp',
    reason: context.isIOS ? 'ios' : context.isSecure ? 'manual' : 'insecure',
    canTryAgain: context.isAndroid || context.isChromium
  };
  render();
}

function isSchool() {
  return state.profile?.account_type === 'school';
}

function isSme() {
  return state.profile?.account_type === 'sme';
}

function isManager() {
  return ['sme_manager', 'sme_admin'].includes(state.profile?.permission_level);
}

function isAdmin() {
  return state.profile?.permission_level === 'sme_admin';
}


function imageTag(src, alt, className = '', fallbackSrc = CONFIG.logoFallbackUrl || CONFIG.compactLogoUrl) {
  const primary = src || fallbackSrc || '';
  const fallback = fallbackSrc || CONFIG.logoFallbackUrl || CONFIG.compactLogoUrl || '';
  const classAttr = className ? ` class="${attr(className)}"` : '';
  const errorAttr = fallback && fallback !== primary ? ` onerror="this.onerror=null;this.src='${attr(fallback)}';"` : '';
  return `<img src="${attr(primary)}" alt="${attr(alt)}"${classAttr}${errorAttr} />`;
}

function institution() {
  return {
    municipalityName: state.settings?.municipality_name || CONFIG.municipalityName,
    departmentName: state.settings?.department_name || CONFIG.departmentName,
    logoUrl: state.settings?.logo_url || CONFIG.logoUrl,
    compactLogoUrl: state.settings?.compact_logo_url || CONFIG.compactLogoUrl,
    planningLogoUrl: state.settings?.planning_logo_url || CONFIG.planningLogoUrl,
    reportTitle: state.settings?.report_title || CONFIG.reportTitle,
    address: state.settings?.address || '',
    phone: state.settings?.phone || '',
    email: state.settings?.email || '',
    footerText: state.settings?.footer_text || ''
  };
}

function statusBadge(status, context = 'default') {
  const config = STATUS[status] || { label: status || '—', tone: 'slate' };
  const label = context === 'school' ? config.school : config.label;
  return `<span class="badge badge-${config.tone}"><span class="badge-dot"></span>${escapeHtml(label)}</span>`;
}

function priorityBadge(priority) {
  const config = PRIORITY[priority] || PRIORITY.normal;
  return `<span class="badge badge-${config.tone}">${escapeHtml(config.label)}</span>`;
}

function noticeTitle(type) {
  if (type === 'success') return 'Operação concluída';
  if (type === 'warning') return 'Atenção';
  if (type === 'error') return 'Não foi possível continuar';
  return 'Informação';
}

function openNotice(type, title, message, options = {}) {
  state.toast = null;
  state.notice = {
    type: type || 'info',
    title: title || noticeTitle(type),
    message: String(message || ''),
    confirmLabel: options.confirmLabel || 'Entendi',
    cancelLabel: options.cancelLabel || 'Cancelar',
    onConfirm: options.onConfirm || null,
    showCancel: Boolean(options.showCancel),
    confirmTone: options.confirmTone || type || 'primary'
  };
}

function openConfirm({ title, message, confirmLabel = 'Confirmar', cancelLabel = 'Cancelar', tone = 'primary', onConfirm }) {
  openNotice(tone === 'danger' ? 'error' : 'warning', title, message, {
    showCancel: true,
    confirmLabel,
    cancelLabel,
    confirmTone: tone,
    onConfirm
  });
}

function setToast(type, message) {
  openNotice(type, noticeTitle(type), message);
}

function friendlyError(error) {
  const message = String(error?.message || error || 'Ocorreu um erro inesperado.');
  const replacements = [
    ['Invalid login credentials', state.loginPortal === 'school' ? 'Código da escola ou senha incorretos.' : 'E-mail ou senha incorretos.'],
    ['Email not confirmed', 'O acesso ainda não foi confirmado.'],
    ['User already registered', 'Este acesso já está cadastrado.'],
    ['Failed to fetch', 'Não foi possível conectar ao servidor. Verifique sua internet.']
  ];
  const match = replacements.find(([source]) => message.includes(source));
  return match ? match[1] : message.replace(/^Error:\s*/i, '');
}

async function initialize() {
  document.title = `${CONFIG.reportTitle} | Canindé`;
  setupPwaFeatures();

  if (!hasConfig()) {
    render();
    return;
  }

  supabase = createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });

  const { data, error } = await supabase.auth.getSession();
  if (error) setToast('error', friendlyError(error));
  state.session = data?.session || null;

  if (state.session) await loadAuthenticatedData(false);
  render();

  supabase.auth.onAuthStateChange(async (event, session) => {
    state.session = session;
    if (event === 'PASSWORD_RECOVERY') state.recoveryMode = true;

    if (!session) {
      resetSecureState();
      render();
      return;
    }

    if (!state.profile || state.profile.id !== session.user.id) {
      await loadAuthenticatedData(false);
      render();
    }
  });
}

function resetSecureState() {
  state.profile = null;
  state.authError = null;
  state.settings = null;
  state.schools = [];
  state.materials = [];
  state.requests = [];
  state.profiles = [];
  state.events = {};
  state.selectedRequestId = null;
  state.modal = null;
  state.draft = null;
  state.view = 'dashboard';
}

async function loadAuthenticatedData(showLoading = true) {
  if (!state.session) return;
  if (showLoading) {
    state.loading = true;
    render();
  }

  try {
    state.authError = null;
    const userId = state.session.user.id;
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (profileError) throw profileError;
    if (!profile) throw new Error('Perfil do usuário não encontrado. Execute o SQL da versão 4 no Supabase.');
    if (!profile.active) {
      await supabase.auth.signOut();
      throw new Error('Este acesso foi desativado pelo administrador.');
    }

    state.profile = profile;

    const [settingsResult, schoolsResult, materialsResult, requestsResult] = await Promise.all([
      supabase.from('system_settings').select('*').eq('id', 1).maybeSingle(),
      supabase.from('schools').select('*').order('nome', { ascending: true }),
      supabase.from('materials').select('*').order('nome', { ascending: true }),
      fetchRequests()
    ]);

    if (settingsResult.error) throw settingsResult.error;
    if (schoolsResult.error) throw schoolsResult.error;
    if (materialsResult.error) throw materialsResult.error;
    if (requestsResult.error) throw requestsResult.error;

    state.settings = settingsResult.data || null;
    state.schools = schoolsResult.data || [];
    state.materials = materialsResult.data || [];
    state.requests = normalizeRequests(requestsResult.data || []);

    if (profile.account_type === 'sme' && profile.permission_level === 'sme_admin') {
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .order('full_name', { ascending: true });
      if (profilesError) throw profilesError;
      state.profiles = profiles || [];
    } else {
      state.profiles = [];
    }

    if (isSchool() && !profile.school_id) {
      setToast('warning', 'Seu usuário ainda não está vinculado a uma escola. Solicite o ajuste à SME.');
    }
  } catch (error) {
    console.error(error);
    state.authError = friendlyError(error);
    setToast('error', state.authError);
  } finally {
    state.loading = false;
  }
}

function fetchRequests() {
  return supabase
    .from('requests')
    .select(`
      *,
      schools (id, nome, inep, codigo, diretor, telefone, email, endereco, bairro),
      request_items (
        *,
        materials (id, nome, unidade, categoria, codigo)
      ),
      deliveries (
        *,
        delivery_items (
          *,
          materials (id, nome, unidade, categoria, codigo)
        )
      )
    `)
    .order('created_at', { ascending: false })
    .limit(1000);
}

function normalizeRequests(requests) {
  return requests.map((request) => ({
    ...request,
    request_items: [...(request.request_items || [])].sort((a, b) =>
      String(a.material_name_snapshot || a.materials?.nome || '').localeCompare(String(b.material_name_snapshot || b.materials?.nome || ''), 'pt-BR')
    ),
    deliveries: [...(request.deliveries || [])]
      .map((delivery) => ({ ...delivery, delivery_items: delivery.delivery_items || [] }))
      .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
  }));
}

async function refreshData(message = null) {
  await loadAuthenticatedData(true);
  if (message) setToast('success', message);
  render();
}

async function loadRequestEvents(requestId) {
  const { data, error } = await supabase
    .from('request_events')
    .select('*')
    .eq('request_id', requestId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  state.events[requestId] = data || [];
}

function getRequest(requestId = state.selectedRequestId) {
  return state.requests.find((request) => request.id === requestId) || null;
}

function getSchool(schoolId) {
  return state.schools.find((school) => school.id === schoolId) || null;
}

function getSchoolName(schoolId) {
  return getSchool(schoolId)?.nome || 'Escola não identificada';
}

function getSchoolLoginCode(schoolId) {
  return schoolLoginLabel(getSchool(schoolId)) || 'Não cadastrado';
}

function profileLoginLabel(profile) {
  return profile?.account_type === 'school'
    ? `Código ${getSchoolLoginCode(profile.school_id)}`
    : (profile?.email || '');
}

function deliveredQuantityForItem(request, requestItemId, includeDispatched = false) {
  return (request.deliveries || []).reduce((total, delivery) => {
    const allowed = includeDispatched
      ? ['dispatched', 'delivered'].includes(delivery.status)
      : delivery.status === 'delivered';
    if (!allowed) return total;
    return total + (delivery.delivery_items || [])
      .filter((item) => item.request_item_id === requestItemId)
      .reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  }, 0);
}

function requestTotals(request) {
  const requested = (request.request_items || []).reduce((sum, item) => sum + Number(item.requested_quantity || 0), 0);
  const approved = (request.request_items || []).reduce((sum, item) => sum + Number(item.approved_quantity || 0), 0);
  const delivered = (request.request_items || []).reduce((sum, item) => sum + deliveredQuantityForItem(request, item.id), 0);
  return { requested, approved, delivered };
}

function render() {
  if (!hasConfig()) {
    app.innerHTML = renderConfigMissing();
    return;
  }

  if (!state.session) {
    app.innerHTML = renderLogin();
    return;
  }

  if (!state.profile) {
    app.innerHTML = state.authError ? renderAuthError() : renderLoadingScreen();
    return;
  }

  if (state.recoveryMode || state.profile.must_change_password) {
    app.innerHTML = renderPasswordChange();
    return;
  }

  app.innerHTML = renderShell();
}

function renderConfigMissing() {
  return `
    <main class="center-page">
      <section class="setup-card">
        <div class="setup-icon">${icon('settings', 34)}</div>
        <span class="eyebrow">Configuração necessária</span>
        <h1>Conecte o sistema ao Supabase</h1>
        <p>Crie o arquivo <code>.env.local</code> na raiz do projeto e informe a URL e a chave pública do projeto.</p>
        <pre>VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_SUA_CHAVE</pre>
        <p class="subtle">Depois, reinicie o comando <strong>npm run dev</strong>.</p>
      </section>
    </main>`;
}

function renderLoadingScreen() {
  const inst = institution();
  return `
    <main class="center-page">
      <section class="loading-card">
        ${imageTag(inst.compactLogoUrl, 'Brasão de Canindé', 'loading-logo')}
        <div class="spinner large"></div>
        <h2>Carregando seu ambiente</h2>
        <p>Estamos preparando os pedidos e permissões do seu acesso.</p>
      </section>
    </main>`;
}

function renderAuthError() {
  const inst = institution();
  return `
    <main class="center-page">
      <section class="setup-card auth-error-card">
        ${imageTag(inst.compactLogoUrl, 'Brasão de Canindé', 'loading-logo')}
        <div class="setup-icon danger">${icon('alert', 32)}</div>
        <span class="eyebrow">Não foi possível abrir o ambiente</span>
        <h1>Verifique a configuração do acesso</h1>
        <p>${escapeHtml(state.authError || 'O perfil do usuário não pôde ser carregado.')}</p>
        <div class="button-row auth-error-actions">
          <button type="button" class="button primary" data-action="retry-auth">${icon('refresh', 18)} Tentar novamente</button>
          <button type="button" class="button secondary" data-action="logout">${icon('logout', 18)} Voltar ao login</button>
        </div>
      </section>
      ${state.modal ? renderModal() : ''}
      ${state.notice ? renderNoticeModal() : ''}
      ${renderToast()}
    </main>`;
}

function renderLogin() {
  const inst = institution();
  const schoolActive = state.loginPortal === 'school';
  const loginField = schoolActive
    ? `<label class="field"><span>Código da escola</span><div class="input-with-icon">${icon('school', 18)}<input type="text" name="login" inputmode="numeric" autocomplete="username" maxlength="20" placeholder="Ex.: 23047135" required /></div><small>Use o código de acesso fornecido pela SME.</small></label>`
    : `<label class="field"><span>E-mail institucional</span><div class="input-with-icon">${icon('mail', 18)}<input type="email" name="login" autocomplete="username" placeholder="nome@municipio.gov.br" required /></div></label>`;
  return `
    <main class="login-page">
      <section class="login-brand-panel">
        <div class="login-brand-top">
          ${imageTag(inst.logoUrl, 'Prefeitura Municipal de Canindé e Secretaria de Educação', 'brand-logo-horizontal', CONFIG.logoFallbackUrl)}
        </div>
        ${imageTag(inst.planningLogoUrl, 'Brasão de Canindé', 'login-brand-seal', inst.compactLogoUrl)}
        <div class="login-hero-copy">
          <span class="eyebrow light">Gestão integrada de materiais</span>
          <h2>Do pedido da escola à confirmação da entrega.</h2>
          <p>Um fluxo seguro e rastreável para solicitar, analisar, autorizar, separar, entregar e acompanhar materiais escolares.</p>
        </div>
        <div class="login-feature-grid">
          <article>${icon('clipboard', 22)}<div><strong>Pedidos digitais</strong><span>Protocolo e acompanhamento em tempo real</span></div></article>
          <article>${icon('shield', 22)}<div><strong>Auditoria completa</strong><span>Quem pediu, recebeu, autorizou e registrou</span></div></article>
          <article>${icon('truck', 22)}<div><strong>Entrega controlada</strong><span>Remessas parciais e confirmação de recebimento</span></div></article>
          <article>${icon('report', 22)}<div><strong>Relatórios gerenciais</strong><span>Por escola, período, situação e material</span></div></article>
        </div>
        <div class="login-brand-footer">Sistema institucional • acesso restrito a usuários autorizados</div>
      </section>

      <section class="login-form-panel">
        <div class="login-mobile-brand">
          ${imageTag(inst.compactLogoUrl, 'Brasão de Canindé')}
          <div><strong>Prefeitura Municipal de Canindé</strong><span>${escapeHtml(inst.departmentName)}</span></div>
        </div>
        <div class="login-card">
          <div class="login-card-heading">
            <span class="eyebrow">Acesso ao sistema</span>
            <h2>Bem-vindo</h2>
            <p>Selecione seu ambiente e entre com o acesso fornecido pela SME.</p>
          </div>

          <div class="portal-switch" role="tablist" aria-label="Tipo de acesso">
            <button type="button" class="portal-option ${schoolActive ? 'active' : ''}" data-action="choose-portal" data-portal="school">
              <span class="portal-option-icon">${icon('school', 22)}</span>
              <span><strong>Escola</strong><small>Fazer e acompanhar pedidos</small></span>
            </button>
            <button type="button" class="portal-option ${!schoolActive ? 'active' : ''}" data-action="choose-portal" data-portal="sme">
              <span class="portal-option-icon">${icon('building', 22)}</span>
              <span><strong>SME</strong><small>Analisar, autorizar e entregar</small></span>
            </button>
          </div>

          <form id="login-form" class="form-stack">
            ${loginField}
            <label class="field">
              <span>Senha</span>
              <div class="input-with-icon password-wrap">${icon('lock', 18)}<input type="password" name="password" autocomplete="current-password" placeholder="Digite sua senha" required /><button type="button" class="icon-button inline" data-action="toggle-password" aria-label="Mostrar ou ocultar senha">${icon('eye', 18)}</button></div>
            </label>
            <button class="button primary large full" type="submit">${icon('lock', 18)} Entrar no portal ${schoolActive ? 'da escola' : 'da SME'}</button>
            <button class="text-button" type="button" data-action="forgot-password">${schoolActive ? 'Preciso redefinir a senha' : 'Esqueci minha senha'}</button>
          </form>
          <div class="login-help">${schoolActive ? 'No primeiro acesso, informe o código da escola e o PIN temporário. O sistema solicitará uma nova senha pessoal.' : 'Acesso restrito à equipe da SME com e-mail institucional.'}</div>
          ${!state.isStandaloneApp ? `<button class="text-button install-login-button" type="button" data-action="install-app">${icon('smartphone', 17)} Instalar como aplicativo</button>` : ''}
        </div>
      </section>
      ${state.loading ? `<div class="loading-overlay"><div class="spinner large"></div><strong>Autenticando...</strong></div>` : ''}
      ${state.modal ? renderModal() : ''}
      ${state.notice ? renderNoticeModal() : ''}
      ${renderToast()}
    </main>`;
}

function renderPasswordChange() {
  const inst = institution();
  return `
    <main class="center-page password-page">
      <section class="password-card">
        ${imageTag(inst.compactLogoUrl, 'Brasão de Canindé', 'password-logo')}
        <div class="setup-icon">${icon('key', 30)}</div>
        <span class="eyebrow">Proteção da conta</span>
        <h1>Crie uma nova senha</h1>
        <p>${state.recoveryMode ? 'Defina uma nova senha para recuperar seu acesso.' : 'Esta é uma senha temporária. Para continuar, cadastre uma senha de uso pessoal.'}</p>
        <form id="password-change-form" class="form-stack">
          <label class="field">
            <span>Nova senha</span>
            <div class="input-with-icon password-wrap">${icon('lock', 18)}<input type="password" name="password" minlength="8" autocomplete="new-password" required /><button type="button" class="icon-button inline" data-action="toggle-password">${icon('eye', 18)}</button></div>
            <small>Use ao menos 8 caracteres, com letras e números.</small>
          </label>
          <label class="field">
            <span>Confirmar nova senha</span>
            <div class="input-with-icon password-wrap">${icon('lock', 18)}<input type="password" name="confirmPassword" minlength="8" autocomplete="new-password" required /><button type="button" class="icon-button inline" data-action="toggle-password">${icon('eye', 18)}</button></div>
          </label>
          <button class="button primary large full" type="submit">${icon('check', 18)} Salvar nova senha</button>
          <button class="text-button" type="button" data-action="logout">Sair desta conta</button>
        </form>
      </section>
      ${state.modal ? renderModal() : ''}
      ${state.notice ? renderNoticeModal() : ''}
      ${renderToast()}
    </main>`;
}

const SCHOOL_NAV = [
  { id: 'dashboard', label: 'Visão geral', icon: 'dashboard' },
  { id: 'newRequest', label: 'Novo pedido', icon: 'plus' },
  { id: 'myRequests', label: 'Meus pedidos', icon: 'clipboard' },
  { id: 'reports', label: 'Relatórios', icon: 'report' },
  { id: 'profile', label: 'Meu perfil', icon: 'user' }
];

function smeNav() {
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

function getViewMeta() {
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

function renderShell() {
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

function renderCurrentView() {
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

function renderToast() {
  if (!state.toast) return '';
  const iconName = state.toast.type === 'success' ? 'check' : state.toast.type === 'warning' ? 'alert' : state.toast.type === 'error' ? 'alert' : 'info';
  return `<div class="toast toast-${attr(state.toast.type)}"><span>${icon(iconName, 20)}</span><p>${escapeHtml(state.toast.message)}</p><button type="button" class="icon-button inline" data-action="dismiss-toast">${icon('x', 17)}</button></div>`;
}

function renderNoticeModal() {
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

function statCard(iconName, label, value, note, tone = 'primary') {
  return `
    <article class="stat-card tone-${tone}">
      <div class="stat-icon">${icon(iconName, 22)}</div>
      <div class="stat-copy"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(note || '')}</small></div>
    </article>`;
}

function renderSchoolDashboard() {
  const requests = state.requests;
  const inProgress = requests.filter((r) => ['submitted', 'under_review', 'approved', 'preparing', 'dispatched', 'partially_delivered'].includes(r.status)).length;
  const delivered = requests.filter((r) => r.status === 'delivered').length;
  const awaitingConfirmation = requests.flatMap((r) => (r.deliveries || []).map((d) => ({ ...d, request: r })))
    .filter((d) => d.status === 'delivered' && !d.school_confirmed_at && !String(d.delivery_number || '').startsWith('LEG-'));
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
            <div><span class="eyebrow">Ação necessária</span><h3>Confirme as entregas recebidas</h3><p>Estas remessas já foram registradas pela SME e aguardam validação da escola.</p></div>
            <span class="attention-count">${awaitingConfirmation.length}</span>
          </div>
          <div class="compact-list">
            ${awaitingConfirmation.slice(0, 4).map((delivery) => `
              <button type="button" class="compact-row" data-action="open-request" data-id="${delivery.request.id}">
                <span class="compact-icon">${icon('truck', 20)}</span>
                <span class="compact-main"><strong>${escapeHtml(delivery.delivery_number || 'Remessa')}</strong><small>${escapeHtml(delivery.request.protocol_number)} • ${formatDate(delivery.receipt_date || delivery.delivery_date)}</small></span>
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
            ['shield', '3', 'Gestor autoriza', 'As quantidades aprovadas ficam registradas.'],
            ['truck', '4', 'SME entrega', 'A remessa e o recebedor são informados.'],
            ['check', '5', 'Escola confirma', 'A unidade valida o recebimento no sistema.']
          ].map(([iconName, number, title, text]) => `<article><span class="step-number">${number}</span><span class="step-icon">${icon(iconName, 20)}</span><div><strong>${title}</strong><p>${text}</p></div></article>`).join('')}
        </div>
      </section>
    </div>`;
}

function renderSmeDashboard() {
  const requests = state.requests;
  const awaiting = requests.filter((r) => r.status === 'submitted');
  const review = requests.filter((r) => r.status === 'under_review');
  const authorized = requests.filter((r) => ['approved', 'preparing'].includes(r.status));
  const inTransit = requests.flatMap((r) => (r.deliveries || []).map((d) => ({ ...d, request: r }))).filter((d) => d.status === 'dispatched');
  const deliveredMonth = requests.filter((r) => r.status === 'delivered' && String(r.updated_at || '').slice(0, 7) === todayISO().slice(0, 7)).length;
  const schoolsWithOrders = new Set(requests.map((r) => r.school_id)).size;
  const queue = requests.filter((r) => ['submitted', 'under_review', 'approved', 'preparing', 'dispatched', 'partially_delivered'].includes(r.status)).slice(0, 8);

  const statusCounts = Object.keys(STATUS).map((status) => ({ status, count: requests.filter((r) => r.status === status).length })).filter((item) => item.count > 0);
  const maxCount = Math.max(1, ...statusCounts.map((item) => item.count));

  return `
    <div class="page-grid">
      <section class="welcome-banner sme-banner">
        <div>
          <span class="eyebrow light">Central de atendimento da SME</span>
          <h2>Operação de materiais escolares</h2>
          <p>Priorize os pedidos recebidos, registre autorizações e mantenha cada entrega completamente rastreável.</p>
          <div class="button-row">
            <button class="button light" type="button" data-action="navigate" data-view="requests">${icon('clipboard', 18)} Processar pedidos</button>
            <button class="button ghost-light" type="button" data-action="navigate" data-view="deliveries">${icon('truck', 18)} Ver entregas</button>
          </div>
        </div>
        <div class="banner-kpis">
          <div><strong>${awaiting.length}</strong><span>novos pedidos</span></div>
          <div><strong>${inTransit.length}</strong><span>em transporte</span></div>
        </div>
      </section>

      <section class="stats-grid five">
        ${statCard('mail', 'Aguardando SME', String(awaiting.length), 'pedidos novos', 'blue')}
        ${statCard('search', 'Em análise', String(review.length), 'em avaliação', 'amber')}
        ${statCard('archive', 'Para separar', String(authorized.length), 'autorizados', 'violet')}
        ${statCard('truck', 'Em transporte', String(inTransit.length), 'remessas abertas', 'cyan')}
        ${statCard('check', 'Entregues no mês', String(deliveredMonth), `${schoolsWithOrders} escolas atendidas`, 'green')}
      </section>

      <section class="panel span-2">
        <div class="panel-heading inline">
          <div><h3>Fila operacional</h3><p>Pedidos que precisam de acompanhamento da equipe.</p></div>
          <button class="button secondary small" type="button" data-action="navigate" data-view="requests">Abrir gestão ${icon('chevron', 16)}</button>
        </div>
        ${queue.length ? renderRequestTable(queue, { showSchool: true, compact: true }) : renderEmptyState('check', 'Fila em dia', 'Não há pedidos pendentes de processamento neste momento.')}
      </section>

      <section class="panel analytics-panel">
        <div class="panel-heading"><div><h3>Distribuição por situação</h3><p>${requests.length} pedidos no total.</p></div></div>
        <div class="status-bars">
          ${statusCounts.length ? statusCounts.map((item) => `
            <div class="status-bar-row">
              <div><span>${escapeHtml(STATUS[item.status].label)}</span><strong>${item.count}</strong></div>
              <div class="bar-track"><span class="bar-fill tone-${STATUS[item.status].tone}" style="width:${Math.max(7, (item.count / maxCount) * 100)}%"></span></div>
            </div>`).join('') : '<p class="muted">Ainda não há dados para exibir.</p>'}
        </div>
      </section>

      <section class="panel workflow-panel span-3">
        <div class="panel-heading"><div><h3>Fluxo institucional</h3><p>Cada ação registra data, hora e usuário responsável.</p></div></div>
        <div class="workflow-lane">
          ${[
            ['mail', 'Pedido recebido', awaiting.length, 'submitted'],
            ['search', 'Em análise', review.length, 'under_review'],
            ['shield', 'Autorizado', requests.filter((r) => r.status === 'approved').length, 'approved'],
            ['archive', 'Separação', requests.filter((r) => r.status === 'preparing').length, 'preparing'],
            ['truck', 'Em transporte', requests.filter((r) => r.status === 'dispatched').length, 'dispatched'],
            ['check', 'Concluído', requests.filter((r) => r.status === 'delivered').length, 'delivered']
          ].map(([iconName, label, count, status], index) => `
            <button type="button" class="workflow-node" data-action="filter-status" data-status="${status}">
              <span class="workflow-icon">${icon(iconName, 21)}</span><strong>${count}</strong><small>${label}</small>
              ${index < 5 ? '<i></i>' : ''}
            </button>`).join('')}
        </div>
      </section>
    </div>`;
}

function getFilteredRequests() {
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

function renderRequestsList(schoolMode) {
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

function renderRequestTable(requests, options = {}) {
  const { showSchool = false, compact = false } = options;
  return `
    <div class="table-wrap ${compact ? 'compact-table' : ''}">
      <table class="data-table">
        <thead><tr><th>Protocolo</th>${showSchool ? '<th>Escola</th>' : ''}<th>Finalidade / itens</th><th>Data</th><th>Prioridade</th><th>Situação</th><th class="align-right">Ação</th></tr></thead>
        <tbody>
          ${requests.map((request) => `
            <tr>
              <td><button type="button" class="protocol-link" data-action="open-request" data-id="${request.id}">${escapeHtml(request.protocol_number || 'Sem protocolo')}</button><small class="cell-sub">${request.request_items?.length || 0} material(is)</small></td>
              ${showSchool ? `<td><strong class="cell-title">${escapeHtml(request.schools?.nome || getSchoolName(request.school_id))}</strong>${request.schools?.inep ? `<small class="cell-sub">INEP ${escapeHtml(request.schools.inep)}</small>` : ''}</td>` : ''}
              <td><strong class="cell-title">${escapeHtml(truncate(request.purpose, compact ? 54 : 76))}</strong><small class="cell-sub">${escapeHtml((request.request_items || []).slice(0, 2).map((item) => item.material_name_snapshot).join(', '))}${request.request_items?.length > 2 ? '…' : ''}</small></td>
              <td>${formatDate(request.submitted_at || request.created_at)}<small class="cell-sub">${request.submitted_at ? 'enviado' : 'criado'}</small></td>
              <td>${priorityBadge(request.priority)}</td>
              <td>${statusBadge(request.status, isSchool() ? 'school' : 'default')}</td>
              <td class="align-right"><button type="button" class="button icon-only secondary" data-action="open-request" data-id="${request.id}" title="Abrir pedido">${icon('eye', 18)}</button></td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

function renderEmptyState(iconName, title, text, actionLabel = null, action = null) {
  return `<div class="empty-state"><span>${icon(iconName, 34)}</span><h4>${escapeHtml(title)}</h4><p>${escapeHtml(text)}</p>${actionLabel ? `<button type="button" class="button primary small" data-action="${attr(action)}">${icon('plus', 17)} ${escapeHtml(actionLabel)}</button>` : ''}</div>`;
}

function createBlankDraft() {
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

function draftFromRequest(request) {
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

function renderRequestForm() {
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

function renderRequestDetail() {
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
                  return `<tr><td><strong class="cell-title">${escapeHtml(item.material_name_snapshot)}</strong><small class="cell-sub">${escapeHtml(item.unit_snapshot)}</small></td><td class="align-center number-cell">${formatNumber(item.requested_quantity)}</td><td class="align-center number-cell ${Number(item.approved_quantity) === 0 && ['approved','preparing','dispatched','partially_delivered','delivered'].includes(request.status) ? 'zero' : ''}">${['draft','submitted','under_review'].includes(request.status) ? '—' : formatNumber(item.approved_quantity)}</td><td class="align-center number-cell">${formatNumber(delivered)}</td><td><small class="notes-cell">${escapeHtml(item.school_notes || item.sme_notes || '—')}</small>${item.school_notes && item.sme_notes ? `<small class="cell-sub">SME: ${escapeHtml(item.sme_notes)}</small>` : ''}</td></tr>`;
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

function renderSmeActionPanel(request) {
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

function hasRemainingAuthorizedItems(request) {
  return (request.request_items || []).some((item) => {
    const dispatched = deliveredQuantityForItem(request, item.id, true);
    return Number(item.approved_quantity || 0) - dispatched > 0.00001;
  });
}

function renderDeliveriesForRequest(request) {
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

function renderRequestTimeline(request, events) {
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

function eventIcon(type) {
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

function eventTitle(type) {
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

function renderProgressRing(percent) {
  const rounded = Math.round(percent || 0);
  return `<div class="progress-ring" style="--progress:${rounded}"><div><strong>${rounded}%</strong><span>entregue</span></div></div>`;
}

function getAllDeliveries() {
  return state.requests.flatMap((request) => (request.deliveries || []).map((delivery) => ({
    ...delivery,
    request,
    school: request.schools || state.schools.find((school) => school.id === request.school_id)
  })));
}

function renderDeliveries() {
  const search = state.filters.deliverySearch.trim().toLowerCase();
  const deliveries = getAllDeliveries().filter((delivery) => {
    const matchesStatus = state.filters.deliveryStatus === 'all' || delivery.status === state.filters.deliveryStatus;
    const haystack = [delivery.delivery_number, delivery.document_number, delivery.request.protocol_number, delivery.school?.nome, delivery.delivered_by_name, delivery.received_by_name].join(' ').toLowerCase();
    return matchesStatus && (!search || haystack.includes(search));
  });
  const dispatched = deliveries.filter((delivery) => delivery.status === 'dispatched').length;
  const delivered = deliveries.filter((delivery) => delivery.status === 'delivered').length;
  const unconfirmed = deliveries.filter((delivery) => delivery.status === 'delivered' && !delivery.school_confirmed_at && !String(delivery.delivery_number || '').startsWith('LEG-')).length;

  return `
    <div class="stack-lg">
      <section class="stats-grid three">
        ${statCard('truck', 'Em transporte', String(dispatched), 'aguardando recebimento', 'cyan')}
        ${statCard('check', 'Recebimentos', String(delivered), 'remessas entregues', 'green')}
        ${statCard('school', 'Sem confirmação', String(unconfirmed), 'aguardando a escola', 'amber')}
      </section>
      <section class="panel filter-panel">
        <div class="filter-grid three">
          <label class="field search-field"><span>Pesquisar</span><div class="input-with-icon">${icon('search', 18)}<input type="search" value="${attr(state.filters.deliverySearch)}" data-filter="deliverySearch" placeholder="Remessa, protocolo, escola..." /></div></label>
          <label class="field"><span>Situação da remessa</span><select data-filter="deliveryStatus"><option value="all">Todas</option><option value="dispatched" ${selected(state.filters.deliveryStatus === 'dispatched')}>Em transporte</option><option value="delivered" ${selected(state.filters.deliveryStatus === 'delivered')}>Recebida</option></select></label>
          <div class="filter-summary"><span>Resultados</span><strong>${deliveries.length}</strong><small>remessas encontradas</small></div>
        </div>
      </section>
      <section class="panel">
        <div class="panel-heading inline"><div><h3>Remessas registradas</h3><p>Acompanhe a saída, o recebimento e a confirmação da escola.</p></div><button class="button secondary" type="button" data-action="refresh">${icon('refresh', 18)} Atualizar</button></div>
        ${deliveries.length ? `
          <div class="table-wrap"><table class="data-table"><thead><tr><th>Remessa</th><th>Pedido / escola</th><th>Saída</th><th>Entrega</th><th>Responsáveis</th><th>Situação</th><th class="align-right">Ação</th></tr></thead><tbody>
            ${deliveries.map((delivery) => `<tr>
              <td><strong class="cell-title">${escapeHtml(delivery.delivery_number || 'Sem número')}</strong><small class="cell-sub">${delivery.document_number ? `Documento ${escapeHtml(delivery.document_number)}` : 'Sem documento'}</small></td>
              <td><button type="button" class="protocol-link" data-action="open-request" data-id="${delivery.request.id}">${escapeHtml(delivery.request.protocol_number)}</button><small class="cell-sub">${escapeHtml(delivery.school?.nome || '—')}</small></td>
              <td>${formatDate(delivery.dispatch_date || delivery.delivery_date)}<small class="cell-sub">${escapeHtml(delivery.delivered_by_name || '—')}</small></td>
              <td>${delivery.status === 'delivered' ? formatDate(delivery.receipt_date || delivery.delivery_date) : '—'}<small class="cell-sub">${escapeHtml(delivery.received_by_name || 'Aguardando')}</small></td>
              <td><strong class="cell-title">Autorização: ${escapeHtml(delivery.request.authorized_by_name || '—')}</strong><small class="cell-sub">Saída: ${escapeHtml(delivery.registered_by_name || '—')} • Recebimento: ${escapeHtml(delivery.receipt_registered_by_name || 'pendente')}</small></td>
              <td>${delivery.status === 'delivered' ? statusBadge('delivered') : statusBadge('dispatched')}${delivery.status === 'delivered' ? `<small class="cell-sub">${delivery.school_confirmed_at ? 'Confirmado pela escola' : 'Sem confirmação da escola'}</small>` : ''}</td>
              <td class="align-right"><div class="table-actions">${delivery.status === 'dispatched' ? `<button type="button" class="button success small" data-action="open-receipt" data-id="${delivery.id}">${icon('check', 16)} Recebimento</button>` : ''}<button type="button" class="button icon-only secondary" data-action="open-request" data-id="${delivery.request.id}">${icon('eye', 18)}</button></div></td>
            </tr>`).join('')}
          </tbody></table></div>` : renderEmptyState('truck', 'Nenhuma remessa encontrada', 'As remessas serão exibidas depois que os pedidos autorizados forem expedidos.')}
      </section>
    </div>`;
}


function schoolUsage(schoolId) {
  const requests = state.requests.filter((request) => request.school_id === schoolId).length;
  const users = state.profiles.filter((profile) => profile.school_id === schoolId).length;
  return { requests, users };
}

function renderSchools() {
  const active = state.schools.filter((school) => school.ativa).length;
  const linkedUsers = new Set(state.profiles.filter((profile) => profile.school_id).map((profile) => profile.school_id)).size;
  return `
    <div class="stack-lg">
      <section class="stats-grid three">
        ${statCard('school', 'Escolas cadastradas', String(state.schools.length), 'unidades no sistema', 'primary')}
        ${statCard('check', 'Escolas ativas', String(active), 'disponíveis para pedidos', 'green')}
        ${statCard('users', 'Com acesso criado', String(linkedUsers), 'vínculos identificados', 'blue')}
      </section>
      <section class="panel">
        <div class="panel-heading inline"><div><h3>Unidades escolares</h3><p>Cadastre os dados institucionais e mantenha os vínculos atualizados.</p></div>${isManager() ? `<button type="button" class="button primary" data-action="open-school-form">${icon('plus', 18)} Nova escola</button>` : ''}</div>
        ${state.schools.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Escola</th><th>Identificação</th><th>Direção / contato</th><th>Endereço</th><th>Situação</th><th class="align-right">Ação</th></tr></thead><tbody>
          ${state.schools.map((school) => `<tr><td><strong class="cell-title">${escapeHtml(school.nome)}</strong><small class="cell-sub">${escapeHtml(school.email || '')}</small></td><td>${school.inep ? `INEP ${escapeHtml(school.inep)}` : '—'}<small class="cell-sub">Acesso: ${escapeHtml(school.login_code || school.inep || 'não cadastrado')}</small></td><td><strong class="cell-title">${escapeHtml(school.diretor || '—')}</strong><small class="cell-sub">${escapeHtml(school.telefone || '')}</small></td><td>${escapeHtml(truncate([school.endereco, school.bairro].filter(Boolean).join(' • '), 60) || '—')}</td><td>${school.ativa ? '<span class="badge badge-green">Ativa</span>' : '<span class="badge badge-slate">Inativa</span>'}</td><td class="align-right">${isManager() ? `<div class="table-actions"><button type="button" class="button icon-only secondary" data-action="open-school-form" data-id="${school.id}" title="Editar escola">${icon('edit', 18)}</button>${isAdmin() ? `<button type="button" class="button icon-only danger-outline" data-action="open-school-delete" data-id="${school.id}" title="Excluir escola">${icon('trash', 18)}</button>` : ''}</div>` : '—'}</td></tr>`).join('')}
        </tbody></table></div>` : renderEmptyState('school', 'Nenhuma escola cadastrada', 'Cadastre as unidades que utilizarão o portal.', isManager() ? 'Nova escola' : null, isManager() ? 'open-school-form' : null)}
      </section>
    </div>`;
}

function renderMaterials() {
  const active = state.materials.filter((material) => material.ativo).length;
  const categories = new Set(state.materials.map((material) => material.categoria).filter(Boolean)).size;
  return `
    <div class="stack-lg">
      <section class="stats-grid three">
        ${statCard('box', 'Materiais cadastrados', String(state.materials.length), 'itens no catálogo', 'primary')}
        ${statCard('check', 'Materiais ativos', String(active), 'disponíveis às escolas', 'green')}
        ${statCard('archive', 'Categorias', String(categories), 'grupos de materiais', 'violet')}
      </section>
      <section class="panel">
        <div class="panel-heading inline"><div><h3>Catálogo de materiais</h3><p>Somente itens ativos aparecem na tela de pedidos das escolas.</p></div>${isManager() ? `<button type="button" class="button primary" data-action="open-material-form">${icon('plus', 18)} Novo material</button>` : ''}</div>
        ${state.materials.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Material</th><th>Código</th><th>Categoria</th><th>Unidade</th><th>Descrição</th><th>Situação</th><th class="align-right">Ação</th></tr></thead><tbody>
          ${state.materials.map((material) => `<tr><td><strong class="cell-title">${escapeHtml(material.nome)}</strong></td><td>${escapeHtml(material.codigo || '—')}</td><td>${escapeHtml(material.categoria || '—')}</td><td><span class="unit-pill">${escapeHtml(material.unidade)}</span></td><td>${escapeHtml(truncate(material.descricao || '—', 72))}</td><td>${material.ativo ? '<span class="badge badge-green">Ativo</span>' : '<span class="badge badge-slate">Inativo</span>'}</td><td class="align-right">${isManager() ? `<button type="button" class="button icon-only secondary" data-action="open-material-form" data-id="${material.id}" title="Editar">${icon('edit', 18)}</button>` : '—'}</td></tr>`).join('')}
        </tbody></table></div>` : renderEmptyState('box', 'Nenhum material cadastrado', 'Cadastre o catálogo que será utilizado pelas escolas.', isManager() ? 'Novo material' : null, isManager() ? 'open-material-form' : null)}
      </section>
    </div>`;
}

function renderUsers() {
  const schoolUsers = state.profiles.filter((profile) => profile.account_type === 'school').length;
  const smeUsers = state.profiles.filter((profile) => profile.account_type === 'sme').length;
  const active = state.profiles.filter((profile) => profile.active).length;
  return `
    <div class="stack-lg">
      <section class="security-banner"><span>${icon('shield', 28)}</span><div><strong>Gestão segura de acessos</strong><p>As contas são criadas por funções protegidas do Cloudflare. A chave administrativa do Supabase nunca é enviada ao navegador.</p></div></section>
      <section class="stats-grid three">
        ${statCard('school', 'Usuários de escola', String(schoolUsers), 'acessos vinculados', 'blue')}
        ${statCard('building', 'Equipe da SME', String(smeUsers), 'operadores e gestores', 'primary')}
        ${statCard('check', 'Acessos ativos', String(active), 'usuários liberados', 'green')}
      </section>
      <section class="panel">
        <div class="panel-heading inline"><div><h3>Usuários cadastrados</h3><p>Crie contas individuais ou importe escolas e senhas iniciais por arquivo CSV.</p></div><div class="panel-heading-actions"><button type="button" class="button secondary" data-action="open-school-import">${icon('download', 18)} Importar escolas</button><button type="button" class="button primary" data-action="open-user-create">${icon('plus', 18)} Criar usuário</button></div></div>
        ${state.profiles.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Usuário</th><th>Portal</th><th>Permissão</th><th>Vínculo / cargo</th><th>Situação</th><th class="align-right">Ações</th></tr></thead><tbody>
          ${state.profiles.map((profile) => `<tr><td><div class="user-cell"><span class="avatar small">${escapeHtml(initials(profile.full_name || profile.email))}</span><div><strong>${escapeHtml(profile.full_name || 'Sem nome')}</strong><small>${escapeHtml(profileLoginLabel(profile))}</small></div></div></td><td>${profile.account_type === 'school' ? '<span class="badge badge-blue">Escola</span>' : '<span class="badge badge-green">SME</span>'}</td><td>${escapeHtml(PERMISSIONS[profile.permission_level] || profile.permission_level)}</td><td><strong class="cell-title">${profile.account_type === 'school' ? escapeHtml(getSchoolName(profile.school_id)) : escapeHtml(profile.position || 'Secretaria Municipal de Educação')}</strong><small class="cell-sub">${escapeHtml(profile.phone || '')}</small></td><td>${profile.active ? '<span class="badge badge-green">Ativo</span>' : '<span class="badge badge-red">Desativado</span>'}${profile.must_change_password ? '<small class="cell-sub">Senha temporária</small>' : ''}</td><td class="align-right"><div class="table-actions"><button type="button" class="button icon-only secondary" data-action="open-user-edit" data-id="${profile.id}" title="Editar acesso">${icon('edit', 18)}</button><button type="button" class="button icon-only secondary" data-action="reset-user-password" data-id="${profile.id}" title="Gerar nova senha temporária">${icon('key', 18)}</button></div></td></tr>`).join('')}
        </tbody></table></div>` : renderEmptyState('users', 'Nenhum usuário encontrado', 'Importe as escolas ou crie o primeiro acesso para a equipe da SME.', 'Importar escolas', 'open-school-import')}
      </section>
    </div>`;
}

function renderSettings() {
  const inst = institution();
  return `
    <form id="settings-form" class="stack-lg">
      <section class="panel form-section">
        <div class="section-title"><span>${icon('building', 21)}</span><div><h3>Identidade institucional</h3><p>Essas informações aparecem no cabeçalho do sistema e nos relatórios impressos.</p></div></div>
        <div class="settings-preview">
          <div class="settings-preview-brand">${imageTag(inst.logoUrl, 'Marca institucional atual', '', CONFIG.logoFallbackUrl)}</div>
          <div class="settings-preview-copy"><span>${escapeHtml(inst.municipalityName)}</span><strong>${escapeHtml(inst.departmentName)}</strong><small>${escapeHtml(inst.reportTitle)}</small></div>
          <div class="settings-preview-symbols">${imageTag(inst.compactLogoUrl, 'Brasão compacto')}${imageTag(inst.planningLogoUrl, 'Brasão / marca de apoio', '', inst.compactLogoUrl)}</div>
        </div>
        <div class="form-grid two">
          <label class="field"><span>Nome do município *</span><input type="text" name="municipality_name" value="${attr(inst.municipalityName)}" required /></label>
          <label class="field"><span>Nome da secretaria / núcleo *</span><input type="text" name="department_name" value="${attr(inst.departmentName)}" required /></label>
          <label class="field span-2"><span>Título do sistema / relatório *</span><input type="text" name="report_title" value="${attr(inst.reportTitle)}" required /></label>
          <label class="field span-2"><span>Marca horizontal institucional *</span><input type="text" name="logo_url" value="${attr(inst.logoUrl)}" required /><small>Padrão: /assets/brand/logo-secretaria-educacao-caninde.png</small></label>
          <label class="field"><span>Brasão compacto *</span><input type="text" name="compact_logo_url" value="${attr(inst.compactLogoUrl)}" required /><small>Padrão: /assets/brand/brasao-caninde.webp</small></label>
          <label class="field"><span>Brasão / marca de apoio *</span><input type="text" name="planning_logo_url" value="${attr(inst.planningLogoUrl)}" required /><small>Padrão: /assets/brand/brasao-caninde.webp</small></label>
          <label class="field span-2"><span>Endereço institucional</span><input type="text" name="address" value="${attr(inst.address)}" /></label>
          <label class="field"><span>Telefone</span><input type="text" name="phone" value="${attr(inst.phone)}" /></label>
          <label class="field"><span>E-mail</span><input type="email" name="email" value="${attr(inst.email)}" /></label>
          <label class="field span-2"><span>Rodapé dos relatórios</span><textarea name="footer_text" rows="3">${escapeHtml(inst.footerText)}</textarea></label>
        </div>
      </section>
      <section class="form-actions"><div><strong>Configurações globais</strong><span>A alteração passa a valer para todos os usuários após salvar.</span></div><button type="submit" class="button primary">${icon('save', 18)} Salvar configurações</button></section>
    </form>`;
}

function renderProfile() {
  const school = state.schools.find((item) => item.id === state.profile.school_id);
  return `
    <div class="profile-layout">
      <section class="profile-card panel">
        <div class="profile-cover"></div>
        <div class="profile-avatar">${escapeHtml(initials(state.profile.full_name || state.profile.email))}</div>
        <h2>${escapeHtml(state.profile.full_name || 'Usuário')}</h2>
        <p>${escapeHtml(profileLoginLabel(state.profile))}</p>
        <div class="profile-tags">${state.profile.account_type === 'school' ? '<span class="badge badge-blue">Portal Escola</span>' : '<span class="badge badge-green">Portal SME</span>'}<span class="badge badge-slate">${escapeHtml(PERMISSIONS[state.profile.permission_level] || '')}</span></div>
        <dl class="profile-facts"><div><dt>Vínculo</dt><dd>${escapeHtml(school?.nome || state.profile.position || institution().departmentName)}</dd></div><div><dt>Situação</dt><dd>Ativo</dd></div><div><dt>Usuário desde</dt><dd>${formatDate(state.profile.created_at)}</dd></div></dl>
      </section>
      <form id="profile-form" class="panel form-section">
        <div class="section-title"><span>${icon('user', 21)}</span><div><h3>Dados pessoais</h3><p>Atualize as informações usadas nos registros de auditoria.</p></div></div>
        <div class="form-grid two">
          <label class="field span-2"><span>Nome completo *</span><input type="text" name="full_name" value="${attr(state.profile.full_name || '')}" required /></label>
          <label class="field"><span>Telefone</span><input type="text" name="phone" value="${attr(state.profile.phone || '')}" /></label>
          <label class="field"><span>Cargo / função</span><input type="text" name="position" value="${attr(state.profile.position || '')}" /></label>
          <label class="field span-2"><span>${state.profile.account_type === 'school' ? 'Código de acesso' : 'E-mail de acesso'}</span><input type="text" value="${attr(state.profile.account_type === 'school' ? getSchoolLoginCode(state.profile.school_id) : (state.profile.email || ''))}" disabled /><small>${state.profile.account_type === 'school' ? 'O código é definido no cadastro da escola.' : 'A alteração de e-mail deve ser feita pelo administrador.'}</small></label>
        </div>
        <div class="profile-form-actions"><button type="submit" class="button primary">${icon('save', 18)} Salvar meu perfil</button><button type="button" class="button secondary" data-action="open-own-password">${icon('key', 18)} Alterar senha</button></div>
      </form>
    </div>`;
}

function getReportRequests({ applyDate = true } = {}) {
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

function aggregateReportMaterials(requests) {
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

function getReportDeliveries(requests) {
  return requests.flatMap((request) => (request.deliveries || []).map((delivery) => ({ ...delivery, request })))
    .filter((delivery) => {
      const date = String(delivery.receipt_date || delivery.dispatch_date || delivery.delivery_date || '').slice(0, 10);
      return (!state.report.startDate || date >= state.report.startDate) && (!state.report.endDate || date <= state.report.endDate);
    })
    .sort((a, b) => String(b.receipt_date || b.dispatch_date || '').localeCompare(String(a.receipt_date || a.dispatch_date || '')));
}

function getReportData() {
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

function requestItemReportRows(request) {
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

function renderRequestItemsReportBlock(request, { print = false } = {}) {
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
      <td>${index + 1}</td>
      <td><strong class="cell-title">${escapeHtml(row.material)}</strong><small class="cell-sub">${escapeHtml(row.category)}</small></td>
      <td>${escapeHtml(row.unit)}</td>
      <td class="${numClass}">${formatNumber(row.requested)}</td>
      <td class="${numClass}">${formatNumber(row.approved)}</td>
      <td class="${numClass}">${formatNumber(row.delivered)}</td>
      <td class="${numClass}">${formatNumber(row.pending)}</td>
      <td>${escapeHtml([row.schoolNotes, row.smeNotes].filter(Boolean).join(' / ') || '—')}</td>
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

function renderReports() {
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

function renderReportTable(type, requests, materials, deliveries) {
  if (type === 'orders') {
    const colspan = isSme() ? 7 : 6;
    return requests.length ? `<div class="table-wrap report-orders-wrap"><table class="data-table report-orders-table"><thead><tr><th>Protocolo</th>${isSme() ? '<th>Escola</th>' : ''}<th>Finalidade</th><th>Solicitado</th><th>Autorizado</th><th>Entregue</th><th>Situação</th></tr></thead><tbody>${requests.map((request) => {
      const totals = requestTotals(request);
      const itemsCount = request.request_items?.length || 0;
      return `<tr class="report-request-row"><td><button class="protocol-link" type="button" data-action="open-request" data-id="${request.id}">${escapeHtml(request.protocol_number)}</button><small class="cell-sub">${formatDate(request.submitted_at || request.created_at)} • ${itemsCount} produto(s)</small></td>${isSme() ? `<td>${escapeHtml(request.schools?.nome || getSchoolName(request.school_id))}</td>` : ''}<td><strong class="cell-title">${escapeHtml(truncate(request.purpose, 75))}</strong><small class="cell-sub">${escapeHtml(PRIORITY[request.priority]?.label || request.priority || '')}</small></td><td class="number-cell">${formatNumber(totals.requested)}</td><td class="number-cell">${formatNumber(totals.approved)}</td><td class="number-cell">${formatNumber(totals.delivered)}</td><td>${statusBadge(request.status, isSchool() ? 'school' : 'default')}</td></tr><tr class="report-items-row"><td colspan="${colspan}">${renderRequestItemsReportBlock(request)}</td></tr>`;
    }).join('')}</tbody></table></div>` : renderEmptyState('report', 'Sem dados no período', 'Nenhum pedido corresponde aos filtros informados.');
  }

  if (type === 'materials') {
    return materials.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Material</th><th>Categoria</th><th>Unidade</th><th>Pedidos</th><th>Escolas</th><th>Solicitado</th><th>Autorizado</th><th>Entregue</th><th>Atendimento</th></tr></thead><tbody>${materials.map((item) => {
      const service = item.approved ? Math.min(100, (item.delivered / item.approved) * 100) : 0;
      return `<tr><td><strong class="cell-title">${escapeHtml(item.material)}</strong></td><td>${escapeHtml(item.category || '—')}</td><td><span class="unit-pill">${escapeHtml(item.unit)}</span></td><td>${item.requests.size}</td><td>${item.schools.size}</td><td class="number-cell">${formatNumber(item.requested)}</td><td class="number-cell">${formatNumber(item.approved)}</td><td class="number-cell">${formatNumber(item.delivered)}</td><td><div class="mini-progress"><span style="width:${service}%"></span></div><small class="cell-sub">${Math.round(service)}%</small></td></tr>`;
    }).join('')}</tbody></table></div>` : renderEmptyState('box', 'Sem materiais no período', 'Nenhum item corresponde aos filtros informados.');
  }

  return deliveries.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Remessa</th><th>Pedido</th>${isSme() ? '<th>Escola</th>' : ''}<th>Saída</th><th>Recebimento</th><th>Autorizado por</th><th>Entregador</th><th>Recebedor</th><th>Registro da saída</th><th>Registro do recebimento</th><th>Confirmação</th></tr></thead><tbody>${deliveries.map((delivery) => `<tr><td><strong class="cell-title">${escapeHtml(delivery.delivery_number || '—')}</strong><small class="cell-sub">${escapeHtml(delivery.document_number || '')}</small></td><td>${escapeHtml(delivery.request.protocol_number)}</td>${isSme() ? `<td>${escapeHtml(delivery.request.schools?.nome || getSchoolName(delivery.request.school_id))}</td>` : ''}<td>${formatDate(delivery.dispatch_date || delivery.delivery_date)}</td><td>${delivery.status === 'delivered' ? formatDate(delivery.receipt_date || delivery.delivery_date) : 'Pendente'}</td><td>${escapeHtml(delivery.request.authorized_by_name || '—')}</td><td>${escapeHtml(delivery.delivered_by_name || '—')}</td><td>${escapeHtml(delivery.received_by_name || '—')}</td><td>${escapeHtml(delivery.registered_by_name || '—')}</td><td>${escapeHtml(delivery.receipt_registered_by_name || 'Pendente')}</td><td>${delivery.school_confirmed_at ? formatDate(delivery.school_confirmed_at) : 'Pendente'}</td></tr>`).join('')}</tbody></table></div>` : renderEmptyState('truck', 'Sem entregas no período', 'Nenhuma remessa corresponde aos filtros informados.');
}

function renderModal() {
  const modal = state.modal;
  let content = '';
  let size = modal.size || 'medium';

  if (modal.type === 'authorize') {
    const request = getRequest(modal.requestId);
    size = 'large';
    content = `
      <div class="modal-heading"><span class="modal-icon success">${icon('shield', 24)}</span><div><h2>Autorizar pedido</h2><p>${escapeHtml(request?.protocol_number || '')} • ${escapeHtml(request?.schools?.nome || '')}</p></div></div>
      <form id="authorization-form" class="modal-body stack-lg">
        <div class="callout info">${icon('info', 19)}<p>Informe a quantidade autorizada de cada item. O nome do usuário logado será salvo como responsável pela autorização.</p></div>
        <div class="authorization-items">
          <div class="editor-head auth"><span>Material</span><span>Solicitado</span><span>Autorizado</span><span>Observação da SME</span></div>
          ${(request?.request_items || []).map((item) => `<div class="editor-row auth"><div><strong>${escapeHtml(item.material_name_snapshot)}</strong><small>${escapeHtml(item.unit_snapshot)}</small></div><div class="requested-qty">${formatNumber(item.requested_quantity)}</div><label class="field mobile-label"><span>Autorizado</span><input type="number" name="approved_${item.id}" min="0" max="${attr(item.requested_quantity)}" step="0.01" value="${attr(Number(item.approved_quantity) || Number(item.requested_quantity))}" required /></label><label class="field mobile-label"><span>Observação</span><input type="text" name="notes_${item.id}" value="${attr(item.sme_notes || '')}" placeholder="Ajuste ou justificativa" /></label></div>`).join('')}
        </div>
        <label class="field"><span>Observação geral da autorização</span><textarea name="authorizationNotes" rows="3" placeholder="Condições, orientações ou justificativas">${escapeHtml(request?.authorization_notes || '')}</textarea></label>
        <div class="modal-actions"><button type="button" class="button secondary" data-action="close-modal">Cancelar</button><button type="submit" class="button success">${icon('shield', 18)} Confirmar autorização</button></div>
      </form>`;
  } else if (modal.type === 'reject') {
    const request = getRequest(modal.requestId);
    content = `
      <div class="modal-heading"><span class="modal-icon danger">${icon('x', 24)}</span><div><h2>Rejeitar pedido</h2><p>${escapeHtml(request?.protocol_number || '')}</p></div></div>
      <form id="reject-form" class="modal-body form-stack"><div class="callout warning">${icon('alert', 19)}<p>O motivo ficará visível para a escola e será gravado na auditoria.</p></div><label class="field"><span>Motivo da rejeição *</span><textarea name="reason" rows="5" maxlength="1000" required placeholder="Explique de forma clara por que o pedido não foi autorizado"></textarea></label><div class="modal-actions"><button type="button" class="button secondary" data-action="close-modal">Voltar</button><button type="submit" class="button danger">${icon('x', 18)} Confirmar rejeição</button></div></form>`;
  } else if (modal.type === 'dispatch') {
    const request = getRequest(modal.requestId);
    const remaining = (request?.request_items || []).map((item) => ({ item, remaining: Math.max(0, Number(item.approved_quantity || 0) - deliveredQuantityForItem(request, item.id, true)) })).filter((entry) => entry.remaining > 0.00001);
    size = 'large';
    content = `
      <div class="modal-heading"><span class="modal-icon primary">${icon('truck', 24)}</span><div><h2>Registrar saída / remessa</h2><p>${escapeHtml(request?.protocol_number || '')} • ${escapeHtml(request?.schools?.nome || '')}</p></div></div>
      <form id="dispatch-form" class="modal-body stack-lg">
        <div class="form-grid two"><label class="field"><span>Data da saída *</span><input type="date" name="dispatchDate" value="${todayISO()}" max="${todayISO()}" required /></label><label class="field"><span>Número da guia / documento</span><input type="text" name="documentNumber" placeholder="Ex.: GUIA-2026-00125" /></label><label class="field"><span>Quem fará a entrega *</span><input type="text" name="deliveredByName" required placeholder="Nome completo" /></label><label class="field"><span>Setor / vínculo</span><input type="text" name="deliveredByDepartment" value="SME / Almoxarifado" /></label></div>
        <div><h3 class="mini-title">Itens da remessa</h3><p class="muted">Informe somente o que está saindo nesta remessa. É possível fazer entregas parciais.</p></div>
        <div class="dispatch-items"><div class="editor-head dispatch"><span>Material</span><span>Autorizado</span><span>Já expedido</span><span>Saldo</span><span>Enviar agora</span></div>${remaining.map(({ item, remaining: balance }) => {
          const already = deliveredQuantityForItem(request, item.id, true);
          return `<div class="editor-row dispatch"><div><strong>${escapeHtml(item.material_name_snapshot)}</strong><small>${escapeHtml(item.unit_snapshot)}</small></div><span>${formatNumber(item.approved_quantity)}</span><span>${formatNumber(already)}</span><strong>${formatNumber(balance)}</strong><label class="field mobile-label"><span>Enviar agora</span><input type="number" name="dispatch_${item.id}" min="0" max="${attr(balance)}" step="0.01" value="${attr(balance)}" /></label></div>`;
        }).join('')}</div>
        <label class="field"><span>Observações da remessa</span><textarea name="observations" rows="3" placeholder="Rota, veículo, volumes ou outras informações"></textarea></label>
        <div class="callout info">${icon('user', 19)}<p>O sistema salvará automaticamente <strong>${escapeHtml(state.profile.full_name)}</strong> como responsável pelo registro desta saída.</p></div>
        <div class="modal-actions"><button type="button" class="button secondary" data-action="close-modal">Cancelar</button><button type="submit" class="button primary">${icon('truck', 18)} Registrar remessa</button></div>
      </form>`;
  } else if (modal.type === 'receipt') {
    const delivery = getAllDeliveries().find((item) => item.id === modal.deliveryId);
    content = `
      <div class="modal-heading"><span class="modal-icon success">${icon('check', 24)}</span><div><h2>Registrar recebimento</h2><p>${escapeHtml(delivery?.delivery_number || '')} • ${escapeHtml(delivery?.school?.nome || '')}</p></div></div>
      <form id="receipt-form" class="modal-body form-stack">
        <div class="callout info">${icon('shield', 19)}<p>Este registro identifica quem recebeu na escola e quem lançou o recebimento no sistema.</p></div>
        <div class="form-grid two"><label class="field"><span>Data do recebimento *</span><input type="date" name="receiptDate" value="${todayISO()}" min="${attr(delivery?.dispatch_date || delivery?.delivery_date || '')}" max="${todayISO()}" required /></label><label class="field"><span>Nome de quem recebeu *</span><input type="text" name="receivedByName" required placeholder="Responsável na escola" /></label><label class="field"><span>Cargo / função</span><input type="text" name="receivedByPosition" placeholder="Diretor(a), secretário(a), servidor(a)..." /></label><label class="field"><span>Documento / matrícula</span><input type="text" name="receivedByDocument" placeholder="Opcional" /></label></div>
        <label class="field"><span>Observações do recebimento</span><textarea name="receiptNotes" rows="3" placeholder="Conferência, ressalvas ou informação complementar"></textarea></label>
        <div class="audit-preview"><span>${icon('user', 18)}</span><div><small>Registro realizado por</small><strong>${escapeHtml(state.profile.full_name)}</strong><p>${escapeHtml(state.profile.email || '')}</p></div></div>
        <div class="modal-actions"><button type="button" class="button secondary" data-action="close-modal">Cancelar</button><button type="submit" class="button success">${icon('check', 18)} Confirmar recebimento</button></div>
      </form>`;
  } else if (modal.type === 'confirmDelivery') {
    const delivery = getAllDeliveries().find((item) => item.id === modal.deliveryId);
    content = `
      <div class="modal-heading"><span class="modal-icon success">${icon('check', 24)}</span><div><h2>Confirmar entrega</h2><p>${escapeHtml(delivery?.delivery_number || '')}</p></div></div>
      <form id="confirm-delivery-form" class="modal-body form-stack"><div class="receipt-summary"><strong>Recebimento registrado pela SME</strong><p>${formatDate(delivery?.receipt_date || delivery?.delivery_date)} • Recebedor: ${escapeHtml(delivery?.received_by_name || '—')}</p></div><label class="field"><span>Observação da escola</span><textarea name="notes" rows="4" placeholder="Informe alguma ressalva ou deixe em branco para confirmar sem observações"></textarea></label><label class="confirmation-check"><input type="checkbox" name="confirmed" required /><span>Confirmo que os materiais desta remessa foram recebidos pela unidade escolar.</span></label><div class="modal-actions"><button type="button" class="button secondary" data-action="close-modal">Voltar</button><button type="submit" class="button success">${icon('check', 18)} Confirmar no sistema</button></div></form>`;
  } else if (modal.type === 'cancelRequest') {
    const request = getRequest(modal.requestId);
    content = `<div class="modal-heading"><span class="modal-icon danger">${icon('alert', 24)}</span><div><h2>Cancelar pedido</h2><p>${escapeHtml(request?.protocol_number || '')}</p></div></div><form id="cancel-request-form" class="modal-body form-stack"><div class="callout warning">${icon('alert', 19)}<p>O cancelamento fica registrado no histórico e não pode ser desfeito pela tela.</p></div><label class="field"><span>Motivo do cancelamento *</span><textarea name="reason" rows="5" required placeholder="Informe a justificativa"></textarea></label><div class="modal-actions"><button type="button" class="button secondary" data-action="close-modal">Voltar</button><button type="submit" class="button danger">${icon('x', 18)} Cancelar pedido</button></div></form>`;
  } else if (modal.type === 'forgotPassword') {
    content = `<div class="modal-heading"><span class="modal-icon primary">${icon('key', 24)}</span><div><h2>Recuperar senha</h2><p>Acesso da equipe da SME</p></div></div><form id="forgot-password-form" class="modal-body form-stack"><div class="callout info">${icon('info', 19)}<p>Informe o e-mail cadastrado. Se ele existir no sistema, o Supabase enviará as instruções de recuperação.</p></div><label class="field"><span>E-mail do acesso *</span><input type="email" name="email" value="${attr(modal.email || '')}" placeholder="nome@caninde.ce.gov.br" required /></label><div class="modal-actions"><button type="button" class="button secondary" data-action="close-modal">Cancelar</button><button type="submit" class="button primary">${icon('mail', 18)} Enviar instruções</button></div></form>`;
  } else if (modal.type === 'schoolForm') {
    const school = state.schools.find((item) => item.id === modal.schoolId) || {};
    size = 'large';
    content = `<div class="modal-heading"><span class="modal-icon primary">${icon('school', 24)}</span><div><h2>${school.id ? 'Editar escola' : 'Cadastrar escola'}</h2><p>Dados da unidade escolar</p></div></div><form id="school-form" class="modal-body stack-lg"><div class="form-grid two"><label class="field span-2"><span>Nome da escola *</span><input type="text" name="nome" value="${attr(school.nome || '')}" required /></label><label class="field"><span>Código interno</span><input type="text" name="codigo" value="${attr(school.codigo || '')}" /></label><label class="field"><span>Código INEP</span><input type="text" name="inep" inputmode="numeric" value="${attr(school.inep || '')}" /></label><label class="field"><span>Código de acesso</span><input type="text" name="login_code" inputmode="numeric" value="${attr(school.login_code || school.inep || '')}" /><small>Usado pela escola na tela de login.</small></label><label class="field"><span>Diretor(a)</span><input type="text" name="diretor" value="${attr(school.diretor || '')}" /></label><label class="field"><span>Telefone</span><input type="text" name="telefone" value="${attr(school.telefone || '')}" /></label><label class="field"><span>E-mail</span><input type="email" name="email" value="${attr(school.email || '')}" /></label><label class="field"><span>Bairro</span><input type="text" name="bairro" value="${attr(school.bairro || '')}" /></label><label class="field span-2"><span>Endereço</span><input type="text" name="endereco" value="${attr(school.endereco || '')}" /></label><label class="field span-2"><span>Observações</span><textarea name="observacoes" rows="3">${escapeHtml(school.observacoes || '')}</textarea></label><label class="toggle-field span-2"><input type="checkbox" name="ativa" ${checked(school.id ? school.ativa : true)} /><span><strong>Escola ativa</strong><small>Permite vincular usuários e registrar novos pedidos.</small></span></label></div><div class="modal-actions"><button type="button" class="button secondary" data-action="close-modal">Cancelar</button>${school.id && isAdmin() ? `<button type="button" class="button danger-outline" data-action="open-school-delete" data-id="${school.id}">${icon('trash', 18)} Excluir escola</button>` : ''}<button type="submit" class="button primary">${icon('save', 18)} Salvar escola</button></div></form>`;
  } else if (modal.type === 'schoolDelete') {
    const school = state.schools.find((item) => item.id === modal.schoolId);
    const usage = schoolUsage(modal.schoolId);
    const blocked = usage.requests > 0;
    content = `<div class="modal-heading"><span class="modal-icon danger">${icon('trash', 24)}</span><div><h2>Excluir escola</h2><p>${escapeHtml(school?.nome || 'Unidade escolar')}</p></div></div><div class="modal-body form-stack"><div class="school-delete-summary"><article><span>Pedidos vinculados</span><strong>${usage.requests}</strong></article><article><span>Usuários vinculados</span><strong>${usage.users}</strong></article></div>${blocked ? `<div class="callout warning">${icon('alert', 19)}<p>Esta escola possui pedidos ou movimentações registrados. Para preservar o histórico e os relatórios, ela não pode ser excluída. Desative a escola no cadastro para impedir novos pedidos.</p></div>` : `<div class="callout warning">${icon('alert', 19)}<p>Esta ação remove a escola do cadastro. Se existirem usuários vinculados, eles ficarão sem escola e precisarão ser revisados na tela de usuários.</p></div><label class="confirmation-check"><input type="checkbox" required data-delete-school-confirm /><span>Confirmo que desejo excluir definitivamente esta escola do cadastro.</span></label>`}<div class="modal-actions"><button type="button" class="button secondary" data-action="close-modal">Fechar</button>${!blocked ? `<button type="button" class="button danger" data-action="confirm-delete-school" data-id="${modal.schoolId}">${icon('trash', 18)} Excluir definitivamente</button>` : ''}</div></div>`;
  } else if (modal.type === 'installApp') {
    const reasonText = modal.reason === 'ios'
      ? 'No iPhone, a Apple não libera instalação automática por botão. Use o Safari, toque em Compartilhar e escolha Adicionar à Tela de Início.'
      : modal.reason === 'insecure'
        ? 'Para o botão instalar abrir automaticamente, acesse pelo endereço publicado no Cloudflare com HTTPS ou por http://127.0.0.1 durante os testes.'
        : modal.reason === 'cancelled'
          ? 'A instalação foi cancelada. Você pode tentar novamente pelo botão abaixo ou usar o menu do navegador.'
          : 'Quando o navegador permitir, este botão abre a janela nativa de instalação do aplicativo.';
    content = `<div class="modal-heading"><span class="modal-icon primary">${icon('smartphone', 24)}</span><div><h2>Instalar como aplicativo</h2><p>Use o sistema como app no celular, tablet ou computador.</p></div></div><div class="modal-body stack-lg"><div class="callout info">${icon('info', 19)}<p>${escapeHtml(reasonText)}</p></div><div class="install-steps"><article><strong>Android / Chrome</strong><span>Toque em “Instalar agora”. Se o navegador não abrir a instalação, abra o menu ⋮ e escolha “Instalar app” ou “Adicionar à tela inicial”.</span></article><article><strong>iPhone / Safari</strong><span>Toque no botão de compartilhar e depois em “Adicionar à Tela de Início”. Esse é o método exigido pelo iOS.</span></article><article><strong>Computador / Edge ou Chrome</strong><span>Clique no ícone de instalação na barra de endereço ou use o botão “Instalar agora”.</span></article></div><div class="callout warning">${icon('shield', 19)}<p>O instalador automático só aparece em ambiente seguro: Cloudflare Pages com HTTPS ou teste local em 127.0.0.1.</p></div><div class="modal-actions"><button type="button" class="button secondary" data-action="close-modal">Fechar</button>${modal.reason !== 'ios' ? `<button type="button" class="button primary" data-action="install-app">${icon('smartphone', 18)} Instalar agora</button>` : ''}</div></div>`;
  } else if (modal.type === 'materialForm') {
    const material = state.materials.find((item) => item.id === modal.materialId) || {};
    content = `<div class="modal-heading"><span class="modal-icon primary">${icon('box', 24)}</span><div><h2>${material.id ? 'Editar material' : 'Cadastrar material'}</h2><p>Item disponível no catálogo</p></div></div><form id="material-form" class="modal-body form-stack"><div class="form-grid two"><label class="field span-2"><span>Nome do material *</span><input type="text" name="nome" value="${attr(material.nome || '')}" required /></label><label class="field"><span>Código</span><input type="text" name="codigo" value="${attr(material.codigo || '')}" /></label><label class="field"><span>Categoria</span><input type="text" name="categoria" value="${attr(material.categoria || '')}" placeholder="Ex.: Papelaria" /></label><label class="field"><span>Unidade de medida *</span><input type="text" name="unidade" value="${attr(material.unidade || 'un')}" required placeholder="un, cx, pct, resma..." /></label><label class="field"><span>Quantidade mínima</span><input type="number" name="quantidade_minima" value="${attr(material.quantidade_minima || '')}" min="0" step="0.01" /></label><label class="field span-2"><span>Descrição / especificação</span><textarea name="descricao" rows="4">${escapeHtml(material.descricao || '')}</textarea></label><label class="toggle-field span-2"><input type="checkbox" name="ativo" ${checked(material.id ? material.ativo : true)} /><span><strong>Material ativo</strong><small>Fica disponível para solicitação pelas escolas.</small></span></label></div><div class="modal-actions"><button type="button" class="button secondary" data-action="close-modal">Cancelar</button><button type="submit" class="button primary">${icon('save', 18)} Salvar material</button></div></form>`;
  } else if (modal.type === 'userCreate') {
    size = 'large';
    content = `<div class="modal-heading"><span class="modal-icon primary">${icon('users', 24)}</span><div><h2>Criar novo usuário</h2><p>Para escolas, o login será o código cadastrado na unidade.</p></div></div><form id="user-create-form" class="modal-body stack-lg"><div class="form-grid two"><label class="field span-2"><span>Nome completo *</span><input type="text" name="fullName" required /></label><label class="field"><span>Tipo de portal *</span><select name="accountType" data-user-account-type><option value="school">Escola</option><option value="sme">SME</option></select></label><label class="field"><span>Telefone</span><input type="text" name="phone" /></label><label class="field user-email-field hidden"><span>E-mail institucional *</span><input type="email" name="email" placeholder="nome@caninde.ce.gov.br" /></label><label class="field user-school-field"><span>Escola vinculada *</span><select name="schoolId" required><option value="">Selecione</option>${state.schools.filter((school) => school.ativa).map((school) => `<option value="${school.id}">${escapeHtml(school.nome)} • ${escapeHtml(school.login_code || school.inep || 'sem código')}</option>`).join('')}</select><small>O código da escola será usado como login.</small></label><label class="field user-permission-field hidden"><span>Permissão na SME *</span><select name="permissionLevel"><option value="sme_operator">Operador</option><option value="sme_manager">Gestor / autorizador</option><option value="sme_admin">Administrador</option></select></label><label class="field"><span>Cargo / função</span><input type="text" name="position" /></label><label class="field"><span>Senha temporária</span><input type="text" name="password" minlength="6" placeholder="Escola: PIN de 6 dígitos; SME: 8+ caracteres" /></label></div><div class="callout warning">${icon('key', 19)}<p>Para escolas, um PIN de 6 dígitos pode ser usado no primeiro acesso. Depois do login, o sistema exige a troca por uma senha pessoal com pelo menos 8 caracteres.</p></div><div class="modal-actions"><button type="button" class="button secondary" data-action="close-modal">Cancelar</button><button type="submit" class="button primary">${icon('plus', 18)} Criar acesso</button></div></form>`;
  } else if (modal.type === 'schoolImport') {
    size = 'large';
    content = `<div class="modal-heading"><span class="modal-icon primary">${icon('download', 24)}</span><div><h2>Importar escolas e acessos</h2><p>Cadastre várias unidades e seus PINs temporários em uma única operação.</p></div></div><form id="school-import-form" class="modal-body stack-lg"><div class="import-file-zone"><span class="import-file-icon">${icon('filecheck', 30)}</span><div><strong>Selecione o arquivo CSV</strong><p>Colunas obrigatórias: NM_ESCOLA, DC_LOGIN e SENHA.</p></div><input type="file" name="csvFile" accept=".csv,.txt,text/csv,text/plain" required /></div><div class="import-help-grid"><article><strong>NM_ESCOLA</strong><span>Nome completo da unidade</span></article><article><strong>DC_LOGIN</strong><span>Código numérico usado no login</span></article><article><strong>SENHA</strong><span>PIN inicial de 6 dígitos</span></article></div><label class="toggle-field"><input type="checkbox" name="overwritePasswords" /><span><strong>Redefinir senhas de acessos já existentes</strong><small>Deixe desmarcado ao repetir a importação para preservar senhas que já foram alteradas pelas escolas.</small></span></label><div class="callout warning">${icon('alert', 19)}<p>O arquivo contém credenciais temporárias. Faça a importação em computador seguro e apague o arquivo após confirmar o resultado.</p></div><div class="modal-actions split"><button type="button" class="button secondary" data-action="download-import-template">${icon('download', 18)} Baixar modelo</button><div class="button-row"><button type="button" class="button secondary" data-action="close-modal">Cancelar</button><button type="submit" class="button primary">${icon('check', 18)} Importar arquivo</button></div></div></form>`;
  } else if (modal.type === 'schoolImportResult') {
    size = 'large';
    const summary = modal.summary || {};
    const results = modal.results || [];
    content = `<div class="modal-heading"><span class="modal-icon ${summary.errors ? 'warning' : 'success'}">${icon(summary.errors ? 'alert' : 'check', 24)}</span><div><h2>Resultado da importação</h2><p>${summary.errors ? 'A importação terminou com itens que precisam de revisão.' : 'Todas as linhas foram processadas.'}</p></div></div><div class="modal-body stack-lg"><div class="import-result-summary"><article><span>Linhas</span><strong>${Number(summary.total || 0)}</strong></article><article><span>Novos acessos</span><strong>${Number(summary.createdUsers || 0)}</strong></article><article><span>Atualizados</span><strong>${Number(summary.updatedUsers || 0) + Number(summary.linkedUsers || 0)}</strong></article><article class="${summary.errors ? 'has-error' : ''}"><span>Erros</span><strong>${Number(summary.errors || 0)}</strong></article></div><div class="table-wrap import-result-table"><table class="data-table"><thead><tr><th>Código</th><th>Escola</th><th>Resultado</th><th>Observação</th></tr></thead><tbody>${results.map((item) => `<tr><td><span class="login-code-badge">${escapeHtml(item.loginCode || '—')}</span></td><td><strong class="cell-title">${escapeHtml(item.name || '—')}</strong></td><td>${item.status === 'error' ? '<span class="badge badge-red">Erro</span>' : item.status === 'created' ? '<span class="badge badge-green">Criado</span>' : '<span class="badge badge-blue">Atualizado</span>'}</td><td>${escapeHtml(item.message || '')}</td></tr>`).join('')}</tbody></table></div><div class="modal-actions split"><button type="button" class="button secondary" data-action="download-import-report">${icon('download', 18)} Baixar relatório CSV</button><button type="button" class="button primary" data-action="close-modal">Concluído</button></div></div>`;
  } else if (modal.type === 'userEdit') {
    const profile = state.profiles.find((item) => item.id === modal.profileId);
    const accountType = modal.accountType || profile?.account_type || 'school';
    size = 'large';
    content = `<div class="modal-heading"><span class="modal-icon primary">${icon('user', 24)}</span><div><h2>Editar usuário</h2><p>${escapeHtml(profileLoginLabel(profile))}</p></div></div><form id="user-edit-form" class="modal-body stack-lg"><div class="form-grid two"><label class="field span-2"><span>Nome completo *</span><input type="text" name="fullName" value="${attr(profile?.full_name || '')}" required /></label><label class="field"><span>Tipo de portal *</span><select name="accountType" data-user-edit-account-type><option value="school" ${selected(accountType === 'school')}>Escola</option><option value="sme" ${selected(accountType === 'sme')}>SME</option></select></label><label class="field"><span>Telefone</span><input type="text" name="phone" value="${attr(profile?.phone || '')}" /></label><label class="field ${accountType === 'school' ? '' : 'hidden'}" data-user-edit-school><span>Escola vinculada *</span><select name="schoolId"><option value="">Selecione</option>${state.schools.map((school) => `<option value="${school.id}" ${selected(profile?.school_id === school.id)}>${escapeHtml(school.nome)}</option>`).join('')}</select></label><label class="field ${accountType === 'sme' ? '' : 'hidden'}" data-user-edit-permission><span>Permissão na SME *</span><select name="permissionLevel"><option value="sme_operator" ${selected(profile?.permission_level === 'sme_operator')}>Operador</option><option value="sme_manager" ${selected(profile?.permission_level === 'sme_manager')}>Gestor / autorizador</option><option value="sme_admin" ${selected(profile?.permission_level === 'sme_admin')}>Administrador</option></select></label><label class="field span-2"><span>Cargo / função</span><input type="text" name="position" value="${attr(profile?.position || '')}" /></label><label class="toggle-field span-2"><input type="checkbox" name="active" ${checked(profile?.active)} /><span><strong>Acesso ativo</strong><small>Usuários desativados não conseguem consultar nem alterar dados.</small></span></label></div><div class="modal-actions"><button type="button" class="button secondary" data-action="close-modal">Cancelar</button><button type="submit" class="button primary">${icon('save', 18)} Salvar acesso</button></div></form>`;
  } else if (modal.type === 'passwordResult') {
    content = `<div class="modal-heading"><span class="modal-icon success">${icon('key', 24)}</span><div><h2>Senha temporária gerada</h2><p>Copie e entregue ao usuário por um canal seguro.</p></div></div><div class="modal-body form-stack"><div class="temporary-password"><code>${escapeHtml(modal.password)}</code><button type="button" class="button secondary small" data-action="copy-password" data-password="${attr(modal.password)}">Copiar</button></div><div class="callout warning">${icon('alert', 19)}<p>Esta senha não será exibida novamente. No primeiro acesso, o sistema exigirá a troca.</p></div><div class="modal-actions"><button type="button" class="button primary" data-action="close-modal">Concluído</button></div></div>`;
  } else if (modal.type === 'ownPassword') {
    content = `<div class="modal-heading"><span class="modal-icon primary">${icon('key', 24)}</span><div><h2>Alterar minha senha</h2><p>Cadastre uma nova senha de acesso.</p></div></div><form id="own-password-form" class="modal-body form-stack"><label class="field"><span>Nova senha *</span><input type="password" name="password" minlength="8" required /></label><label class="field"><span>Confirmar senha *</span><input type="password" name="confirmPassword" minlength="8" required /></label><div class="modal-actions"><button type="button" class="button secondary" data-action="close-modal">Cancelar</button><button type="submit" class="button primary">${icon('key', 18)} Alterar senha</button></div></form>`;
  }

  return `<div class="modal-backdrop" data-modal-backdrop><section class="modal modal-${size}" role="dialog" aria-modal="true"><button type="button" class="icon-button modal-close" data-action="close-modal" aria-label="Fechar janela">${icon('x', 20)}</button>${content}</section></div>`;
}

app.addEventListener('click', async (event) => {
  if (event.target.matches('[data-modal-backdrop]')) {
    state.modal = null;
    render();
    return;
  }
  if (event.target.matches('[data-notice-backdrop]')) {
    state.notice = null;
    render();
    return;
  }

  const button = event.target.closest('[data-action]');
  if (!button) return;
  const action = button.dataset.action;

  try {
    if (action === 'choose-portal') {
      state.loginPortal = button.dataset.portal;
      localStorage.setItem('materiais_login_portal', state.loginPortal);
      render();
    } else if (action === 'toggle-password') {
      const input = button.closest('.password-wrap')?.querySelector('input');
      if (input) input.type = input.type === 'password' ? 'text' : 'password';
    } else if (action === 'forgot-password') {
      await handleForgotPassword();
    } else if (action === 'retry-auth') {
      state.authError = null;
      await loadAuthenticatedData(true);
      render();
    } else if (action === 'logout') {
      state.loading = true;
      render();
      await supabase.auth.signOut();
      state.loading = false;
      state.recoveryMode = false;
      resetSecureState();
      render();
    } else if (action === 'navigate') {
      navigate(button.dataset.view);
    } else if (action === 'open-mobile-menu') {
      state.mobileMenu = true;
      render();
    } else if (action === 'close-mobile-menu') {
      state.mobileMenu = false;
      render();
    } else if (action === 'new-request') {
      state.draft = createBlankDraft();
      state.view = 'newRequest';
      state.mobileMenu = false;
      render();
    } else if (action === 'add-draft-item') {
      state.draft.items.push({ material_id: '', quantity: '', notes: '' });
      render();
    } else if (action === 'remove-draft-item') {
      const index = Number(button.dataset.index);
      if (state.draft.items.length > 1) state.draft.items.splice(index, 1);
      render();
    } else if (action === 'cancel-request-form') {
      state.draft = null;
      state.view = 'myRequests';
      render();
    } else if (action === 'open-request') {
      await openRequest(button.dataset.id);
    } else if (action === 'back-from-detail') {
      state.view = state.previousView && state.previousView !== 'requestDetail' ? state.previousView : (isSchool() ? 'myRequests' : 'requests');
      state.selectedRequestId = null;
      render();
    } else if (action === 'edit-draft') {
      const request = getRequest(button.dataset.id);
      if (request?.status === 'draft') {
        state.draft = draftFromRequest(request);
        state.view = 'newRequest';
        state.modal = null;
        render();
      }
    } else if (action === 'receive-request') {
      const requestId = button.dataset.id;
      openConfirm({
        title: 'Receber pedido para análise',
        message: 'Confirmar o recebimento deste pedido pela SME? O sistema registrará seu nome como responsável pelo recebimento.',
        confirmLabel: 'Confirmar recebimento',
        tone: 'primary',
        onConfirm: async () => executeRpc('receive_request', { p_request_id: requestId }, 'Pedido recebido para análise.')
      });
      render();
    } else if (action === 'open-authorize-request') {
      state.modal = { type: 'authorize', requestId: button.dataset.id };
      render();
    } else if (action === 'open-reject-request') {
      state.modal = { type: 'reject', requestId: button.dataset.id };
      render();
    } else if (action === 'start-preparation') {
      const requestId = button.dataset.id;
      openConfirm({
        title: 'Iniciar separação',
        message: 'Deseja iniciar a separação dos materiais deste pedido? Essa etapa ficará registrada no histórico.',
        confirmLabel: 'Iniciar separação',
        tone: 'primary',
        onConfirm: async () => executeRpc('start_request_preparation', { p_request_id: requestId }, 'Separação iniciada.')
      });
      render();
    } else if (action === 'open-dispatch') {
      state.modal = { type: 'dispatch', requestId: button.dataset.id };
      render();
    } else if (action === 'open-receipt') {
      state.modal = { type: 'receipt', deliveryId: button.dataset.id };
      render();
    } else if (action === 'open-confirm-delivery') {
      state.modal = { type: 'confirmDelivery', deliveryId: button.dataset.id };
      render();
    } else if (action === 'open-cancel-request') {
      state.modal = { type: 'cancelRequest', requestId: button.dataset.id };
      render();
    } else if (action === 'close-modal') {
      state.modal = null;
      render();
    } else if (action === 'close-notice') {
      state.notice = null;
      render();
    } else if (action === 'confirm-notice') {
      const onConfirm = state.notice?.onConfirm;
      state.notice = null;
      render();
      if (typeof onConfirm === 'function') await onConfirm();
    } else if (action === 'install-app') {
      await handleInstallApp();
    } else if (action === 'open-school-form') {
      state.modal = { type: 'schoolForm', schoolId: button.dataset.id || null };
      render();
    } else if (action === 'open-school-delete') {
      state.modal = { type: 'schoolDelete', schoolId: button.dataset.id };
      render();
    } else if (action === 'confirm-delete-school') {
      const checkbox = app.querySelector('[data-delete-school-confirm]');
      if (checkbox && !checkbox.checked) throw new Error('Marque a confirmação antes de excluir a escola.');
      await deleteSchool(button.dataset.id);
    } else if (action === 'open-material-form') {
      state.modal = { type: 'materialForm', materialId: button.dataset.id || null };
      render();
    } else if (action === 'open-user-create') {
      state.modal = { type: 'userCreate' };
      render();
    } else if (action === 'open-school-import') {
      state.modal = { type: 'schoolImport' };
      render();
    } else if (action === 'download-import-template') {
      downloadSchoolImportTemplate();
    } else if (action === 'download-import-report') {
      downloadSchoolImportReport();
    } else if (action === 'open-user-edit') {
      const profile = state.profiles.find((item) => item.id === button.dataset.id);
      state.modal = { type: 'userEdit', profileId: button.dataset.id, accountType: profile?.account_type };
      render();
    } else if (action === 'reset-user-password') {
      await resetUserPassword(button.dataset.id);
    } else if (action === 'copy-password') {
      await navigator.clipboard.writeText(button.dataset.password || '');
      setToast('success', 'Senha copiada para a área de transferência.');
      render();
    } else if (action === 'open-own-password') {
      state.modal = { type: 'ownPassword' };
      render();
    } else if (action === 'dismiss-toast') {
      state.toast = null;
      render();
    } else if (action === 'refresh') {
      await refreshData('Dados atualizados.');
    } else if (action === 'filter-status') {
      state.filters.requestStatus = button.dataset.status;
      state.view = 'requests';
      render();
    } else if (action === 'report-type') {
      state.report.type = button.dataset.type;
      render();
    } else if (action === 'export-report') {
      exportCurrentReport();
    } else if (action === 'print-report') {
      printCurrentReport();
    } else if (action === 'print-request') {
      printRequest(getRequest(button.dataset.id));
    }
  } catch (error) {
    console.error(error);
    state.loading = false;
    setToast('error', friendlyError(error));
    render();
  }
});

app.addEventListener('input', (event) => {
  const target = event.target;

  if (target.dataset.draftField && state.draft) {
    state.draft[target.dataset.draftField] = target.value;
  }
  if (target.dataset.draftItem && state.draft) {
    const index = Number(target.dataset.index);
    if (state.draft.items[index]) state.draft.items[index][target.dataset.draftItem] = target.value;
  }
  if (target.dataset.filter && target.matches('input')) {
    state.filters[target.dataset.filter] = target.value;
    window.clearTimeout(state.filterTimer);
    const filterName = target.dataset.filter;
    const cursor = target.selectionStart;
    state.filterTimer = window.setTimeout(() => {
      render();
      const refreshed = app.querySelector(`[data-filter="${filterName}"]`);
      if (refreshed) {
        refreshed.focus();
        if (typeof refreshed.setSelectionRange === 'function') refreshed.setSelectionRange(cursor, cursor);
      }
    }, 250);
  }
});

app.addEventListener('change', (event) => {
  const target = event.target;

  if (target.dataset.draftField && state.draft) state.draft[target.dataset.draftField] = target.value;
  if (target.dataset.draftItem && state.draft) {
    const index = Number(target.dataset.index);
    if (state.draft.items[index]) state.draft.items[index][target.dataset.draftItem] = target.value;
  }
  if (target.dataset.filter) {
    state.filters[target.dataset.filter] = target.value;
    render();
  }
  if (target.dataset.reportFilter) {
    state.report[target.dataset.reportFilter] = target.value;
    render();
  }
  if (target.matches('[data-user-account-type]')) {
    const form = target.closest('form');
    const isSchoolAccount = target.value === 'school';
    const schoolField = form.querySelector('.user-school-field');
    const emailField = form.querySelector('.user-email-field');
    schoolField?.classList.toggle('hidden', !isSchoolAccount);
    emailField?.classList.toggle('hidden', isSchoolAccount);
    form.querySelector('.user-permission-field')?.classList.toggle('hidden', isSchoolAccount);
    const schoolSelect = schoolField?.querySelector('select');
    const emailInput = emailField?.querySelector('input');
    if (schoolSelect) schoolSelect.required = isSchoolAccount;
    if (emailInput) emailInput.required = !isSchoolAccount;
  }
  if (target.matches('[data-user-edit-account-type]')) {
    const form = target.closest('form');
    form.querySelector('[data-user-edit-school]')?.classList.toggle('hidden', target.value !== 'school');
    form.querySelector('[data-user-edit-permission]')?.classList.toggle('hidden', target.value !== 'sme');
  }
});

app.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.target;

  try {
    if (form.id === 'login-form') await submitLogin(form);
    else if (form.id === 'password-change-form') await submitPasswordChange(form);
    else if (form.id === 'forgot-password-form') await submitForgotPassword(form);
    else if (form.id === 'request-form') await submitSchoolRequest(event);
    else if (form.id === 'authorization-form') await submitAuthorization(form);
    else if (form.id === 'reject-form') await submitRejection(form);
    else if (form.id === 'dispatch-form') await submitDispatch(form);
    else if (form.id === 'receipt-form') await submitReceipt(form);
    else if (form.id === 'confirm-delivery-form') await submitSchoolConfirmation(form);
    else if (form.id === 'cancel-request-form') await submitCancellation(form);
    else if (form.id === 'school-form') await submitSchool(form);
    else if (form.id === 'material-form') await submitMaterial(form);
    else if (form.id === 'user-create-form') await submitUserCreate(form);
    else if (form.id === 'school-import-form') await submitSchoolImport(form);
    else if (form.id === 'user-edit-form') await submitUserEdit(form);
    else if (form.id === 'settings-form') await submitSettings(form);
    else if (form.id === 'profile-form') await submitProfile(form);
    else if (form.id === 'own-password-form') await submitOwnPassword(form);
  } catch (error) {
    console.error(error);
    state.loading = false;
    setToast('error', friendlyError(error));
    render();
  }
});

function navigate(view) {
  state.view = view;
  state.mobileMenu = false;
  state.modal = null;
  if (view === 'newRequest' && !state.draft) state.draft = createBlankDraft();
  if (view !== 'newRequest') state.draft = null;
  if (view !== 'requestDetail') state.selectedRequestId = null;
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function openRequest(requestId) {
  state.loading = true;
  render();
  try {
    if (!state.events[requestId]) await loadRequestEvents(requestId);
    if (state.view !== 'requestDetail') state.previousView = state.view;
    state.selectedRequestId = requestId;
    state.view = 'requestDetail';
  } finally {
    state.loading = false;
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

async function executeRpc(functionName, params, successMessage) {
  state.loading = true;
  render();
  const requestId = params.p_request_id || getAllDeliveries().find((delivery) => delivery.id === params.p_delivery_id)?.request?.id || null;
  const { error } = await supabase.rpc(functionName, params);
  if (error) throw error;
  state.modal = null;
  await loadAuthenticatedData(false);
  if (requestId) {
    delete state.events[requestId];
    await loadRequestEvents(requestId);
    state.selectedRequestId = requestId;
  }
  state.loading = false;
  setToast('success', successMessage);
  render();
}

async function submitLogin(form) {
  const data = new FormData(form);
  const login = String(data.get('login') || '').trim();
  const enteredPassword = String(data.get('password') || '');
  const email = state.loginPortal === 'school'
    ? buildSchoolLoginEmail(normalizeSchoolLogin(login))
    : login.toLowerCase();
  const password = state.loginPortal === 'school'
    ? toSupabaseSchoolPassword(enteredPassword)
    : enteredPassword;
  state.loading = true;
  render();

  const { data: authData, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', authData.user.id)
    .maybeSingle();
  if (profileError) throw profileError;
  if (!profile) {
    await supabase.auth.signOut();
    throw new Error('O perfil deste usuário não foi criado. Execute o SQL da versão 4 no Supabase.');
  }
  if (!profile.active) {
    await supabase.auth.signOut();
    throw new Error('Este acesso está desativado. Procure o administrador da SME.');
  }
  if (profile.account_type !== state.loginPortal) {
    await supabase.auth.signOut();
    const correct = profile.account_type === 'school' ? 'Escola' : 'SME';
    throw new Error(`Este usuário pertence ao portal ${correct}. Selecione o ambiente correto na tela de login.`);
  }

  state.session = authData.session;
  state.profile = profile;
  state.view = 'dashboard';
  await loadAuthenticatedData(false);
  state.loading = false;
  setToast('success', `Acesso realizado como ${profile.account_type === 'school' ? 'Escola' : 'SME'}.`);
  render();
}

async function handleForgotPassword() {
  if (state.loginPortal === 'school') {
    setToast('warning', 'A escola deve solicitar uma nova senha temporária ao administrador da SME.');
    render();
    return;
  }

  const field = app.querySelector('#login-form input[name="login"]');
  const email = field?.value?.trim() || '';
  state.modal = { type: 'forgotPassword', email };
  render();
}

async function submitForgotPassword(form) {
  const data = new FormData(form);
  const email = String(data.get('email') || '').trim().toLowerCase();
  if (!email) throw new Error('Informe o e-mail do seu acesso.');
  state.loading = true;
  render();
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
  state.loading = false;
  state.modal = null;
  if (error) throw error;
  setToast('success', 'As instruções de recuperação foram enviadas, caso o e-mail esteja cadastrado.');
  render();
}

async function submitPasswordChange(form) {
  const data = new FormData(form);
  const password = String(data.get('password') || '');
  const confirmation = String(data.get('confirmPassword') || '');
  if (password.length < 8) throw new Error('A nova senha deve ter ao menos 8 caracteres.');
  if (password !== confirmation) throw new Error('As senhas informadas não são iguais.');

  state.loading = true;
  render();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
  const { error: profileError } = await supabase.from('profiles').update({ must_change_password: false }).eq('id', state.session.user.id);
  if (profileError) throw profileError;
  state.profile.must_change_password = false;
  state.recoveryMode = false;
  state.loading = false;
  setToast('success', 'Senha atualizada com segurança.');
  render();
}

async function submitSchoolRequest(event) {
  const mode = event.submitter?.dataset.mode || 'draft';
  const draft = state.draft;
  if (!draft) throw new Error('O formulário do pedido não está disponível.');

  const validItems = draft.items
    .map((item) => ({ material_id: item.material_id, quantity: Number(String(item.quantity).replace(',', '.')), notes: item.notes || null }))
    .filter((item) => item.material_id && Number.isFinite(item.quantity) && item.quantity > 0);

  if (!draft.purpose.trim()) throw new Error('Informe a finalidade do pedido.');
  if (!validItems.length) throw new Error('Adicione pelo menos um material com quantidade válida.');
  const materialIds = validItems.map((item) => item.material_id);
  if (new Set(materialIds).size !== materialIds.length) throw new Error('O mesmo material foi adicionado mais de uma vez. Agrupe a quantidade em uma única linha.');

  state.loading = true;
  render();
  const { data: requestId, error } = await supabase.rpc('save_school_request', {
    p_request_id: draft.id || null,
    p_priority: draft.priority,
    p_purpose: draft.purpose.trim(),
    p_requested_delivery_date: draft.requestedDeliveryDate || null,
    p_notes: draft.notes || null,
    p_school_contact_name: draft.schoolContactName || null,
    p_school_contact_phone: draft.schoolContactPhone || null,
    p_items: validItems,
    p_submit: mode === 'submit'
  });
  if (error) throw error;

  state.draft = null;
  await loadAuthenticatedData(false);
  delete state.events[requestId];
  await loadRequestEvents(requestId);
  state.selectedRequestId = requestId;
  state.previousView = 'myRequests';
  state.view = 'requestDetail';
  state.loading = false;
  setToast('success', mode === 'submit' ? 'Pedido enviado à SME e protocolo gerado.' : 'Rascunho salvo com sucesso.');
  render();
}

async function submitAuthorization(form) {
  const request = getRequest(state.modal.requestId);
  const data = new FormData(form);
  const items = (request.request_items || []).map((item) => ({
    request_item_id: item.id,
    approved_quantity: Number(String(data.get(`approved_${item.id}`) || 0).replace(',', '.')),
    notes: String(data.get(`notes_${item.id}`) || '').trim() || null
  }));
  if (!items.some((item) => item.approved_quantity > 0)) throw new Error('Autorize ao menos um item ou rejeite o pedido.');
  await executeRpc('authorize_request', {
    p_request_id: request.id,
    p_items: items,
    p_authorization_notes: String(data.get('authorizationNotes') || '').trim() || null
  }, 'Pedido autorizado e quantidades registradas.');
}

async function submitRejection(form) {
  const data = new FormData(form);
  await executeRpc('reject_request', {
    p_request_id: state.modal.requestId,
    p_reason: String(data.get('reason') || '').trim()
  }, 'Pedido rejeitado. A escola já pode consultar o motivo.');
}

async function submitDispatch(form) {
  const request = getRequest(state.modal.requestId);
  const data = new FormData(form);
  const items = (request.request_items || []).map((item) => ({
    request_item_id: item.id,
    quantity: Number(String(data.get(`dispatch_${item.id}`) || 0).replace(',', '.')),
    notes: null
  })).filter((item) => item.quantity > 0);
  if (!items.length) throw new Error('Informe ao menos uma quantidade para a remessa.');

  await executeRpc('register_dispatch', {
    p_request_id: request.id,
    p_dispatch_date: String(data.get('dispatchDate') || ''),
    p_document_number: String(data.get('documentNumber') || '').trim() || null,
    p_delivered_by_name: String(data.get('deliveredByName') || '').trim(),
    p_delivered_by_department: String(data.get('deliveredByDepartment') || '').trim() || null,
    p_observations: String(data.get('observations') || '').trim() || null,
    p_items: items
  }, 'Remessa registrada. O pedido está em transporte.');
}

async function submitReceipt(form) {
  const data = new FormData(form);
  await executeRpc('register_delivery_receipt', {
    p_delivery_id: state.modal.deliveryId,
    p_receipt_date: String(data.get('receiptDate') || ''),
    p_received_by_name: String(data.get('receivedByName') || '').trim(),
    p_received_by_position: String(data.get('receivedByPosition') || '').trim() || null,
    p_received_by_document: String(data.get('receivedByDocument') || '').trim() || null,
    p_receipt_notes: String(data.get('receiptNotes') || '').trim() || null
  }, 'Recebimento registrado com sucesso.');
}

async function submitSchoolConfirmation(form) {
  const data = new FormData(form);
  if (!data.get('confirmed')) throw new Error('Marque a confirmação de recebimento.');
  await executeRpc('confirm_delivery_by_school', {
    p_delivery_id: state.modal.deliveryId,
    p_notes: String(data.get('notes') || '').trim() || null
  }, 'Recebimento confirmado pela escola.');
}

async function submitCancellation(form) {
  const data = new FormData(form);
  await executeRpc('cancel_request', {
    p_request_id: state.modal.requestId,
    p_reason: String(data.get('reason') || '').trim()
  }, 'Pedido cancelado e histórico atualizado.');
}

async function submitSchool(form) {
  const data = new FormData(form);
  const inep = normalizeSchoolLogin(data.get('inep')) || null;
  const loginCode = normalizeSchoolLogin(data.get('login_code')) || inep;
  const payload = {
    nome: String(data.get('nome') || '').trim(),
    codigo: String(data.get('codigo') || '').trim() || null,
    inep,
    login_code: loginCode,
    diretor: String(data.get('diretor') || '').trim() || null,
    telefone: String(data.get('telefone') || '').trim() || null,
    email: String(data.get('email') || '').trim() || null,
    bairro: String(data.get('bairro') || '').trim() || null,
    endereco: String(data.get('endereco') || '').trim() || null,
    observacoes: String(data.get('observacoes') || '').trim() || null,
    ativa: Boolean(data.get('ativa'))
  };
  state.loading = true;
  render();
  const isEdit = Boolean(state.modal.schoolId);
  const query = isEdit
    ? supabase.from('schools').update(payload).eq('id', state.modal.schoolId)
    : supabase.from('schools').insert(payload);
  const { error } = await query;
  if (error) throw error;
  state.modal = null;
  await refreshData(isEdit ? 'Escola atualizada.' : 'Escola cadastrada.');
}

async function deleteSchool(schoolId) {
  if (!isAdmin()) throw new Error('Somente administradores da SME podem excluir escolas.');
  const school = state.schools.find((item) => item.id === schoolId);
  if (!school) throw new Error('Escola não encontrada.');
  const usage = schoolUsage(schoolId);
  if (usage.requests > 0) {
    throw new Error('Esta escola possui pedidos ou movimentações. Para manter o histórico dos relatórios, desative a escola em vez de excluir.');
  }

  state.loading = true;
  render();
  const { error } = await supabase.from('schools').delete().eq('id', schoolId);
  if (error) {
    const message = String(error.message || '');
    if (message.includes('foreign key') || message.includes('violates')) {
      throw new Error('Não foi possível excluir porque há registros vinculados a esta escola. Desative a escola para preservar o histórico.');
    }
    throw error;
  }
  state.modal = null;
  await refreshData('Escola excluída com sucesso.');
}

async function submitMaterial(form) {
  const data = new FormData(form);
  const minimum = String(data.get('quantidade_minima') || '').trim();
  const payload = {
    nome: String(data.get('nome') || '').trim(),
    codigo: String(data.get('codigo') || '').trim() || null,
    categoria: String(data.get('categoria') || '').trim() || null,
    unidade: String(data.get('unidade') || '').trim(),
    quantidade_minima: minimum ? Number(minimum.replace(',', '.')) : null,
    descricao: String(data.get('descricao') || '').trim() || null,
    ativo: Boolean(data.get('ativo'))
  };
  state.loading = true;
  render();
  const isEdit = Boolean(state.modal.materialId);
  const query = isEdit
    ? supabase.from('materials').update(payload).eq('id', state.modal.materialId)
    : supabase.from('materials').insert(payload);
  const { error } = await query;
  if (error) throw error;
  state.modal = null;
  await refreshData(isEdit ? 'Material atualizado.' : 'Material cadastrado.');
}

async function submitUserCreate(form) {
  const data = new FormData(form);
  const accountType = String(data.get('accountType') || 'school');
  const body = {
    fullName: String(data.get('fullName') || '').trim(),
    email: String(data.get('email') || '').trim(),
    phone: String(data.get('phone') || '').trim(),
    position: String(data.get('position') || '').trim(),
    accountType,
    schoolId: accountType === 'school' ? String(data.get('schoolId') || '') : null,
    permissionLevel: accountType === 'sme' ? String(data.get('permissionLevel') || 'sme_operator') : 'school_user',
    password: String(data.get('password') || '')
  };
  state.loading = true;
  render();
  const response = await fetch('/api/users/create', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${state.session.access_token}`
    },
    body: JSON.stringify(body)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Não foi possível criar o usuário. Em teste local, use npm run pages:dev para carregar a função do Cloudflare.');
  await loadAuthenticatedData(false);
  state.loading = false;
  state.modal = { type: 'passwordResult', password: result.temporaryPassword };
  setToast('success', 'Usuário criado com sucesso.');
  render();
}

async function submitSchoolImport(form) {
  const data = new FormData(form);
  const file = data.get('csvFile');
  if (!(file instanceof File) || !file.size) throw new Error('Selecione o arquivo CSV com as escolas.');
  if (file.size > 2 * 1024 * 1024) throw new Error('O arquivo é muito grande. O limite é 2 MB.');

  const parsed = parseSchoolAccessCsv(await file.text());
  if (parsed.errors.length) {
    const details = parsed.errors.slice(0, 8).join(' ');
    const remaining = parsed.errors.length > 8 ? ` Há mais ${parsed.errors.length - 8} erro(s).` : '';
    throw new Error(`Corrija o arquivo antes de importar. ${details}${remaining}`);
  }
  if (!parsed.rows.length) throw new Error('Nenhuma escola válida foi encontrada no arquivo.');

  const overwritePasswords = Boolean(data.get('overwritePasswords'));
  const chunks = [];
  for (let index = 0; index < parsed.rows.length; index += 20) chunks.push(parsed.rows.slice(index, index + 20));

  const summary = {
    total: parsed.rows.length,
    createdUsers: 0,
    updatedUsers: 0,
    linkedUsers: 0,
    createdSchools: 0,
    errors: 0
  };
  const results = [];

  state.loading = true;
  render();

  for (let index = 0; index < chunks.length; index += 1) {
    const response = await fetch('/api/users/import-schools', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${state.session.access_token}`
      },
      body: JSON.stringify({ rows: chunks[index], overwritePasswords })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('A API de importação não foi encontrada. Para importar escolas localmente, abra o sistema com npm.cmd run dev ou npm.cmd run pages:dev, não use o servidor Vite puro na porta 5173.');
      }
      throw new Error(result.error || `Não foi possível processar o lote ${index + 1}. Código HTTP: ${response.status}.`);
    }

    summary.createdUsers += Number(result.summary?.createdUsers || 0);
    summary.updatedUsers += Number(result.summary?.updatedUsers || 0);
    summary.linkedUsers += Number(result.summary?.linkedUsers || 0);
    summary.createdSchools += Number(result.summary?.createdSchools || 0);
    summary.errors += Number(result.summary?.errors || 0);
    results.push(...(result.results || []));
  }

  await loadAuthenticatedData(false);
  state.loading = false;
  state.modal = { type: 'schoolImportResult', summary, results, sourceFile: file.name };
  setToast(summary.errors ? 'warning' : 'success', summary.errors
    ? `Importação concluída com ${summary.errors} item(ns) para revisar.`
    : `${summary.createdUsers} acesso(s) criado(s) com sucesso.`);
  render();
}

async function submitUserEdit(form) {
  const profile = state.profiles.find((item) => item.id === state.modal.profileId);
  const data = new FormData(form);
  const accountType = String(data.get('accountType') || 'school');
  await executeRpc('admin_update_profile', {
    p_profile_id: profile.id,
    p_full_name: String(data.get('fullName') || '').trim(),
    p_account_type: accountType,
    p_permission_level: accountType === 'school' ? 'school_user' : String(data.get('permissionLevel') || 'sme_operator'),
    p_school_id: accountType === 'school' ? String(data.get('schoolId') || '') || null : null,
    p_active: Boolean(data.get('active')),
    p_position: String(data.get('position') || '').trim() || null,
    p_phone: String(data.get('phone') || '').trim() || null
  }, 'Acesso do usuário atualizado.');
}

async function resetUserPassword(profileId) {
  const profile = state.profiles.find((item) => item.id === profileId);
  openConfirm({
    title: 'Redefinir senha temporária',
    message: `Gerar uma nova senha temporária para ${profile?.full_name || profile?.email || 'este usuário'}? A senha atual deixará de funcionar.`,
    confirmLabel: 'Gerar senha temporária',
    tone: 'danger',
    onConfirm: async () => {
      state.loading = true;
      render();
      const response = await fetch('/api/users/reset-password', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${state.session.access_token}`
        },
        body: JSON.stringify({ profileId })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Não foi possível redefinir a senha.');
      await loadAuthenticatedData(false);
      state.loading = false;
      state.modal = { type: 'passwordResult', password: result.temporaryPassword };
      render();
    }
  });
  render();
}

async function submitSettings(form) {
  const data = new FormData(form);
  const payload = {
    municipality_name: String(data.get('municipality_name') || '').trim(),
    department_name: String(data.get('department_name') || '').trim(),
    report_title: String(data.get('report_title') || '').trim(),
    logo_url: String(data.get('logo_url') || '').trim(),
    compact_logo_url: String(data.get('compact_logo_url') || '').trim(),
    planning_logo_url: String(data.get('planning_logo_url') || '').trim(),
    address: String(data.get('address') || '').trim() || null,
    phone: String(data.get('phone') || '').trim() || null,
    email: String(data.get('email') || '').trim() || null,
    footer_text: String(data.get('footer_text') || '').trim() || null,
    updated_by: state.session.user.id
  };
  state.loading = true;
  render();
  const { error } = await supabase.from('system_settings').update(payload).eq('id', 1);
  if (error) throw error;
  await refreshData('Configurações institucionais atualizadas.');
}

async function submitProfile(form) {
  const data = new FormData(form);
  state.loading = true;
  render();
  const { error } = await supabase.from('profiles').update({
    full_name: String(data.get('full_name') || '').trim(),
    phone: String(data.get('phone') || '').trim() || null,
    position: String(data.get('position') || '').trim() || null
  }).eq('id', state.profile.id);
  if (error) throw error;
  await refreshData('Perfil atualizado.');
}

async function submitOwnPassword(form) {
  const data = new FormData(form);
  const password = String(data.get('password') || '');
  const confirmation = String(data.get('confirmPassword') || '');
  if (password.length < 8) throw new Error('A senha deve ter ao menos 8 caracteres.');
  if (password !== confirmation) throw new Error('As senhas não são iguais.');
  state.loading = true;
  render();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
  state.loading = false;
  state.modal = null;
  setToast('success', 'Senha alterada com sucesso.');
  render();
}

function reportHeaderHtml(title, subtitle = '') {
  const inst = institution();
  const logoUrl = (() => { try { return new URL(inst.logoUrl, window.location.origin).href; } catch { return inst.logoUrl; } })();
  return `<header class="print-header"><div class="print-header-brand"><img src="${attr(logoUrl)}" alt="Prefeitura Municipal de Canindé e Secretaria de Educação" /></div><div class="print-header-title"><span>${escapeHtml(inst.municipalityName)}</span><strong>${escapeHtml(inst.departmentName)}</strong><h1>${escapeHtml(title)}</h1>${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ''}</div></header>`;
}

function printDocument(title, body) {
  const popup = window.open('', '_blank', 'width=1100,height=800');
  if (!popup) {
    setToast('warning', 'O navegador bloqueou a janela de impressão. Libere pop-ups para este site.');
    render();
    return;
  }
  const inst = institution();
  popup.document.open();
  popup.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>${PRINT_STYLES}</style></head><body>${body}<footer class="footer">${escapeHtml(inst.footerText || `${inst.departmentName} • Documento gerado em ${formatDateTime(new Date().toISOString())}`)}</footer><script>window.addEventListener('load',()=>setTimeout(()=>window.print(),350));<\/script></body></html>`);
  popup.document.close();
}

function printRequest(request) {
  if (!request) return;
  const totals = requestTotals(request);
  const body = `
    ${reportHeaderHtml('Relatório do Pedido', `${request.protocol_number} • ${request.schools?.nome || getSchoolName(request.school_id)}`)}
    <div class="print-meta"><div><span>Protocolo</span><strong>${escapeHtml(request.protocol_number)}</strong></div><div><span>Situação</span><strong>${escapeHtml((isSchool() ? STATUS[request.status]?.school : STATUS[request.status]?.label) || request.status)}</strong></div><div><span>Prioridade</span><strong>${escapeHtml(PRIORITY[request.priority]?.label || request.priority)}</strong></div><div><span>Data do pedido</span><strong>${formatDate(request.submitted_at || request.created_at)}</strong></div></div>
    <div class="print-box"><span class="print-label">Finalidade</span><strong>${escapeHtml(request.purpose)}</strong><p>${escapeHtml(request.notes || '')}</p></div>
    <h2>Materiais solicitados</h2>
    <table><thead><tr><th>Material</th><th>Unidade</th><th>Solicitado</th><th>Autorizado</th><th>Entregue</th><th>Observações</th></tr></thead><tbody>${(request.request_items || []).map((item) => `<tr><td>${escapeHtml(item.material_name_snapshot)}</td><td>${escapeHtml(item.unit_snapshot)}</td><td class="num">${formatNumber(item.requested_quantity)}</td><td class="num">${formatNumber(item.approved_quantity)}</td><td class="num">${formatNumber(deliveredQuantityForItem(request, item.id))}</td><td>${escapeHtml([item.school_notes, item.sme_notes].filter(Boolean).join(' / ') || '—')}</td></tr>`).join('')}</tbody><tfoot><tr><th colspan="2">Totais</th><th class="num">${formatNumber(totals.requested)}</th><th class="num">${formatNumber(totals.approved)}</th><th class="num">${formatNumber(totals.delivered)}</th><th></th></tr></tfoot></table>
    <h2>Responsáveis</h2><div class="audit-grid"><div class="print-box"><span class="print-label">Registrado por</span><strong>${escapeHtml(request.created_by_name || '—')}</strong><p>${escapeHtml(request.created_by_email || '')}</p></div><div class="print-box"><span class="print-label">Recebido na SME por</span><strong>${escapeHtml(request.received_by_name || '—')}</strong><p>${request.received_at ? formatDateTime(request.received_at) : ''}</p></div><div class="print-box"><span class="print-label">Autorizado por</span><strong>${escapeHtml(request.authorized_by_name || '—')}</strong><p>${request.authorized_at ? formatDateTime(request.authorized_at) : ''}</p></div></div>
    ${(request.deliveries || []).length ? `<h2>Remessas e recebimentos</h2>${request.deliveries.map((delivery) => `<div class="delivery-block"><div class="delivery-head"><strong>${escapeHtml(delivery.delivery_number || 'Remessa')}</strong><span>${escapeHtml(delivery.status === 'delivered' ? 'Recebida' : 'Em transporte')}</span></div><div class="print-meta"><div><span>Saída</span><strong>${formatDate(delivery.dispatch_date || delivery.delivery_date)}</strong></div><div><span>Entregador</span><strong>${escapeHtml(delivery.delivered_by_name || '—')}</strong></div><div><span>Recebimento</span><strong>${delivery.status === 'delivered' ? formatDate(delivery.receipt_date || delivery.delivery_date) : 'Pendente'}</strong></div><div><span>Recebedor</span><strong>${escapeHtml(delivery.received_by_name || '—')}</strong></div></div><table><thead><tr><th>Material</th><th>Quantidade</th><th>Unidade</th></tr></thead><tbody>${(delivery.delivery_items || []).map((item) => `<tr><td>${escapeHtml(item.material_name_snapshot)}</td><td class="num">${formatNumber(item.quantity)}</td><td>${escapeHtml(item.unit_snapshot || '')}</td></tr>`).join('')}</tbody></table><p><strong>Registro da saída:</strong> ${escapeHtml(delivery.registered_by_name || '—')} • <strong>Registro do recebimento:</strong> ${escapeHtml(delivery.receipt_registered_by_name || '—')} • <strong>Confirmação da escola:</strong> ${delivery.school_confirmed_at ? formatDateTime(delivery.school_confirmed_at) : 'Pendente'}</p></div>`).join('')}` : ''}
    <div class="signature-grid"><div class="signature">Responsável da SME</div><div class="signature">Responsável da escola</div></div>`;
  printDocument(`Pedido ${request.protocol_number}`, body);
}

function printCurrentReport() {
  const { requests, materials, deliveries } = getReportData();
  const title = state.report.type === 'orders' ? 'Relatório de Pedidos' : state.report.type === 'materials' ? 'Relatório Consolidado de Materiais' : 'Relatório de Entregas';
  const selectedSchool = isSchool() ? getSchoolName(state.profile.school_id) : state.report.schoolId === 'all' ? 'Todas as escolas' : getSchoolName(state.report.schoolId);
  let table = '';

  if (state.report.type === 'orders') {
    const summaryRows = requests.map((request) => {
      const t = requestTotals(request);
      return `<tr><td>${escapeHtml(request.protocol_number)}</td><td>${escapeHtml(request.schools?.nome || getSchoolName(request.school_id))}</td><td>${formatDate(request.submitted_at || request.created_at)}</td><td>${escapeHtml(STATUS[request.status]?.label || request.status)}</td><td class="num">${request.request_items?.length || 0}</td><td class="num">${formatNumber(t.requested)}</td><td class="num">${formatNumber(t.approved)}</td><td class="num">${formatNumber(t.delivered)}</td></tr>`;
    }).join('');
    const detailedRows = requests.map((request) => {
      const totals = requestTotals(request);
      return `<section class="order-report-block"><h2>Pedido ${escapeHtml(request.protocol_number)}</h2><div class="print-meta"><div><span>Escola</span><strong>${escapeHtml(request.schools?.nome || getSchoolName(request.school_id))}</strong></div><div><span>Data do pedido</span><strong>${formatDate(request.submitted_at || request.created_at)}</strong></div><div><span>Situação</span><strong>${escapeHtml(STATUS[request.status]?.label || request.status)}</strong></div><div><span>Produtos</span><strong>${request.request_items?.length || 0}</strong></div></div><div class="print-box"><span class="print-label">Finalidade</span><strong>${escapeHtml(request.purpose || '—')}</strong><p>${escapeHtml(request.notes || '')}</p></div>${renderRequestItemsReportBlock(request, { print: true })}<div class="print-meta"><div><span>Total solicitado</span><strong>${formatNumber(totals.requested)}</strong></div><div><span>Total autorizado</span><strong>${formatNumber(totals.approved)}</strong></div><div><span>Total entregue</span><strong>${formatNumber(totals.delivered)}</strong></div><div><span>Saldo autorizado</span><strong>${formatNumber(Math.max(0, totals.approved - totals.delivered))}</strong></div></div><div class="audit-grid"><div class="print-box"><span class="print-label">Registrado por</span><strong>${escapeHtml(request.created_by_name || '—')}</strong><p>${escapeHtml(request.created_by_email || '')}</p></div><div class="print-box"><span class="print-label">Recebido na SME por</span><strong>${escapeHtml(request.received_by_name || '—')}</strong><p>${request.received_at ? formatDateTime(request.received_at) : ''}</p></div><div class="print-box"><span class="print-label">Autorizado por</span><strong>${escapeHtml(request.authorized_by_name || '—')}</strong><p>${request.authorized_at ? formatDateTime(request.authorized_at) : ''}</p></div></div></section>`;
    }).join('');
    table = `<h2>Resumo dos pedidos</h2><table><thead><tr><th>Protocolo</th><th>Escola</th><th>Data</th><th>Situação</th><th>Produtos</th><th>Solicitado</th><th>Autorizado</th><th>Entregue</th></tr></thead><tbody>${summaryRows}</tbody></table><h2>Produtos discriminados por pedido</h2>${detailedRows}`;
  } else if (state.report.type === 'materials') {
    table = `<table><thead><tr><th>Material</th><th>Unidade</th><th>Pedidos</th><th>Escolas</th><th>Solicitado</th><th>Autorizado</th><th>Entregue</th></tr></thead><tbody>${materials.map((item) => `<tr><td>${escapeHtml(item.material)}</td><td>${escapeHtml(item.unit)}</td><td class="num">${item.requests.size}</td><td class="num">${item.schools.size}</td><td class="num">${formatNumber(item.requested)}</td><td class="num">${formatNumber(item.approved)}</td><td class="num">${formatNumber(item.delivered)}</td></tr>`).join('')}</tbody></table>`;
  } else {
    table = `<table><thead><tr><th>Remessa</th><th>Pedido</th><th>Escola</th><th>Saída</th><th>Recebimento</th><th>Autorizado por</th><th>Entregador</th><th>Recebedor</th><th>Registro da saída</th><th>Registro do recebimento</th></tr></thead><tbody>${deliveries.map((delivery) => `<tr><td>${escapeHtml(delivery.delivery_number || '—')}</td><td>${escapeHtml(delivery.request.protocol_number)}</td><td>${escapeHtml(delivery.request.schools?.nome || getSchoolName(delivery.request.school_id))}</td><td>${formatDate(delivery.dispatch_date || delivery.delivery_date)}</td><td>${delivery.status === 'delivered' ? formatDate(delivery.receipt_date || delivery.delivery_date) : 'Pendente'}</td><td>${escapeHtml(delivery.request.authorized_by_name || '—')}</td><td>${escapeHtml(delivery.delivered_by_name || '—')}</td><td>${escapeHtml(delivery.received_by_name || '—')}</td><td>${escapeHtml(delivery.registered_by_name || '—')}</td><td>${escapeHtml(delivery.receipt_registered_by_name || 'Pendente')}</td></tr>`).join('')}</tbody></table>`;
  }

  const body = `${reportHeaderHtml(title, `${selectedSchool} • ${formatDate(state.report.startDate)} a ${formatDate(state.report.endDate)}`)}<div class="print-meta"><div><span>Período inicial</span><strong>${formatDate(state.report.startDate)}</strong></div><div><span>Período final</span><strong>${formatDate(state.report.endDate)}</strong></div><div><span>Escola</span><strong>${escapeHtml(selectedSchool)}</strong></div><div><span>Registros</span><strong>${state.report.type === 'orders' ? requests.length : state.report.type === 'materials' ? materials.length : deliveries.length}</strong></div></div>${table || '<p>Nenhum registro encontrado.</p>'}`;
  printDocument(title, body);
}

function csvCell(value) {
  const text = String(value ?? '').replaceAll('"', '""');
  return `"${text}"`;
}

function downloadCsv(filename, rows) {
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

function downloadTextFile(filename, content, type = 'text/plain;charset=utf-8') {
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

function downloadSchoolImportTemplate() {
  downloadTextFile('modelo-importacao-escolas.csv', `\uFEFF${createSchoolImportTemplate()}`, 'text/csv;charset=utf-8');
}

function downloadSchoolImportReport() {
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

function exportCurrentReport() {
  const { requests, materials, deliveries } = getReportData();
  const stamp = `${state.report.startDate}_${state.report.endDate}`;

  if (state.report.type === 'orders') {
    const rows = [[
      'Protocolo', 'Escola', 'Data do pedido', 'Finalidade', 'Prioridade', 'Situação',
      'Material', 'Categoria', 'Unidade', 'Quantidade solicitada', 'Quantidade autorizada', 'Quantidade entregue', 'Saldo autorizado',
      'Observação da escola', 'Observação da SME', 'Registrado por', 'Recebido na SME por', 'Autorizado por'
    ]];
    requests.forEach((request) => {
      const itemRows = requestItemReportRows(request);
      if (!itemRows.length) {
        rows.push([
          request.protocol_number,
          request.schools?.nome || getSchoolName(request.school_id),
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
        request.schools?.nome || getSchoolName(request.school_id),
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
    deliveries.forEach((delivery) => rows.push([delivery.delivery_number, delivery.request.protocol_number, delivery.request.schools?.nome || getSchoolName(delivery.request.school_id), delivery.document_number, formatDate(delivery.dispatch_date || delivery.delivery_date), delivery.status === 'delivered' ? formatDate(delivery.receipt_date || delivery.delivery_date) : '', delivery.request.authorized_by_name, delivery.delivered_by_name, delivery.received_by_name, delivery.registered_by_name, delivery.receipt_registered_by_name, delivery.school_confirmed_at ? formatDateTime(delivery.school_confirmed_at) : 'Pendente']));
    downloadCsv(`relatorio-entregas-${stamp}.csv`, rows);
  }
  setToast('success', 'Arquivo CSV gerado.');
  render();
}

initialize();
