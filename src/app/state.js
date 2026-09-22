import { todayISO, firstDayOfYearISO } from '../utils/formatters.js';

// Objeto de estado global mutável. Exportado por referência (const) para que
// os diversos módulos e funções que mutam `state` diretamente continuem
// compartilhando a mesma instância, preservando a semântica original do monólito.
export const state = {
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

// Zera o estado sensível (perfil, dados carregados e seleção corrente) ao
// encerrar a sessão. Movido do monólito application.js sem alteração de
// comportamento; usado no logout e no callback onAuthStateChange.
export function resetSecureState() {
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

// Render bus: application.js registra a função render() aqui, para que os
// módulos de infraestrutura (supabase, pwa, print, downloads) possam solicitar
// uma nova renderização sem depender diretamente de application.js (evita ciclo).
let renderer = () => {};

export function setRenderer(fn) {
  renderer = typeof fn === 'function' ? fn : (() => {});
}

export function render() {
  return renderer();
}
